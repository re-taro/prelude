import { beforeEach, bench, describe } from "vitest";
import { createDeepMolecule } from "./_internal/testing/deep_molecule.js";
import type { AnyMolecule } from "./_internal/types.js";
import { createInjector, molecule } from "./index.js";

describe("injector benchmarks", () => {
	const SimpleMolecule = molecule(() => {
		return Math.random();
	});

	let injector = createInjector();
	beforeEach(() => {
		injector = createInjector();
	});

	bench("using a constant molecule", () => {
		const [_, unsub] = injector.use(SimpleMolecule);
		unsub();
	});

	bench("using a new molecule", () => {
		const TransientMolecule = molecule(() => {
			return Math.random();
		});
		const [_, unsub] = injector.use(TransientMolecule);
		unsub();
	});

	const DeepMolecule1 = createDeepMolecule({
		depth: 100,
		rootDependency: SimpleMolecule,
	});

	bench("using a really deep molecule, without unsubscribing", () => {
		const [_value, _unsub] = injector.use(DeepMolecule1);
	});

	const DeepMolecule2 = createDeepMolecule({
		depth: 100,
		rootDependency: SimpleMolecule,
	});
	bench("using a really deep molecule, with proper cleanup", () => {
		const [_, unsub] = injector.use(DeepMolecule2);
		unsub();
	});

	let _DeepMolecule3: AnyMolecule;
	bench(
		"using a new really deep molecule, with proper cleanup",
		() => {
			const [_, unsub] = injector.use(DeepMolecule2);
			unsub();
		},
		{
			setup() {
				_DeepMolecule3 = createDeepMolecule({
					depth: 100,
					rootDependency: SimpleMolecule,
				});
			},
		},
	);
});

describe("baseline benchmarks", () => {
	bench("no-op", () => {
		// eslint-disable-next-line ts/no-unused-expressions
		1 + 1;
	});
	bench("create an 100 element array", () => {
		// Do nothing
		Array.from({ length: 100 });
	});
});
