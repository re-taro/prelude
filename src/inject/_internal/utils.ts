import type { MoleculeInjector } from "../injector.js";
import type { AnyMolecule, AnyMoleculeScope } from "./types.js";
import {
	Injector,
	MoleculeInterfaceSymbol,
	MoleculeSymbol,
	ScopeSymbol,
	TypeSymbol,
} from "./symbols.js";

function __isInternalType<T>(value: unknown, typeSymbol: symbol): value is T {
	if (!value)
		return false;
	if (typeof value !== "object")
		return false;
	return (value as any)[TypeSymbol] === typeSymbol;
}

export function isMolecule(value: unknown): value is AnyMolecule {
	return __isInternalType(value, MoleculeSymbol);
}

export function isMoleculeScope(value: unknown): value is AnyMoleculeScope {
	return __isInternalType(value, ScopeSymbol);
}

export function isMoleculeInterface(value: unknown): value is AnyMolecule {
	return __isInternalType(value, MoleculeInterfaceSymbol);
}

export function isInjector(value: unknown): value is MoleculeInjector {
	return __isInternalType(value, Injector);
}

if (import.meta.vitest) {
	const { describe, expect, test } = import.meta.vitest;
	const { createInjector } = await import("../injector.js");
	const { createScope } = await import("../scope.js");
	const { molecule, moleculeInterface } = await import("../molecule.js");

	describe("isMolecule", () => {
		test("accepts valid molecules", () => {
			expect(isMolecule(createInjector())).toBe(false);
			expect(isMolecule(moleculeInterface())).toBe(false);
			expect(isMolecule(createScope("test"))).toBe(false);

			expect(isMolecule(molecule(() => 1))).toBe(true);
		});

		test("rejects bad values", () => {
			testRejectBadValue(isMolecule);
		});
	});

	describe("isMoleculeScope", () => {
		test("accepts valid molecule scopes", () => {
			expect(isMoleculeScope(molecule(() => 1))).toBe(false);
			expect(isMoleculeScope(createInjector())).toBe(false);
			expect(isMoleculeScope(moleculeInterface())).toBe(false);

			expect(isMoleculeScope(createScope("test"))).toBe(true);
		});

		test("rejects bad values", () => {
			testRejectBadValue(isMoleculeScope);
		});
	});

	describe("isMoleculeInterface", () => {
		test("accepts valid molecule interfaces", () => {
			expect(isMoleculeInterface(molecule(() => 1))).toBe(false);
			expect(isMoleculeInterface(createScope("test"))).toBe(false);
			expect(isMoleculeInterface(createInjector())).toBe(false);

			expect(isMoleculeInterface(moleculeInterface())).toBe(true);
		});

		test("rejects bad values", () => {
			testRejectBadValue(isMoleculeInterface);
		});
	});

	describe("isInjector", () => {
		test("accepts valid injectors", () => {
			expect(isInjector(molecule(() => 1))).toBe(false);
			expect(isInjector(createScope("test"))).toBe(false);
			expect(isInjector(moleculeInterface())).toBe(false);

			expect(isInjector(createInjector())).toBe(true);
		});

		test("rejects bad values", () => {
			testRejectBadValue(isInjector);
		});
	});

	function testRejectBadValue(fn: (value: any) => boolean) {
		expect(fn(null)).toBe(false);
		expect(fn(undefined)).toBe(false);
		expect(fn({})).toBe(false);
		expect(fn(0)).toBe(false);
		expect(fn(-1)).toBe(false);
		expect(fn(1)).toBe(false);
		expect(fn(1.12)).toBe(false);
		expect(fn(-3.14)).toBe(false);
		expect(fn(new Set())).toBe(false);
		expect(fn(new Map())).toBe(false);
		expect(fn(new WeakSet())).toBe(false);
		expect(fn(new WeakMap())).toBe(false);
		expect(fn(Number.NaN)).toBe(false);
		expect(fn(true)).toBe(false);
		expect(fn(false)).toBe(false);
		expect(fn("string")).toBe(false);
		expect(fn(Symbol("test"))).toBe(false);
		expect(fn(Symbol.for("test"))).toBe(false);

		class TestClass { }
		expect(fn(TestClass)).toBe(false);

		function TestFunction() { }
		expect(fn(TestFunction)).toBe(false);

		const target = {
			message1: "hello",
			message2: "everyone",
		};

		const handler1 = {};

		const proxy1 = new Proxy(target, handler1);

		expect(fn(proxy1)).toBe(false);
	}
}
