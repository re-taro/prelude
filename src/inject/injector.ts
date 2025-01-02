import type { EnumLike } from "../types.js";
import { instanceId } from "./_internal/instance_ids.js";
import {
	ErrorAsyncGetMol,
	ErrorAsyncGetScope,
	ErrorBadUse,
	ErrorInvalidMolecule,
	ErrorInvalidScope,
	ErrorUnboundMolecule,
} from "./_internal/errors.js";
import type {
	AnyMolecule,
	AnyMoleculeInterface,
	AnyMoleculeScope,
	AnyScopeTuple,
	MoleculeCacheValue,
	MoleculeInternal,
} from "./_internal/types.js";
import { scopeTupleSort } from "./_internal/scope_tuple_sort.js";
import { GetterSymbol, Injector, TypeSymbol } from "./_internal/symbols.js";
import {
	isMolecule,
	isMoleculeInterface,
	isMoleculeScope,
} from "./_internal/utils.js";
import { createDeepCache } from "./_internal/weak_cache.js";
import type { CleanupCallback, InternalUse, MountedCallback } from "./lifecycle.js";
import { onMountImpl, useImpl } from "./lifecycle.js";
import type {
	Molecule,
	MoleculeGetter,
	MoleculeOrInterface,
	ScopeGetter,
} from "./molecule.js";
import { createScope } from "./scope.js";
import type { ScopeSubscription } from "./_internal/scoper.js";
import { createScoper } from "./_internal/scoper.js";
import type { BindingMap, Bindings, Injectable, ScopeTuple } from "./types.js";

const InternalOnlyGlobalScope = createScope(
	Symbol("inject.global.scope.value"),
	{ debugLabel: "Global Scope" },
);

interface UseScopeDetails {
	defaultScopes: Set<AnyMoleculeScope>;
	value: unknown;
}

type Unsub = () => unknown;

/**
 * Builds the graphs of molecules that make up your application.
 *
 * The injector tracks the dependencies for each molecule and uses bindings to inject them.
 *
 * This "behind-the-scenes" operation is what distinguishes dependency injection from its cousin, the service locator pattern.
 *
 * From Dependency Injection: https://en.wikipedia.org/wiki/Dependency_injection
 *
 * > The injector, sometimes also called an assembler, container, provider or factory, introduces services to the client.
 * > The role of injectors is to construct and connect complex object graphs, where objects may be both clients and services.
 * > The injector itself may be many objects working together, but must not be the client, as this would create a circular dependency.
 * > Because dependency injection separates how objects are constructed from how they are used,
 * > it often diminishes the importance of the `new` keyword found in most object-oriented languages.
 * > Because the framework handles creating services, the programmer tends to only directly construct value objects which represents entities
 * > in the program's domain (such as an Employee object in a business app or an Order object in a shopping app).
 *
 * This is the core of inject, although you may rarely interact with it directly.
 */
export type MoleculeInjector = Record<symbol, unknown> & {
	/**
	 * Use and memoize scopes.
	 *
	 * Returns a function to cleanup scope tuples.
	 *
	 * @param scopes
	 */
	createSubscription: () => ScopeSubscription;

	/**
	 * Get the molecule value for an optional scope. Expects scope tuples to be memoized ahead of time.
	 *
	 * @param molecule
	 * @param scopes
	 */
	get: <T>(molecule: MoleculeOrInterface<T>, ...scopes: AnyScopeTuple[]) => T;

	/**
	 * Use a molecule, and memoizes scope tuples.
	 *
	 * Returns a function to cleanup scope tuples.
	 *
	 * @param molecule
	 * @param scopes
	 */
	use: <T>(
		molecule: MoleculeOrInterface<T>,
		...scopes: AnyScopeTuple[]
	) => [T, Unsub];

	/**
	 * Use a molecule, and memoizes scope tuples.
	 *
	 * Returns a function to cleanup scope tuples.
	 *
	 * @param molecule
	 * @param scopes
	 */
	useLazily: <T>(
		molecule: MoleculeOrInterface<T>,
		...scopes: AnyScopeTuple[]
	) => [T, { start: () => T; stop: Unsub }];

	/**
	 * Use and memoize scopes.
	 *
	 * Returns a function to cleanup scope tuples.
	 *
	 * @param scopes
	 */
	useScopes: (...scopes: AnyScopeTuple[]) => [AnyScopeTuple[], Unsub];
};

/**
 * Optional properties for creating a {@link MoleculeInjector} via {@link createInjector}
 */
export interface CreateInjectorProps {
	/**
	 * A set of bindings to replace the implemenation of a {@link MoleculeInterface} or
	 * a {@link Molecule} with another {@link Molecule}.
	 *
	 * Bindings are useful for swapping out implementations of molecules during testing,
	 * and for library authors to create shareable molecules that may not have a default
	 * implementation
	 */
	bindings?: Bindings;
}

function bindingsToMap(bindings?: Bindings): BindingMap {
	if (typeof bindings === "undefined")
		return new Map();
	if (Array.isArray(bindings)) {
		return new Map(bindings);
	}
	// Clones the map to prevent future editing of the original
	return new Map(bindings.entries());
}

const MoleculeSubscriptionState = {
	ACTIVE: "ACTIVE",
	INITIAL: "INITIAL",
	STOPPED: "STOPPED",
} as const;
type MoleculeSubscriptionState = EnumLike<typeof MoleculeSubscriptionState>;

/**
 * Creates a {@link MoleculeInjector}
 *
 * This is the core stateful component of `inject` and can have interfaces bound to implementations here.
 *
 * @example
 * Create an injector with bindings
 *
 * ```ts
 * const NumberMolecule = moleculeInterface<number>();
 * const RandomNumberMolecule = molecule<number>(()=>Math.random());
 *
 * const injector = createInjector({
 *     bindings:[[NumberMolecule,RandomNumberMolecule]]
 * })
 * ```
 */
export function createInjector(
	injectorProps: CreateInjectorProps = {},
): MoleculeInjector {
	/*
   *
   *
   *     State
   *
   *
   */
	const moleculeCache = createDeepCache<
    AnyMolecule | AnyScopeTuple,
		MoleculeCacheValue
	>();

	/**
	 * The Dependency Cache reduces the number of times that a molecule needs
	 * to be run to determine it's dependencies.
	 *
	 * Give a molecule, what scopes might it depend on?
	 */
	const dependencyCache: WeakMap<
		/**
		 * The key is the molecule itself
		 */
		AnyMolecule,
		/**
		 * This can be a weak set because it's only ever used to determine
		 * if the scopes in context should apply to this molecule.
		 *
		 * For example:
		 *  - Molecule is used with scopes context A, B and C
		 *  - This set contains B, C and D
		 *  - The relevant scopes are B and C
		 *  - This set doesn't need to be iterable, because the scope context (e.g. A, B and C) is iterable
		 */
		Set</**
						 * We only need to store the scope keys, not the scope values.
						 */
			AnyMoleculeScope
		>
	> = new WeakMap();

	const bindings = bindingsToMap(injectorProps.bindings);

	/**
	 * The scoper contains all the subscriptions and leases for managing scope lifecycle,
	 * ensuring scope tuples are memoizable keys for use in the injector.
	 *
	 *  - The scoper keeps track of "how long should this thing be alive"?
	 *  - The injector keeps track of the instances of the things, and all dependency magic
	 */
	const scoper = createScoper();

	/**
	 * Lookup bindings to override a molecule, or throw an error for unbound interfaces
	 *
	 */
	function getTrueMolecule<T>(
		molOrIntf: MoleculeOrInterface<T>,
	): MoleculeInternal<T> {
		const bound = bindings.get(molOrIntf);
		if (typeof bound !== "undefined")
			return bound as MoleculeInternal<T>;
		if (isMolecule(molOrIntf))
			return molOrIntf as MoleculeInternal<T>;

		throw new Error(ErrorUnboundMolecule);
	}

	function getInternal<T>(
		m: Molecule<T>,
		props: CreationProps,
	): MoleculeCacheValue {
		const cachedDeps = dependencyCache.get(m);

		if (typeof cachedDeps !== "undefined") {
			/**
			 * Stage 1 cache
			 *
			 * If we have hit this case, then the molecule has been run at least once
			 * before, and during that run produced a set of scope keys that it
			 * depends on.
			 *
			 * We don't support conditional dependencies, and that case is caught
			 * if we run a molecule twice and it has a different set of dependencies.
			 */

			const relevantScopes = props.scopes.filter(tuple =>
				cachedDeps.has(tuple[0]),
			);

			const deps = getCachePath(relevantScopes, m);
			const cachedValue = moleculeCache.get(deps);

			if (typeof cachedValue !== "undefined") {
				// Extend the lease to include the any default scopes
				// that are implicitly leased
				cachedValue.deps.defaultScopes.forEach((s) => {
					props.lease(s.defaultTuple);
				});

				return cachedValue;
			}
			else {
				/**
				 * Fall through to Stage 2 cache
				 *
				 * We don't want to be creating anything new here, we
				 * just want to fall back to the regular handling of
				 * molecules
				 */
			}
		}
		const { previous } = props;
		if (previous !== false) {
			return moleculeCache.deepCache(
				() => previous,
				() => { },
				previous.path,
			);
		}
		return runAndCache<T>(m, props);
	}

	function multiCache(
		mol: AnyMolecule,
		scopes: AnyScopeTuple[],
		createFn: () => Omit<Omit<MoleculeCacheValue, "path">, "instanceId">,
		foundFn: (found: MoleculeCacheValue) => void,
	): MoleculeCacheValue | undefined {
		const deps = getCachePath(scopes, mol);

		const cached = moleculeCache.deepCache(
			() => {
				const innerCached = {
					...createFn(),
					instanceId: instanceId(),
					path: deps,
				};

				return innerCached;
			},
			foundFn,
			deps,
		);
		return cached;
	}

	function runAndCache<T>(
		m: Molecule<T>,
		props: CreationProps,
	): MoleculeCacheValue {
		const getScopeValue = (scope: AnyMoleculeScope): UseScopeDetails => {
			const defaultScopes = new Set<AnyMoleculeScope>();

			const found = props.scopes.find(([key]) => key === scope);
			if (typeof found !== "undefined") {
				const isDefaultValue = found[1] === found[0].defaultValue;
				if (!isDefaultValue) {
					/**
					 * Return early when a default scope value is being used explicitly.
					 * This prevent us from "forking" and have multiple scope
					 * tuples to use as keys when the default tuple will do
					 */
					return {
						defaultScopes,
						value: found[1],
					};
				}
				else {
					// Fallthrough the default value handling below
				}
			}

			defaultScopes.add(scope);
			return {
				defaultScopes,
				value: scope.defaultValue,
			};
		};

		const mounted = runMolecule(
			m,
			getScopeValue,
			m => getInternal(m, props),
			getTrueMolecule,
		);

		const relatedScope = props.scopes.filter(([key]) =>
			mounted.deps.allScopes.has(key),
		);

		if (dependencyCache.has(m)) {
			const cachedDeps = dependencyCache.get(m)!;
			if (mounted.deps.allScopes.size !== cachedDeps?.size) {
				throw new Error(
					"Molecule is using conditional dependencies. This is not supported.",
				);
			}
			let mismatch = false;
			mounted.deps.allScopes.forEach((s) => {
				if (!cachedDeps.has(s)) {
					mismatch = true;
				}
			});
			if (mismatch) {
				throw new Error(
					"Molecule is using conditional dependencies. This is not supported.",
				);
			}
		}
		else {
			dependencyCache.set(m, mounted.deps.allScopes);
		}
		return multiCache(
			m,
			relatedScope,
			() => {
				// No molecule exists, so mount a new one
				mounted.deps.defaultScopes.forEach((s) => {
					props.lease(s.defaultTuple);
				});
				const created = {
					deps: mounted.deps,
					isMounted: false,
					value: mounted.value,
				};
				return created;
			},
			(found) => {
				// Extend the lease to include the any default scopes
				// that are implicitly leased
				found.deps.defaultScopes.forEach((s) => {
					props.lease(s.defaultTuple);
				});
			},
		) as MoleculeCacheValue;
	}

	function runMount(mol: MoleculeCacheValue) {
		if (mol.isMounted) {
			// Don't re-run a molecule
			return mol;
		}

		// Don't re-run
		mol.isMounted = true;

		// Recurses through the transient dependencies
		mol.deps.buddies.forEach(runMount);

		const cleanupSet = new Set<CleanupCallback>();

		mol.deps.mountedCallbacks.forEach((onMount) => {
			// Call all the mount functions for the molecule
			const cleanup = onMount();

			// Queues up the cleanup functions for later
			if (cleanup) {
				cleanupSet.add(cleanup);
			}
		});

		cleanupSet.add(() => {
			/**
			 * Purge the molecule cache when the scope set is released
			 *
			 * Since the moleculeCache is a weak cache, it will be cleaned up
			 * automatically when scopes and molecules are garbage collected,
			 * but if they aren't garbage collected, then there will continue to
			 * be a cached molecule value stored, and then lifecycle hooks will never be
			 * run.
			 *
			 * Without this repeated calls to `injector.use` would not create
			 * new values, and would not run lifecycle hooks (mount, unmount).
			 */
			moleculeCache.remove(...mol.path);
			mol.isMounted = false;
		});

		/**
		 * Used scopes are different than the molecule path.
		 *
		 * The molecule path is simplified because ignores any default scope tuples.
		 *
		 * But registering cleanups, we still need to listen to unmounts for default scopes
		 */
		const usedDefaultScopes = Array.from(mol.deps.defaultScopes.values()).map(
			s => s.defaultTuple,
		);
		scoper.registerCleanups(usedDefaultScopes, cleanupSet);

		/**
		 * These are the scopes that were implicitly provided when the molecule
		 * was created
		 */
		const usedScopes = mol.path.filter(molOrScope =>
			Array.isArray(molOrScope),
		) as AnyScopeTuple[];
		scoper.registerCleanups(usedScopes, cleanupSet);

		return mol;
	}

	function get<T>(m: MoleculeOrInterface<T>, ...scopes: AnyScopeTuple[]): T {
		const [value, _] = use(m, ...scopes);
		return value;
	}

	function use<T>(
		m: MoleculeOrInterface<T>,
		...scopes: AnyScopeTuple[]
	): [T, Unsub] {
		const [_, options] = lazyUse(m, ...scopes);

		return [options.start(), options.stop];
	}

	function lazyUse<T>(
		m: MoleculeOrInterface<T>,
		...scopes: AnyScopeTuple[]
	): [T, { start: () => T; stop: Unsub }] {
		if (!isMolecule(m) && !isMoleculeInterface(m))
			throw new Error(ErrorInvalidMolecule);

		const sub = scoper.createSubscription();
		const tuples = sub.expand(scopes);
		const bound = getTrueMolecule(m);

		let state: MoleculeSubscriptionState = MoleculeSubscriptionState.INITIAL;
		const lease = (tuple: AnyScopeTuple) => {
			const [memoized] = sub.expand([tuple]);

			return memoized;
		};

		let cacheValue = getInternal<T>(bound, {
			lease,
			previous: false,
			scopes: tuples,
		});

		const start = () => {
			if (state === MoleculeSubscriptionState.ACTIVE) {
				throw new Error("Don't start a subscription that is already started.");
			}

			cacheValue = getInternal<T>(bound, {
				lease,
				previous: cacheValue,
				scopes: sub.start(),
			});

			// Runs mounts
			runMount(cacheValue);
			state = MoleculeSubscriptionState.ACTIVE;
			return cacheValue.value as T;
		};
		const stop = () => {
			if (state === MoleculeSubscriptionState.STOPPED) {
				throw new Error("Don't start a subscription that is already started.");
			}
			sub.stop();
			state = MoleculeSubscriptionState.STOPPED;
		};

		return [cacheValue.value as T, { start, stop }];
	}

	return {
		createSubscription: scoper.createSubscription,
		get,
		[TypeSymbol]: Injector,
		use,
		useLazily: lazyUse,
		useScopes: scoper.useScopes,
	};
}

/**
 * Create deterministic ordered array of dependencies
 * for looking up values in the deep cache.
 *
 * @param scopes
 * @param mol
 * @returns
 */
function getCachePath(scopes: AnyScopeTuple[], mol: AnyMolecule) {
	/**
	 * Important: We filter out default scopes as a part of the cache path
	 * because it makes it easier for us to find a molecule in our Stage 1
	 * cache lookup (based only on previous lookups)
	 */
	const nonDefaultScopes = scopes.filter(s => s[0].defaultValue !== s[1]);

	/**
	 * Important: Sorting of scopes is important to ensure a consistent path
	 * for storing (and finding) molecules in the deep cache tree
	 */
	const deps = [mol, ...scopeTupleSort(nonDefaultScopes)];
	return deps;
}

/**
 * Create a new instance of a molecule
 *
 */
function runMolecule(
	maybeMolecule: AnyMolecule,
	getScopeValue: (scope: AnyMoleculeScope) => UseScopeDetails,
	getMoleculeValue: (mol: AnyMolecule) => MoleculeCacheValue,
	getTrueMolecule: (
		molOrIntf: AnyMolecule | AnyMoleculeInterface,
	) => MoleculeInternal<unknown>,
) {
	const m = getTrueMolecule(maybeMolecule);

	const dependentMolecules = new Set<AnyMolecule>();
	const allScopes = new Set<AnyMoleculeScope>();
	const defaultScopes = new Set<AnyMoleculeScope>();
	const mountedCallbacks = new Set<MountedCallback>();
	const buddies: MoleculeCacheValue[] = [];

	const use: InternalUse = (dep: Injectable<unknown>) => {
		if (isMoleculeScope(dep)) {
			allScopes.add(dep);
			const scopeDetails = getScopeValue(dep);
			scopeDetails.defaultScopes.forEach(s => defaultScopes.add(s));
			return scopeDetails.value;
		}
		if (isMolecule(dep) || isMoleculeInterface(dep)) {
			const dependentMolecule = getTrueMolecule(dep);
			dependentMolecules.add(dependentMolecule);
			const mol = getMoleculeValue(dependentMolecule);
			mol.deps.allScopes.forEach(s => allScopes.add(s));
			mol.deps.defaultScopes.forEach((s) => {
				defaultScopes.add(s);
			});
			buddies.push(mol);
			return mol.value as any;
		}
		throw new Error(ErrorBadUse);
	};

	let running = true;

	const trackingScopeGetter: ScopeGetter = (s) => {
		if (!running)
			throw new Error(ErrorAsyncGetScope);
		if (!isMoleculeScope(s))
			throw new Error(ErrorInvalidScope);
		return use(s);
	};

	const trackingGetter: MoleculeGetter = (molOrInterface) => {
		if (!running)
			throw new Error(ErrorAsyncGetMol);
		if (!isMolecule(molOrInterface) && !isMoleculeInterface(molOrInterface))
			throw new Error(ErrorInvalidMolecule);
		return use(molOrInterface);
	};

	onMountImpl.push((fn: MountedCallback) => mountedCallbacks.add(fn));
	useImpl.push(use);
	trackingScopeGetter(InternalOnlyGlobalScope);
	try {
		const value = m[GetterSymbol](trackingGetter, trackingScopeGetter);
		return {
			deps: {
				allScopes,
				/**
				 * Returns a copy
				 *
				 * Reverses the order so that the deepest dependencies are at the top
				 * of the list. This will be important for ensuring ordering for how
				 * mounts are called with transient dependencies.
				 *
				 */
				buddies: buddies.slice().reverse(),
				defaultScopes,
				molecules: dependentMolecules,
				mountedCallbacks,
			},
			value,
		};
	}
	finally {
		running = false;
		onMountImpl.pop();
		useImpl.pop();
	}
}

interface CreationProps {
	lease: (tuple: AnyScopeTuple) => AnyScopeTuple | undefined;
	previous: MoleculeCacheValue | false;
	scopes: AnyScopeTuple[];
}

if (import.meta.vitest) {
	const { describe, expect, test } = import.meta.vitest;
	const { atom } = await import("jotai/vanilla");
	const { company1Scope, company2Scope, companyMolecule, CompanyScope, exampleMol, unrelatedScope1, user1Scope, user2Scope, userMolecule, UserScope } = await import("./_internal/testing/molecule.js");
	const { molecule, moleculeInterface } = await import("./molecule.js");
	const { use } = await import("./lifecycle.js");

	test("returns the same values for dependency-free molecule", () => {
		const injector = createInjector();

		const firstValue = injector.get(exampleMol);
		const secondValue = injector.get(exampleMol);

		expect(firstValue).toBe(secondValue);
	});

	describe("Derived molecules", () => {
		const derivedMol = molecule((mol) => {
			const base = mol(exampleMol);
			return { ageAtom: atom(`${Math.random()}`), base };
		});

		const doubleDerived = molecule((mol) => {
			const base = mol(exampleMol);
			const derived = mol(derivedMol);
			return {
				base,
				derived,
			};
		});

		function testDerived(mol: typeof derivedMol) {
			const injector = createInjector();

			const firstValue = injector.get(mol);
			const secondValue = injector.get(mol);
			const firstBaseValue = injector.get(exampleMol);
			const secondBaseValue = injector.get(exampleMol);

			// All should be the same value
			expect(firstValue).toBe(secondValue);
			expect(firstBaseValue).toBe(secondBaseValue);

			expect(firstValue.base).toBe(firstBaseValue);
			expect(secondValue.base).toBe(secondBaseValue);
			expect(firstValue.base).toBe(secondBaseValue);
			expect(secondValue.base).toBe(firstBaseValue);
		}

		test("returns the same value for derived molecule", () => {
			testDerived(derivedMol);
		});

		test("returns the same value for 2nd order derived molecule", () => {
			testDerived(doubleDerived);
		});
	});

	test("two injectors return different molecules", () => {
		const injector1 = createInjector();
		const injector2 = createInjector();

		const firstValue = injector1.get(exampleMol);
		const secondValue = injector2.get(exampleMol);

		expect(firstValue).not.toBe(secondValue);
	});

	describe("Scoping", () => {
		test("Creates one molecule per scope, if not dependent on scope", () => {
			const injector = createInjector();
			const firstValue = injector.get(exampleMol);
			const secondValue = injector.get(exampleMol, user1Scope);
			const thirdValue = injector.get(exampleMol, company1Scope);
			const fourthValue = injector.get(exampleMol, company1Scope, user1Scope);
			// Molecule doesn't depend on scope, should be the same
			expect(firstValue).toBe(secondValue);
			expect(firstValue).toBe(thirdValue);
			expect(firstValue).toBe(fourthValue);
		});

		test("Creates one molecule, if no scope provided", () => {
			const injector = createInjector();
			const firstValue = injector.get(companyMolecule);
			const secondValue = injector.get(companyMolecule);
			// Should be one molecule, with default scope value
			expect(firstValue).toBe(secondValue);
		});

		test("Creates one molecule per dependent scope", () => {
			//
			const injector = createInjector();

			const firstValue = injector.get(companyMolecule, company1Scope);
			const secondValue = injector.get(companyMolecule, company2Scope);
			const thirdValue = injector.get(companyMolecule);

			// Molecule depends on scope, should be different for each scope
			expect(firstValue).not.toBe(secondValue);
			expect(firstValue).not.toBe(thirdValue);
			expect(thirdValue).not.toBe(secondValue);
		});

		test("Creates only one molecule per dependent scope", () => {
			const injector = createInjector();

			const firstValue = injector.get(companyMolecule, company1Scope);
			const secondValue = injector.get(companyMolecule, company1Scope);

			// Molecole depends on scope, should produce the same element for the same scope
			expect(firstValue).toBe(secondValue);
		});

		test("Creates one molecule per dependent molecule that is scope dependent", () => {
			const injector = createInjector();

			const firstValue = injector.get(userMolecule, company1Scope, user1Scope);
			const secondValue = injector.get(userMolecule, company2Scope, user1Scope);
			const thirdValue = injector.get(userMolecule, user1Scope);

			// Molecule has a TRANSITIVE dependency on scope via another molecule
			// So should be a different molecule every time
			expect(firstValue.company).toBe(company1Scope[1]);
			expect(secondValue.company).toBe(company2Scope[1]);
			expect(thirdValue.company).toBe(CompanyScope.defaultValue);

			expect(firstValue).not.toBe(secondValue);
			expect(firstValue).not.toBe(thirdValue);
			expect(secondValue).not.toBe(thirdValue);
		});

		test("Creates one molecule per dependent molecule that is scope dependent", () => {
			const injector = createInjector();

			const firstValue = injector.get(userMolecule, company1Scope, user1Scope);
			const secondValue = injector.get(userMolecule, company1Scope, user2Scope);

			// Molecule has a direct dependency AND a transitive dependency
			// Should be different for each direct dependency when the transitive dependency is unchanged
			expect(firstValue.company).toBe(company1Scope[1]);
			expect(secondValue.company).toBe(company1Scope[1]);

			expect(firstValue).not.toBe(secondValue);

			expect(firstValue.userId).toBe(user1Scope[1]);
			expect(secondValue.userId).toBe(user2Scope[1]);
		});

		test("Creates ONLY one molecule per dependent molecule that is scope dependent", () => {
			const injector = createInjector();

			const firstValue = injector.get(userMolecule, company1Scope, user1Scope);
			const secondValue = injector.get(userMolecule, company1Scope, user1Scope);
			const thirdValue = injector.get(
				userMolecule,
				company1Scope,
				unrelatedScope1,
				user1Scope,
			);
			// Molecule has a direct dependency AND a transitive dependency
			// Should be the same for the same scope
			expect(firstValue).toBe(secondValue);
			expect(firstValue).toBe(thirdValue);
		});

		test("Creates ONLY one molecule per dependent molecule, regardless of scope order", () => {
			const injector = createInjector();

			const [firstValue, _unsub1] = injector.use(
				userMolecule,
				company1Scope,
				user1Scope,
			);
			const [secondValue, _unsub2] = injector.use(
				userMolecule,
				user1Scope,
				company1Scope,
			);
			const [thirdValue, _unsub3] = injector.use(
				userMolecule,
				unrelatedScope1,
				user1Scope,
				company1Scope,
			);
			// Molecule has a direct dependency AND a transitive dependency
			// Should be the same for the same scope
			expect(firstValue).toBe(secondValue);
			expect(firstValue).toBe(thirdValue);
		});

		test("Works with highly nested molecules that depend on a top level scope", () => {
			const TopScope = createScope(0);
			const scope1: ScopeTuple<number> = [TopScope, 1];
			const scope2: ScopeTuple<number> = [TopScope, 2];
			const mol1 = molecule((_, getScope) => [1, getScope(TopScope)]);
			const mol2 = molecule(mol => [2, mol(mol1)]);
			const mol3 = molecule(mol => [3, mol(mol2)]);
			const mol4 = molecule(mol => [4, mol(mol3)]);
			const mol5 = molecule(mol => [5, mol(mol4)]);
			const mol6 = molecule(mol => [6, mol(mol5)]);

			const injector = createInjector();

			const val6 = injector.get(mol6, scope1);
			const val5 = injector.get(mol5, scope1);
			const val4 = injector.get(mol4, scope1);
			const val3 = injector.get(mol3, scope1);
			const val2 = injector.get(mol2, scope1);
			const val1 = injector.get(mol1, scope1);
			const otherVal6 = injector.get(mol6, scope2);
			const defaultVal6 = injector.get(mol6);

			expect(val1).toStrictEqual([1, 1]);
			expect(val2).toStrictEqual([2, [1, 1]]);
			expect(val3).toStrictEqual([3, [2, [1, 1]]]);
			expect(val4).toStrictEqual([4, [3, [2, [1, 1]]]]);
			expect(val5).toStrictEqual([5, [4, [3, [2, [1, 1]]]]]);
			expect(val6).toStrictEqual([6, [5, [4, [3, [2, [1, 1]]]]]]);
			expect(otherVal6).toStrictEqual([6, [5, [4, [3, [2, [1, 2]]]]]]);
			expect(defaultVal6).toStrictEqual([6, [5, [4, [3, [2, [1, 0]]]]]]);

			expect(val6).not.toBe(otherVal6);
			expect(val6).not.toBe(defaultVal6);
		});

		describe("Cyclic dependencies", () => {
			test("Crashes with an error on cyclic dependencies", () => {
				const molLeft: Molecule<unknown> = molecule(mol => [
					"left",
					// eslint-disable-next-line ts/no-use-before-define
					mol(molRight),
				]);
				const molRight: Molecule<unknown> = molecule(mol => [
					"right",
					mol(molLeft),
				]);
				const injector = createInjector();

				expect(() => injector.get(molLeft)).toThrowError();
				expect(() => injector.get(molRight)).toThrowError();
			});
		});

		describe("Transient dependencies in diamond patterns", () => {
			/*

      These tests are all based on the "Diamond Pattern",
      which captures a potential problem in intialization order

      See Diamond problem: https://en.wikipedia.org/wiki/Dependency_hell

      */
			const TopScope = createScope(0);
			const scope1: ScopeTuple<number> = [TopScope, 1];
			const scope2: ScopeTuple<number> = [TopScope, 2];

			const LeftScope = createScope("LS0");
			const leftScope1: ScopeTuple<string> = [LeftScope, "LS1"];
			const leftScope2: ScopeTuple<string> = [LeftScope, "LS2"];

			const RightScope = createScope("RS0");
			const rightScope1: ScopeTuple<string> = [RightScope, "RS1"];
			const rightScope2: ScopeTuple<string> = [RightScope, "RS2"];

			const BottomScope = createScope("BS0");
			const bottomScope1: ScopeTuple<string> = [BottomScope, "BS1"];
			const bottomScope2: ScopeTuple<string> = [BottomScope, "BS2"];

			const molTop = molecule((_, getScope) => ["top", getScope(TopScope)]);

			test("Works with a diamond pattern dependency tree", () => {
				const molLeft = molecule(mol => ["left", mol(molTop)]);
				const molRight = molecule(mol => ["right", mol(molTop)]);
				const molBottom = molecule(mol => [
					"bottom",
					mol(molLeft),
					mol(molRight),
				]);

				const injector = createInjector();

				const bottom0 = injector.get(molBottom);
				const bottom1 = injector.get(molBottom, scope1);
				const bottom2 = injector.get(molBottom, scope2);

				expect(bottom0).toStrictEqual([
					"bottom",
					["left", ["top", 0]],
					["right", ["top", 0]],
				]);
				expect(bottom1).toStrictEqual([
					"bottom",
					["left", ["top", 1]],
					["right", ["top", 1]],
				]);
				expect(bottom2).toStrictEqual([
					"bottom",
					["left", ["top", 2]],
					["right", ["top", 2]],
				]);
			});

			test("Works with a diamond pattern dependency tree, with side scope dependencies", () => {
				const molLeft = molecule((mol, getScope) => [
					"left",
					getScope(LeftScope),
					mol(molTop),
				]);
				const molRight = molecule((mol, getScope) => [
					"right",
					getScope(RightScope),
					mol(molTop),
				]);
				const molBottom = molecule((mol, getScope) => [
					"bottom",
					getScope(BottomScope),
					mol(molLeft),
					mol(molRight),
				]);

				const injector = createInjector();

				const bottom0 = injector.get(molBottom);
				const bottom1 = injector.get(
					molBottom,
					scope1,
					rightScope1,
					leftScope1,
					bottomScope1,
				);
				const bottom2 = injector.get(
					molBottom,
					scope2,
					rightScope2,
					leftScope2,
					bottomScope2,
				);

				expect(
					// Second call to get should return the same value
					injector.get(molBottom),
				).toBe(bottom0);
				expect(bottom0).toStrictEqual([
					"bottom",
					"BS0",
					["left", "LS0", ["top", 0]],
					["right", "RS0", ["top", 0]],
				]);
				expect(bottom0[2]?.[2]).toBe(bottom0[3]?.[2]);

				expect(
					// Second call to get should return the same value
					injector.get(molBottom, scope1, rightScope1, leftScope1, bottomScope1),
				).toBe(bottom1);
				expect(bottom1).toStrictEqual([
					"bottom",
					"BS1",
					["left", "LS1", ["top", 1]],
					["right", "RS1", ["top", 1]],
				]);
				expect(bottom1[2]?.[2]).toBe(bottom1[3]?.[2]);

				expect(
					// Second call to get should return the same value
					injector.get(molBottom, scope2, rightScope2, leftScope2, bottomScope2),
				).toBe(bottom2);
				expect(bottom2).toStrictEqual([
					"bottom",
					"BS2",
					["left", "LS2", ["top", 2]],
					["right", "RS2", ["top", 2]],
				]);
				expect(bottom2[2]?.[2]).toBe(bottom2[3]?.[2]);
			});

			test("Works with a diamond pattern dependency tree, with sibling dependency", () => {
				const molLeft = molecule(mol => ["left", mol(molTop)]);
				const molRight = molecule(mol => ["right", mol(molTop), mol(molLeft)]);

				const molBottom = molecule(mol => [
					"bottom",
					mol(molLeft),
					mol(molRight),
				]);

				const injector = createInjector();

				const bottom0 = injector.get(molBottom);
				const bottom1 = injector.get(molBottom, scope1);
				const bottom2 = injector.get(molBottom, scope2);

				expect(bottom0).toStrictEqual([
					"bottom",
					["left", ["top", 0]],
					["right", ["top", 0], ["left", ["top", 0]]],
				]);
				expect(bottom1).toStrictEqual([
					"bottom",
					["left", ["top", 1]],
					["right", ["top", 1], ["left", ["top", 1]]],
				]);
				expect(bottom2).toStrictEqual([
					"bottom",
					["left", ["top", 2]],
					["right", ["top", 2], ["left", ["top", 2]]],
				]);
			});

			test("Works with a diamond pattern dependency tree, with a direct deep dependency", () => {
				const molLeft = molecule(mol => ["left", mol(molTop)]);
				const molRight = molecule(mol => ["right", mol(molTop)]);
				const molBottom = molecule(mol => [
					"bottom",
					mol(molTop),
					mol(molLeft),
					mol(molRight),
				]);

				const injector = createInjector();

				const bottom0 = injector.get(molBottom);
				const bottom1 = injector.get(molBottom, scope1);
				const bottom2 = injector.get(molBottom, scope2);

				expect(bottom0).toStrictEqual([
					"bottom",
					["top", 0],
					["left", ["top", 0]],
					["right", ["top", 0]],
				]);
				expect(bottom0[1]).toBe(bottom0[2]?.[1]);
				expect(bottom0[1]).toBe(bottom0[3]?.[1]);
				expect(bottom1).toStrictEqual([
					"bottom",
					["top", 1],
					["left", ["top", 1]],
					["right", ["top", 1]],
				]);
				expect(bottom1[1]).toBe(bottom1[2]?.[1]);
				expect(bottom1[1]).toBe(bottom1[3]?.[1]);

				expect(bottom2).toStrictEqual([
					"bottom",
					["top", 2],
					["left", ["top", 2]],
					["right", ["top", 2]],
				]);
				expect(bottom2[1]).toBe(bottom2[2]?.[1]);
				expect(bottom2[1]).toBe(bottom2[3]?.[1]);
			});

			test("Works with a deep diamond pattern dependency tree with a deep right tree", () => {
				const molLeft = molecule(mol => ["left", mol(molTop)]);
				const molRight = molecule(mol => ["right", mol(molTop)]);
				// Deep right tree
				const molRightLeft = molecule(mol => ["left", mol(molRight)]);
				const molRightRight = molecule(mol => ["right", mol(molRight)]);

				const molBottom = molecule(mol => [
					"bottom",
					mol(molLeft),
					mol(molRightLeft),
					mol(molRightRight),
				]);

				const injector = createInjector();

				const bottom0 = injector.get(molBottom);
				const bottom1 = injector.get(molBottom, scope1);
				const bottom2 = injector.get(molBottom, scope2);

				expect(bottom0).toStrictEqual([
					"bottom",
					["left", ["top", 0]],
					["left", ["right", ["top", 0]]],
					["right", ["right", ["top", 0]]],
				]);
				expect(bottom1).toStrictEqual([
					"bottom",
					["left", ["top", 1]],
					["left", ["right", ["top", 1]]],
					["right", ["right", ["top", 1]]],
				]);
				expect(bottom2).toStrictEqual([
					"bottom",
					["left", ["top", 2]],
					["left", ["right", ["top", 2]]],
					["right", ["right", ["top", 2]]],
				]);
			});
		});
	});

	describe("Validation", () => {
		test("Molecules will throw errors if `mol` is called asynchronously", async () => {
			const badMolecule = molecule((mol) => {
				// Okay -- runs sync
				mol(exampleMol);
				return new Promise((resolve, reject) =>
					setTimeout(() => {
						try {
							// Not okay -- runs in a timeout
							resolve(mol(exampleMol));
						}
						catch (e) {
							reject(e);
						}
					}, 10),
				);
			});

			const injector1 = createInjector();

			const firstValue = injector1.get(badMolecule);
			await expect(firstValue).rejects.toThrow("o");
		});

		test("Molecules will throw errors if `scope` is called asynchronously", async () => {
			const badMolecule = molecule((_, scope) => {
				// Okay -- runs sync
				return new Promise((resolve, reject) =>
					setTimeout(() => {
						try {
							// Not okay -- runs in a timeout
							resolve(scope(UserScope));
						}
						catch (e) {
							reject(e);
						}
					}, 10),
				);
			});

			const injector1 = createInjector();

			const firstValue = injector1.get(badMolecule);
			await expect(firstValue).rejects.toThrow("o");
		});

		describe("Bad dependencies", () => {
			const injector1 = createInjector();

			test("Molecules can't depend on garbage molecules", () => {
				const badMol = molecule(() => use(new Set() as any));
				expect(() => injector1.get(badMol)).toThrow(ErrorBadUse);
			});
			test("Molecules can't depend on garbage molecules", () => {
				const badMol = molecule(mol => mol(new Set() as any));
				expect(() => injector1.get(badMol)).toThrow(ErrorInvalidMolecule);
			});
			test("Molecules can't depend on garbage scopes", () => {
				const badMol = molecule(() => use(new Set() as any));
				expect(() => injector1.get(badMol)).toThrow(ErrorBadUse);
			});
			test("Molecules can't depend on garbage scopes", () => {
				const badMol = molecule((_, scope) => scope(new Set() as any));
				expect(() => injector1.get(badMol)).toThrow(ErrorInvalidScope);
			});
		});

		describe("Validation for inputs to injector", () => {
			const injector1 = createInjector();

			test("Can't `get` a non-molecule", () => {
				expect(() => injector1.get(new Set() as any)).toThrow(
					ErrorInvalidMolecule,
				);
			});
			test("Can't `use` a non-molecule", () => {
				expect(() => injector1.use(new Map() as any)).toThrow(
					ErrorInvalidMolecule,
				);
			});
		});
	});

	describe("Binding", () => {
		interface HTTPService {
			get: (url: string) => Promise<string>;
			identity: string;
			post: (url: string) => Promise<string>;
		}

		const HTTPService = moleculeInterface<HTTPService>();

		const NeedsHttp = molecule((mol) => {
			const httpService = mol(HTTPService);

			const logout = () => httpService.post("/logout");
			return {
				httpService,
				logout,
			};
		});

		test("Errors when a molecule interface is not bound", () => {
			const injector1 = createInjector();
			expect(() => injector1.get(HTTPService)).toThrow(ErrorUnboundMolecule);
		});

		describe("Allows binding a molecule interface to a molecule", () => {
			const MockHTTPMolecule = molecule<HTTPService>(() => {
				return {
					async get(_url) {
						return "I am fake";
					},
					identity: "MockHTTP",
					async post(_url) {
						return "I am fake";
					},
				};
			});

			test("Injects bindings into downstream dependencies", () => {
				const injector1 = createInjector({
					bindings: [[HTTPService, MockHTTPMolecule]],
				});

				const firstValue = injector1.get(NeedsHttp);
				expect(firstValue.logout).not.toBeNull();

				const bound = injector1.get(HTTPService);
				expect(bound).toBe(firstValue.httpService);
			});

			describe("Work with tuple bindings", () => {
				const arrayBindings = [[HTTPService, MockHTTPMolecule]];
				const injector1 = createInjector({
					bindings: [[HTTPService, MockHTTPMolecule]],
				});

				test("injects the right values", () => {
					expect(injector1.get(HTTPService).identity).toBe("MockHTTP");
				});
				test("doesn't update the injector when the bindings array is mutated", () => {
					arrayBindings.pop();
					expect(arrayBindings).toStrictEqual([]);
					expect(injector1.get(HTTPService).identity).toBe("MockHTTP");
				});
			});

			describe("Works with map bindings", () => {
				const mapBindings = new Map();
				mapBindings.set(HTTPService, MockHTTPMolecule);
				const injector1 = createInjector({
					bindings: mapBindings,
				});

				test("injects the right values", () => {
					expect(injector1.get(HTTPService).identity).toBe("MockHTTP");
				});

				test("doesn't update the injector when the map is mutated", () => {
					mapBindings.delete(HTTPService);
					expect(injector1.get(HTTPService).identity).toBe("MockHTTP");
				});
			});
		});

		test("Allows binding a molecule interface to a scoped molecule", async () => {
			const UserScopedHTTPMolecule = molecule<HTTPService>((_, getScope) => {
				const user = getScope(UserScope);
				return {
					async get(_url) {
						return `I am ${user}`;
					},
					identity: "UserScopedHTTP",
					async post(_url) {
						return `I am ${user}`;
					},
				};
			});

			const injector1 = createInjector({
				bindings: [[HTTPService, UserScopedHTTPMolecule]],
			});

			const firstValue = injector1.get(NeedsHttp);

			const loggedOut = await firstValue.logout();
			expect(loggedOut).toBe("I am bob@example.com");

			const secondValue = injector1.get(NeedsHttp, user1Scope);

			const loggedOut2 = await secondValue.logout();
			expect(loggedOut2).toBe("I am one@example.com");
		});
	});

	describe("Scope caching", () => {
		describe("Caches a scoped molecule", () => {
			const injector = createInjector();

			describe("String scopes", () => {
				const UserScoped = molecule(
					(_, scope) => scope(UserScope) + Math.random(),
				);
				test("It caches for overlapping leases", () => {
					const [mol1, unsub1] = injector.use(UserScoped, [
						UserScope,
						"one@example.com",
					]);
					const [mol2, unsub2] = injector.use(UserScoped, [
						UserScope,
						"one@example.com",
					]);
					expect(mol1).toBe(mol2);

					unsub1();
					unsub2();
				});

				test("It does not cache when leases are not overlapping", () => {
					const [mol1, unsub1] = injector.use(UserScoped, [
						UserScope,
						"one@example.com",
					]);
					unsub1();
					const [mol2, unsub2] = injector.use(UserScoped, [
						UserScope,
						"one@example.com",
					]);
					unsub2();

					expect(mol1).not.toBe(mol2);
				});
			});
			describe("Objects scopes", () => {
				const objectScope = createScope(new Set());

				const ObjectScopedMol = molecule(
					(_, scope) => new Set(scope(objectScope).entries()),
				);

				test("It caches for overlapping leases", () => {
					const testSet = new Set();
					const [mol1, unsub1] = injector.use(ObjectScopedMol, [
						objectScope,
						testSet,
					]);
					const [mol2, unsub2] = injector.use(ObjectScopedMol, [
						objectScope,
						testSet,
					]);
					expect(mol1).toBe(mol2);
					unsub1();
					unsub2();
				});

				test("It does NOT cache when leases are not overlapping", () => {
					// Note: Behaviour changed in Version 2.1

					const testSet = new Set();
					const [mol1, unsub1] = injector.use(ObjectScopedMol, [
						objectScope,
						testSet,
					]);
					unsub1();
					const [mol2, unsub2] = injector.use(ObjectScopedMol, [
						objectScope,
						testSet,
					]);
					unsub2();

					expect(mol1).not.toBe(mol2);
				});
			});
		});
	});
}
