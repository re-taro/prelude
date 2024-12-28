/**
 * Promise, or maybe not
 */
export type Awaitable<T> = PromiseLike<T> | T;

/**
 * Null or whatever
 */
export type Nullable<T> = T | null | undefined;

/**
 * Array, or not yet
 */
export type Arrayable<T> = Array<T> | T;

/**
 * Function
 */
export type Fn<T = void> = () => T;

/**
 * Constructor
 */
export type Constructor<T = void> = new (...args: any[]) => T;

/**
 * Infers the element type of an array
 */
export type ElementOf<T> = T extends (infer E)[] ? E : never;

/**
 * Defines an intersection type of all union items.
 *
 * @param U Union of any types that will be intersected.
 * @returns U items intersected
 * @see https://stackoverflow.com/a/50375286/9259330
 */
export type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never;

/**
 * Infers the arguments type of a function
 */
export type ArgumentsType<T> = T extends ((...args: infer A) => any) ? A : never;

export type MergeInsertions<T> =
	T extends object
	? { [K in keyof T]: MergeInsertions<T[K]> }
	: T;

export type DeepMerge<F, S> = MergeInsertions<{
	[K in keyof F | keyof S]: K extends keyof F & keyof S
	? DeepMerge<F[K], S[K]>
	: K extends keyof S
	? S[K]
	: K extends keyof F
	? F[K]
	: never;
}>;

declare const tag: unique symbol;

interface TagContainer<Token> {
	readonly [tag]: Token;
}

type Tag<Token extends PropertyKey, TagMetadata> = TagContainer<{ [K in Token]: TagMetadata }>;

/**
 * Attach a "tag" to an arbitrary type. This allows you to create distinct types, that aren't assignable to one another, for distinct concepts in your program that should not be interchangeable, even if their runtime values have the same type. (See examples.)
 * A type returned by `Tagged` can be passed to `Tagged` again, to create a type with multiple tags.
 *
 * @example
 * ```ts
 * import type {Tagged} from '@re-taro/prelide/types';
 *
 * export type AccountNumber = Tagged<number, 'AccountNumber'>;
 * export const AccountNumber = {
 * 	of: (value: number): AccountNumber => value as AccountNumber,
 * };
 * export type AccountBalance = Tagged<number, 'AccountBalance'>;
 * export const AccountBalance = {
 * 	of: (value: number): AccountBalance => value as AccountBalance,
 * };
 * ```
 */
export type Tagged<Type, TagName extends PropertyKey, TagMetadata = never> = Tag<TagName, TagMetadata> & Type;

/**
 * Given a type and a tag name, returns the metadata associated with that tag on that type.
 *
 * @example
 * ```
 * import type {Tagged} from '@re-taro/prelude/types';
 *
 * type JsonOf<T> = Tagged<string, 'JSON', T>;
 *
 * function stringify<T>(it: T) {
 * 	return JSON.stringify(it) as JsonOf<T>;
 * }
 *
 * function parse<T extends JsonOf<unknown>>(it: T) {
 * 	return JSON.parse(it) as GetTagMetadata<T, 'JSON'>;
 * }
 *
 * const x = stringify({ hello: 'world' });
 * const parsed = parse(x); // The type of `parsed` is { hello: string }
```
 */
export type GetTagMetadata<Type extends Tag<TagName, unknown>, TagName extends PropertyKey> = Type[typeof tag][TagName];

if (import.meta.vitest) {
	const { assertType, describe, expectTypeOf, test } = import.meta.vitest;

	describe("Types", () => {
		test("UnionToIntersection", () => {
			expectTypeOf<UnionToIntersection<{ a: string } | { b: number }>>().toEqualTypeOf<{ a: string } & { b: number }>();
		});
		test("MergeInsertions", () => {
			expectTypeOf<MergeInsertions<{ a: { b: number } } & { a: { c: string } }>>().toEqualTypeOf<{ a: { b: number; c: string } }>();
		});
		test("DeepMerge", () => {
			expectTypeOf<DeepMerge<{ a: { b: string } }, { a: { c: number } }>>().toEqualTypeOf<{ a: { b: string; c: number } }>();
		});
		test("Tagged", () => {
			type JsonOf<T> = Tagged<string, "JSON", T>;

			function stringify<T>(it: T) {
				return JSON.stringify(it) as JsonOf<T>;
			}

			function parse<T extends JsonOf<unknown>>(it: T) {
				return JSON.parse(it) as GetTagMetadata<typeof it, "JSON">;
			}

			const x = stringify({ hello: "world" });
			const parsed = parse(x);

			assertType<{ hello: string }>(parsed);
		});
	});
}
