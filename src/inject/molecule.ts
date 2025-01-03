import type {
	MoleculeInterfaceInternal,
	MoleculeInternal,
} from "./_internal/types.js";
import {
	GetterSymbol,
	MoleculeInterfaceSymbol,
	MoleculeSymbol,
	TypeSymbol,
} from "./_internal/symbols.js";
import type { MoleculeScope } from "./scope.js";

/**
 * Calling this function creates an implicit dependency between the
 * molecule that called it and the scope that's requested.
 */
export interface ScopeGetter {
	<Value>(scope: MoleculeScope<Value>): Value;
}

/**
 * Calling this function creates an implicit dependency between the
 * molecule that called it and the molecule or interface that's requested.
 */
export interface MoleculeGetter {
	<Value>(mol: MoleculeOrInterface<Value>): Value;
}

/**
 * A molecule constructor is the function that produces a new instance of a dependency. These functions should be idempotent
 * and not mutate any outside state.
 *
 * When a constructor calls the `mol` function, it implicitly created a dependency to the molecule it uses. If it calls the
 * `scope` function, it implicitly created a dependency to the scope.
 *
 */
export type MoleculeConstructor<T> = (
	mol: MoleculeGetter,
	scope: ScopeGetter,
) => T;

/**
 * A molecule object.
 *
 * This can be used as a reference to create objects by calling `useMolecule`
 * in one of the frontend integrations.
 *
 * Create a {@link Molecule} by callig {@link molecule}
 *
 * ```ts
 * export const RandomNumberMolecule = molecule(()=>Math.random());
 * ```
 *
 * @typeParam T - the type of object that will be provided by this molecule
 */
// eslint-disable-next-line unused-imports/no-unused-vars
export type Molecule<T> = Record<typeof GetterSymbol | typeof TypeSymbol, unknown> & {
	displayName?: string;
};

/**
 * A molecule interface object.
 *
 * This can be used as a reference to create objects by calling `useMolecule`
 * in one of the frontend integrations.
 *
 * @typeParam T - the type of object that will be provided by this interface
 */
// eslint-disable-next-line unused-imports/no-unused-vars
export type MoleculeInterface<T> = Record<typeof TypeSymbol, unknown> & {
	displayName?: string;
};

/**
 * Either a {@link MoleculeInterface} or a {@link Molecule}
 */
export type MoleculeOrInterface<T> = Molecule<T> | MoleculeInterface<T>;

/**
 * Create a new molecule
 *
 * Molecules are the core building block of inject. They are functions that return a value.
 * Molecules can depend on other molecules. When molecules depend on other molecules, anything
 * that they depend on will be automatically created.
 *
 * Molecules can also depend on scopes. When a molecule depends on a scope, then an instance will be
 * created for each scope. In other words, your molecule function will be run once per unique scope,
 * instead of once globally for your application.
 *
 *
 * Rules of molecules:
 *
 * - A molecule without any dependencies or scopes will only be called once.
 * - A molecule that depends on scope (a scoped molecule) will be called once per unique scope.
 * - A molecule that depends on a *scoped* molecule will be called once per unique scope of it’s dependency.
 * - If a molecule calls `scope` then it will be a scoped molecule.
 * - If a molecule calls `mol` then it will depend on that molecule.

 * Create a global molecule
 * ```ts
 * const globalMolecule = molecule(()=>Math.random());
 * ```
 * Create a dependent molecule
 * ```ts
 * const dependentMolecule = molecule(()=>`My dependency: ${use(globalMolecule)}`);
 * const dependentMolecule = molecule((mol)=>`My dependency: ${mol(globalMolecule)}`);
 * ```
 * Create a scoped molecule
 * ```ts
 * const formScopedMolecule = molecule(()=>use(formScope));
 * const formScopedMolecule = molecule((_,scope)=>scope(formScope));
 * ```*
 *
 * @param construct - A callback function called to create molecule instances
 * @returns a molecule
 */
export function molecule<T>(construct: MoleculeConstructor<T>): Molecule<T> {
	const mol: MoleculeInternal<T> = {
		[GetterSymbol]: construct,
		[TypeSymbol]: MoleculeSymbol,
	};

	return mol;
}

/**
 * Create a new molecule interface.
 *
 * Molecule interfaces don't define an implementation, only a reference that other molecules
 * can depend on for an implementation. Before an interface can be used, an implementation needs
 * to be provided in the bindings to an {@link MoleculeInjector}. If no bindings for an interface
 * exist, then an error will be thrown the firs time it is used.
 *
 * Interfaces can be bound to molecules, scoped molecules, or molecules that simply wrap scopes.
 *
 * Interfaces are useful for decoupling your application and for library authors when the implementation
 * that your molecule relies on is unknown or variable. For example if your writing a molecule that relies
 * on router state, but there are many possible routers and no standard routers.
 *
 * Avoid interfaces when your library or application has a good default implementation. For example, if
 * your molecule relies on making HTTP requests, then it's better to have a molecule that provides http
 * access via `fetch` than an empty interface. Since molecules can also be replaced in bindings, it is more
 * convenient for consumers of your molecules to have a default implementation provided.
 *
 * @typeParam T - the typescript interface that this interface provides
 */
export function moleculeInterface<T>(): MoleculeInterface<T> {
	const intf: MoleculeInterfaceInternal<T> = {
		[TypeSymbol]: MoleculeInterfaceSymbol,
	};

	return intf;
}
