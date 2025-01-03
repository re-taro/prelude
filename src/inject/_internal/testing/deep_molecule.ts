import type {
	Molecule,
	MoleculeOrInterface,
	MoleculeScope,
} from "../../index.js";
import {
	molecule,
	use,
} from "../../index.js";

export function createDeepMolecule<T>(props: {
	depth: number;
	rootDependency: MoleculeOrInterface<T> | MoleculeScope<T>;
}) {
	return Array.from({ length: props.depth }).reduce((prev, _) => {
		return molecule(() => use(prev as any));
	}, props.rootDependency) as Molecule<T>;
}
