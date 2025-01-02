import type { MountedCallback } from "../lifecycle.js";
import type {
	Molecule,
	MoleculeConstructor,
	MoleculeInterface,
} from "../molecule.js";
import type { MoleculeScope } from "../scope.js";
import type { ScopeTuple } from "../types.js";
import type {
	GetterSymbol,
	MoleculeInterfaceSymbol,
	MoleculeSymbol,
	TypeSymbol,
} from "./symbols.js";

/**
 * The value stored in the molecule cache
 */
export interface MoleculeCacheValue {
	deps: Deps;
	instanceId: symbol;
	isMounted: boolean;
	path: (AnyMolecule | AnyScopeTuple)[];
	value: unknown;
}

interface Deps {
	allScopes: Set<AnyMoleculeScope>;
	buddies: MoleculeCacheValue[];
	defaultScopes: Set<AnyMoleculeScope>;
	mountedCallbacks: Set<MountedCallback>;
}

export type AnyMoleculeScope = MoleculeScope<unknown>;
export type AnyScopeTuple = ScopeTuple<unknown>;
export type AnyMolecule = Molecule<unknown>;
export type AnyMoleculeInterface = MoleculeInterface<unknown>;

export interface MoleculeInternal<T> {
	[GetterSymbol]: MoleculeConstructor<T>;
	[TypeSymbol]: typeof MoleculeSymbol;
	displayName?: string;
}

// eslint-disable-next-line unused-imports/no-unused-vars
export interface MoleculeInterfaceInternal<T> {
	[TypeSymbol]: typeof MoleculeInterfaceSymbol;
	displayName?: string;
}
