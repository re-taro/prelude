export const TypeSymbol: unique symbol = Symbol.for("inject.molecules.type");
export const ScopeSymbol: unique symbol = Symbol.for("inject.scope.type");
export const Injector: unique symbol = Symbol.for("inject.injector.instance");
export const GetterSymbol: unique symbol = Symbol.for("inject.molecules.getter");
export const MoleculeSymbol: unique symbol = Symbol.for("inject.molecules.molecule");
export const MoleculeInterfaceSymbol: unique symbol = Symbol.for(
	"inject.molecules.molecule.interface",
);
export const DefaultInjector: unique symbol = Symbol.for(
	"inject.injector.defaultGlobalInjector",
);
export const Debug: unique symbol = Symbol("inject.debug");
export const SortId: unique symbol = Symbol("inject.scope.sort");
