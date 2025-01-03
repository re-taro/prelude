import type { CleanupCallback } from "../lifecycle.js";
import type { ScopeTuple } from "../types.js";
import type { MoleculeInjector } from "../injector.js";
import type {
	AnyMoleculeScope,
	AnyScopeTuple,
} from "./types.js";

type MaybeWeakMap<K, V> = K extends object ? WeakMap<K, V> : Map<K, V>;

/**
 * The scoper is not aware of molecules, but keeps track of scopes
 *
 *  - it provides referentially-equal scope tuples for use in other weak maps
 *  - it tracks subscriptions, and runs cleanups when nothing is subscribing anymore
 *  - it keeps track of unmount functions and only ever runs them once
 *
 * Since the scoper uses `Map` and `Set` instead of `WeakMap` and `WeakSet` it
 * is the most likely destination for memory leaks, likely due to scopes not being
 * released.
 *
 */
export function createScoper(): {
	createSubscription: () => ScopeSubscription;
	registerCleanups: (scopeKeys: AnyScopeTuple[], cleanupSet: Set<CleanupCallback>) => void;
	useScopes: (...scopes: AnyScopeTuple[]) => ReturnType<MoleculeInjector["useScopes"]>;
} {
	/**
	 * This scope cache is the key state of this scoper.
	 *
	 * It is a 2-lever map
	 *
	 *      Scope
	 *       / \
	 *         Scope Values
	 *            /  \
	 *                o
	 *                - List of subscriptions (references)
	 *                - Memoized tuple, for use as a key in other caches and WeakMaps
	 *                - Cleanups for when this scope/value pair is released
	 *
	 *
	 */
	const scopeCache = new WeakMap<
		/**
		 * All scopes are objects, so they can be used as a WeakMap key
		 * If scopes are created temporarily, this will automatically be cleaned up
		 * from this WeakMap
		 */
		AnyMoleculeScope,
		/**
		 * Ideally we would prefer to use a WeakMap here instead of a Map, but
		 * since scope values can be primitives, they aren't allowed as a
		 * key in a WeakMap.
		 */
		MaybeWeakMap<
			/**
			 * The scope value, which should match the type of the MoleculeScope
			 */
			unknown,
			/**
			 * The point of the cache is to store this object
			 * of things related to a scope value
			 */
			{
				/**
				 * These callbacks should be called when there are no more subscriptions
				 */
				cleanups: Set<CleanupCallback>;

				/**
				 * The set of subscription IDs that are using this scope value
				 */
				references: Set<ScopeSubscription>;

				/**
				 * A referentially-stable array (i.e. Tuple) for the scope value.
				 *
				 * This is used as a key in other places in WeakMap and WeakSet
				 */
				tuple: AnyScopeTuple;
			}
		>
	>();

	/**
	 * A weakset that makes sure that we never call a cleanup
	 * function more than once.
	 *
	 * Think of every callback having an `hasBeenRun` property:
	 *
	 * `callback.hasBeenRun = true`.
	 *
	 * You can also think of this as a Map<CleanupCallback, boolean>
	 * where we set the value to "true" once the callback has
	 * been run:
	 *
	 * `hasBeenRun.set(callback, true)`
	 *
	 * The weakset provides a simpler, mutation free and memory
	 * efficient way to signal that the callback has been run
	 * and need not be run again.
	 *
	 * Without this weakset, we would need more coordination to ensure
	 * a callback is only run once.
	 */
	const cleanupsRun = new WeakSet<CleanupCallback>();

	const releasedSubscriptions = new WeakSet<ScopeSubscription>();

	function getScopes<T>(tuples: ScopeTuple<T>[]): ScopeTuple<T>[] {
		return tuples.map(t => getScope(t));
	}

	/**
	 * Creates a memoized tuple of `[scope,value]`
	 *
	 * Registers primitive `value`s in the primitive scope cache. This has side-effects
	 * and needs to be cleaned up with `deregisterScopeTuple`
	 *
	 */
	function getScope<T>(tuple: ScopeTuple<T>): ScopeTuple<T> {
		const [scope, value] = tuple;

		const cached = scopeCache.get(scope)?.get(value);
		if (typeof cached !== "undefined") {
			return cached.tuple as ScopeTuple<T>;
		}

		return tuple;
	}

	/**
	 * Mutates the cache and starts the subscription
	 *
	 * @param subscriptionId
	 * @param tuple
	 */
	function startSubscription<T>(
		subscriptionObj: ScopeSubscription,
		tuple: ScopeTuple<T>,
	): ScopeTuple<T> {
		const [scope, value] = tuple;
		const innerCached = scopeCache.get(scope)?.get(value);
		if (typeof innerCached !== "undefined") {
			innerCached.references.add(subscriptionObj);

			return innerCached.tuple as ScopeTuple<T>;
		}
		else {
			const valuesForScope
        = scopeCache.get(scope) ?? scopeCache.set(scope, new Map()).get(scope)!;

			valuesForScope.set(value, {
				cleanups: new Set(),
				references: new Set<ScopeSubscription>([subscriptionObj]),
				tuple,
			});

			return tuple;
		}
	}

	function startSubscriptions(
		subscriptionObj: ScopeSubscription,
		tuples: AnyScopeTuple[],
	): AnyScopeTuple[] {
		return tuples.map(t => startSubscription(subscriptionObj, t));
	}

	/**
	 * For values that are "primitive" (not an object),
	 * deregisters them from the primitive scope
	 * cache to ensure no memory leaks
	 */
	function stopSubscription(
		tuples: Set<AnyScopeTuple>,
		subscriptionObj: ScopeSubscription,
	) {
		if (releasedSubscriptions.has(subscriptionObj)) {
			// throw new Error(
			//   "Can't release a subscription that has already been released. Don't call unsub twice.",
			// );
			return;
		}
		else {
			releasedSubscriptions.add(subscriptionObj);
		}

		const cleanupsToRun = releaseTuples(tuples, subscriptionObj);

		Array.from(cleanupsToRun.values())
			.reverse()
			.forEach((cb) => {
				if (!cleanupsRun.has(cb)) {
					cb();
					cleanupsRun.add(cb);
				}
			});
	}

	function releaseTuples(
		tuples: Set<AnyScopeTuple>,
		subscriptionObj: ScopeSubscription,
	) {
		const cleanupsToRun = new Set<CleanupCallback>();
		tuples.forEach(([scope, value]) => {
			const scopeMap = scopeCache.get(scope);
			const cached = scopeMap?.get(value);

			const references = cached?.references;
			references?.delete(subscriptionObj);

			if (references && references.size <= 0) {
				scopeMap?.delete(value);

				cached?.cleanups.forEach((cb) => {
					cleanupsToRun.add(cb);
				});
			}
		});

		return cleanupsToRun;
	}

	function registerCleanups(
		scopeKeys: AnyScopeTuple[],
		cleanupSet: Set<CleanupCallback>,
	): void {
		scopeKeys.forEach(([scopeKey, scopeValue]) => {
			cleanupSet.forEach((cleanup) => {
				const cleanups = scopeCache.get(scopeKey)?.get(scopeValue)?.cleanups;
				if (typeof cleanups === "undefined") {
					throw new TypeError("Can't register cleanups for uncached values");
				}
				cleanups.add(cleanup);
			});
		});
	}

	function useScopes(
		...scopes: AnyScopeTuple[]
	): ReturnType<MoleculeInjector["useScopes"]> {
		const subscription = createSubscription();
		subscription.expand(scopes);
		subscription.start();

		return [subscription.tuples, () => subscription.stop()];
	}

	function createSubscription(): ScopeSubscription {
		let internal = new ScopeSubscriptionImpl();
		let stopped = false;

		function restart() {
			const previousTuples = internal.tuples;
			internal = new ScopeSubscriptionImpl();
			internal.expand(previousTuples);
			return internal.start();
		}
		return {
			addCleanups(cleanups: Set<CleanupCallback>) {
				registerCleanups(this.tuples, cleanups);
			},
			expand(next: AnyScopeTuple[]) {
				return internal.expand(next);
			},
			start() {
				if (stopped) {
					stopped = false;
					return restart();
				}
				return internal.start();
			},
			stop() {
				internal.stop();
				stopped = true;
			},
			get tuples() {
				return internal.tuples;
			},
		};
	}

	class ScopeSubscriptionImpl implements ScopeSubscription {
		addCleanups(cleanups: Set<CleanupCallback>): void {
			registerCleanups(this.tuples, cleanups);
		}

		__tupleMap = new Map<AnyMoleculeScope, AnyScopeTuple>();
		__stableArray: AnyScopeTuple[] = [];
		get tuples(): AnyScopeTuple[] {
			return this.__stableArray;
		}

		expand(next: AnyScopeTuple[]) {
			const tuples = getScopes(next);
			tuples.forEach((t) => {
				this.__tupleMap.set(t[0], t);
			});
			this.__stableArray = Array.from(this.__tupleMap.values());
			return tuples;
		}

		start() {
			return startSubscriptions(this, this.__stableArray);
		}

		stop() {
			stopSubscription(new Set(this.tuples), this);
		}
	}

	return {
		createSubscription,
		registerCleanups,
		useScopes,
	};
}

export interface ScopeSubscription {
	addCleanups: (cleanups: Set<CleanupCallback>) => void;
	expand: (next: AnyScopeTuple[]) => AnyScopeTuple[];
	start: () => AnyScopeTuple[];
	stop: () => void;
	tuples: AnyScopeTuple[];
}

if (import.meta.vitest) {
	const { describe, expect, test, vi } = import.meta.vitest;
	const { createScope } = await import("../scope.js");

	describe("createScoper", () => {
		const UserScope = createScope<string>("bob@example.com");

		test("Caches a scope tuple", () => {
			const scoper = createScoper();
			const [[tuple1], unsub1] = scoper.useScopes([UserScope, "one@example.com"]);
			const [[tuple2], unsub2] = scoper.useScopes([UserScope, "one@example.com"]);
			expect(tuple1).toBe(tuple2);

			unsub1();
			unsub2();
		});

		test("Does not cache when scopes are cleaned up", () => {
			const scoper = createScoper();
			const [[tuple1], unsub1] = scoper.useScopes([UserScope, "one@example.com"]);
			unsub1();

			// Note: GC / cleanup happens in here

			const [[tuple2], unsub2] = scoper.useScopes([UserScope, "one@example.com"]);
			unsub2();
			// Subscription 1 and 2 never overlapped
			expect(tuple1).not.toBe(tuple2);
		});

		test("Caches if there are overlapping subscriptions", () => {
			const scoper = createScoper();
			const [[tuple1], unsub1] = scoper.useScopes([UserScope, "one@example.com"]);
			const [[tuple2], unsub2] = scoper.useScopes([UserScope, "one@example.com"]);
			unsub2();
			unsub1();
			// Subscription 2 overlapped with 1
			expect(tuple1).toBe(tuple2);
		});

		test("Caches as long as subscriptions overlap", () => {
			const scoper = createScoper();
			const [[tuple1], unsub1] = scoper.useScopes([UserScope, "one@example.com"]);

			const [[tuple2], unsub2] = scoper.useScopes([UserScope, "one@example.com"]);

			// Doesn't create a new value, the second use has a lease
			unsub1();

			const [[tuple3], unsub3] = scoper.useScopes([UserScope, "one@example.com"]);
			unsub2();

			const [[tuple4], unsub4] = scoper.useScopes([UserScope, "one@example.com"]);
			unsub3();

			// Final cleanup
			unsub4();

			expect(tuple1).toBe(tuple2);
			expect(tuple1).toBe(tuple3);
			expect(tuple1).toBe(tuple4);
		});

		test("Scope tuples match during creation and expansion", () => {
			const scoper = createScoper();

			const sub1 = scoper.createSubscription();

			const [tuple1] = sub1.expand([[UserScope, "one@example.com"]]);

			const [tuple2] = sub1.start();

			expect(tuple1).toBe(tuple2);
		});

		test("Can't register cleanups for unused scopes", () => {
			const scoper = createScoper();

			const sub1 = scoper.createSubscription();
			const [_tuple1] = sub1.expand([[UserScope, "one@example.com"]]);

			const cleanupFn = vi.fn();

			expect(() =>
				scoper.registerCleanups(
					[[UserScope, "one@example.com"]],
					new Set([cleanupFn]),
				),
			).toThrowError();
		});

		test("Scope subscriptions can be re-used", () => {
			const scoper = createScoper();

			const sub1 = scoper.createSubscription();
			const [tuple1] = sub1.expand([[UserScope, "one@example.com"]]);

			const [tuple2] = sub1.start();
			const cleanupFn = vi.fn();

			scoper.registerCleanups(
				[[UserScope, "one@example.com"]],
				new Set([cleanupFn]),
			);

			expect(tuple1).toBe(tuple2);
			sub1.stop();

			expect(cleanupFn).toHaveBeenCalled();

			for (let iteration = 0; iteration < 10; iteration++) {
				const cleanupFnInner = vi.fn();

				const [tuple3] = sub1.start();
				scoper.registerCleanups(
					[[UserScope, "one@example.com"]],
					new Set([cleanupFnInner]),
				);
				expect(tuple1).toBe(tuple3);
				sub1.stop();
				expect(cleanupFnInner).toHaveBeenCalled();
				cleanupFnInner.mockReset();
			}
		});
	});
}
