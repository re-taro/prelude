import type { Molecule, MoleculeOrInterface } from "./molecule.js";
import type { MoleculeScope } from "./scope.js";

export type ScopeTuple<T> = readonly [MoleculeScope<T>, T];
export type BindingTuple<T> = readonly [MoleculeOrInterface<T>, Molecule<T>];
export type BindingTuples = Array<BindingTuple<unknown>>;
export type BindingMap = Map<MoleculeOrInterface<unknown>, Molecule<unknown>>;
export type Bindings = BindingMap | BindingTuples;

export type Injectable<T> = MoleculeOrInterface<T> | MoleculeScope<T>;
