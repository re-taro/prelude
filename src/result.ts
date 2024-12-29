/* eslint-disable node/handle-callback-err */

import type { InferAsyncErrTypes, InferAsyncOkTypes, InferErrTypes, InferOkTypes } from "./_internal/result.js";

// @__NO_SIDE_EFFECTS__
export function ok<T, E = never>(value: T): Ok<T, E>;
// @__NO_SIDE_EFFECTS__
// eslint-disable-next-line unused-imports/no-unused-vars
export function ok<T extends void = void, E = never>(value: void): Ok<void, E>;
// @__NO_SIDE_EFFECTS__
export function ok<T, E = never>(value: T): Ok<T, E> {
	return new Ok(value);
}

// @__NO_SIDE_EFFECTS__
export function err<T = never, E extends string = string>(err: E): Err<T, E>;
// @__NO_SIDE_EFFECTS__
export function err<T = never, E = unknown>(err: E): Err<T, E>;
// @__NO_SIDE_EFFECTS__
// eslint-disable-next-line unused-imports/no-unused-vars
export function err<T = never, E extends void = void>(err: void): Err<T, void>;
// @__NO_SIDE_EFFECTS__
export function err<T = never, E = unknown>(err: E): Err<T, E> {
	return new Err(err);
}

// @__NO_SIDE_EFFECTS__
export function okAsync<T, E = never>(value: T): ResultAsync<T, E>;
// @__NO_SIDE_EFFECTS__
// eslint-disable-next-line unused-imports/no-unused-vars
export function okAsync<T extends void = void, E = never>(value: void): ResultAsync<void, E>;
// @__NO_SIDE_EFFECTS__
export function okAsync<T, E = never>(value: T): ResultAsync<T, E> {
	return new ResultAsync(Promise.resolve(new Ok<T, E>(value)));
}

// @__NO_SIDE_EFFECTS__
export function errAsync<T = never, E = unknown>(err: E): ResultAsync<T, E>;
// @__NO_SIDE_EFFECTS__
// eslint-disable-next-line unused-imports/no-unused-vars
export function errAsync<T = never, E extends void = void>(err: void): ResultAsync<T, void>;
// @__NO_SIDE_EFFECTS__
export function errAsync<T = never, E = unknown>(err: E): ResultAsync<T, E> {
	return new ResultAsync(Promise.resolve(new Err<T, E>(err)));
}

/**
 * Evaluates the given generator to a Result returned or an Err yielded from it,
 * whichever comes first.
 *
 * This function is intended to emulate Rust's ? operator.
 * See `/tests/safeTry.test.ts` for examples.
 *
 * @param body - What is evaluated. In body, `yield* result` works as
 * Rust's `result?` expression.
 * @returns The first occurrence of either an yielded Err or a returned Result.
 */
export function safeTry<T, E>(body: () => Generator<Err<never, E>, Result<T, E>>): Result<T, E>;
export function safeTry<
	YieldErr extends Err<never, unknown>,
	GeneratorReturnResult extends Result<unknown, unknown>,
>(
	body: () => Generator<YieldErr, GeneratorReturnResult>,
): Result<
	InferOkTypes<GeneratorReturnResult>,
	InferErrTypes<GeneratorReturnResult> | InferErrTypes<YieldErr>
>;

/**
 * Evaluates the given generator to a Result returned or an Err yielded from it,
 * whichever comes first.
 *
 * This function is intended to emulate Rust's ? operator.
 * See `/tests/safeTry.test.ts` for examples.
 *
 * @param body - What is evaluated. In body, `yield* result` and
 * `yield* resultAsync` work as Rust's `result?` expression.
 * @returns The first occurrence of either an yielded Err or a returned Result.
 */
export function safeTry<T, E>(
	body: () => AsyncGenerator<Err<never, E>, Result<T, E>>,
): ResultAsync<T, E>;
export function safeTry<
	YieldErr extends Err<never, unknown>,
	GeneratorReturnResult extends Result<unknown, unknown>,
>(
	body: () => AsyncGenerator<YieldErr, GeneratorReturnResult>,
): ResultAsync<
	InferOkTypes<GeneratorReturnResult>,
	InferErrTypes<GeneratorReturnResult> | InferErrTypes<YieldErr>
>;
export function safeTry<T, E>(
	body:
		| (() => AsyncGenerator<Err<never, E>, Result<T, E>>)
		| (() => Generator<Err<never, E>, Result<T, E>>),
): Result<T, E> | ResultAsync<T, E> {
	const n = body().next();
	if (n instanceof Promise) {
		return new ResultAsync(n.then(r => r.value));
	}
	return n.value;
}

/**
 * Wraps a function with a try catch, creating a new function with the same
 * arguments but returning `Ok` if successful, `Err` if the function throws
 *
 * @param fn function to wrap with ok on success or err on failure
 * @param errorFn when an error is thrown, this will wrap the error result if provided
 */
export function fromThrowable<Fn extends (...args: readonly any[]) => any, E>(
	fn: Fn,
	errorFn?: (e: unknown) => E,
): (...args: Parameters<Fn>) => Result<ReturnType<Fn>, E> {
	return (...args) => {
		try {
			const result = fn(...args);
			return ok(result);
		}
		catch (e) {
			if (errorFn) {
				return err(errorFn(e));
			}
			return err(e as E);
		}
	};
}

export type Result<T, E> = Err<T, E> | Ok<T, E>;

interface IResult<T, E> {
	/**
	 * **This method is unsafe, and should only be used in a test environments**
	 *
	 * Takes a `Result<T, E>` and returns a `T` when the result is an `Ok`, otherwise it throws a custom object.
	 */
	_unsafeUnwrap: () => T;

	/**
	 * **This method is unsafe, and should only be used in a test environments**
	 *
	 * takes a `Result<T, E>` and returns a `E` when the result is an `Err`,
	 * otherwise it throws a custom object.
	 */
	_unsafeUnwrapErr: () => E;

	/**
	 * This "tee"s the current value to an passed-in computation such as side
	 * effect functions but still returns the same current value as the result.
	 *
	 * This is useful when you want to pass the current result to your side-track
	 * work such as logging but want to continue main-track work after that.
	 * This method does not care about the result of the passed in computation.
	 *
	 * @param f The function to apply to the current value
	 */
	andTee: (f: (t: T) => unknown) => Result<T, E>;

	/**
	 * Similar to `map` Except you must return a new `Result`.
	 *
	 * This is useful for when you need to do a subsequent computation using the
	 * inner `T` value, but that computation might fail.
	 * Additionally, `andThen` is really useful as a tool to flatten a
	 * `Result<Result<A, E2>, E1>` into a `Result<A, E2>` (see example below).
	 *
	 * @param f The function to apply to the current value
	 */
	andThen: (<R extends Result<unknown, unknown>>(
		f: (t: T) => R,
	) => Result<InferOkTypes<R>, E | InferErrTypes<R>>) & (<U, F>(f: (t: T) => Result<U, F>) => Result<U, E | F>);

	/**
	 * Similar to `andTee` except error result of the computation will be passed
	 * to the downstream in case of an error.
	 *
	 * This version is useful when you want to make side-effects but in case of an
	 * error, you want to pass the error to the downstream.
	 *
	 * @param f The function to apply to the current value
	 */
	andThrough: (<F>(f: (t: T) => Result<unknown, F>) => Result<T, E | F>) & (<R extends Result<unknown, unknown>>(f: (t: T) => R) => Result<T, E | InferErrTypes<R>>);

	/**
	 * Similar to `map` Except you must return a new `Result`.
	 *
	 * This is useful for when you need to do a subsequent async computation using
	 * the inner `T` value, but that computation might fail. Must return a ResultAsync
	 *
	 * @param f The function that returns a `ResultAsync` to apply to the current
	 * value
	 */
	asyncAndThen: <U, F>(f: (t: T) => ResultAsync<U, F>) => ResultAsync<U, E | F>;

	/**
	 * Maps a `Result<T, E>` to `ResultAsync<U, E>`
	 * by applying an async function to a contained `Ok` value, leaving an `Err`
	 * value untouched.
	 *
	 * @param f An async function to apply an `OK` value
	 */
	asyncMap: <U>(f: (t: T) => Promise<U>) => ResultAsync<U, E>;

	/**
	 * Used to check if a `Result` is an `Err`
	 *
	 * @returns `true` if the result is an `Err` variant of Result
	 */
	isErr: () => this is Err<T, E>;

	/**
	 * Used to check if a `Result` is an `OK`
	 *
	 * @returns `true` if the result is an `OK` variant of Result
	 */
	isOk: () => this is Ok<T, E>;

	/**
	 * Maps a `Result<T, E>` to `Result<U, E>`
	 * by applying a function to a contained `Ok` value, leaving an `Err` value
	 * untouched.
	 *
	 * @param f The function to apply an `OK` value
	 * @returns the result of applying `f` or an `Err` untouched
	 */
	map: <A>(f: (t: T) => A) => Result<A, E>;

	/**
	 * Maps a `Result<T, E>` to `Result<T, F>` by applying a function to a
	 * contained `Err` value, leaving an `Ok` value untouched.
	 *
	 * This function can be used to pass through a successful result while
	 * handling an error.
	 *
	 * @param f a function to apply to the error `Err` value
	 */
	mapErr: <U>(f: (e: E) => U) => Result<T, U>;

	/**
	 *
	 * Given 2 functions (one for the `Ok` variant and one for the `Err` variant)
	 * execute the function that matches the `Result` variant.
	 *
	 * Match callbacks do not necessitate to return a `Result`, however you can
	 * return a `Result` if you want to.
	 *
	 * `match` is like chaining `map` and `mapErr`, with the distinction that
	 * with `match` both functions must have the same return type.
	 *
	 * @param ok
	 * @param err
	 */
	match: <A, B = A>(ok: (t: T) => A, err: (e: E) => B) => A | B;

	/**
	 * Takes an `Err` value and maps it to a `Result<T, SomeNewType>`.
	 *
	 * This is useful for error recovery.
	 *
	 *
	 * @param f  A function to apply to an `Err` value, leaving `Ok` values
	 * untouched.
	 */
	orElse: (<R extends Result<unknown, unknown>>(
		f: (e: E) => R,
	) => Result<InferOkTypes<R> | T, InferErrTypes<R>>) & (<U, A>(f: (e: E) => Result<U, A>) => Result<T | U, A>);

	/**
	 * Unwrap the `Ok` value, or return the default if there is an `Err`
	 *
	 * @param v the default value to return if there is an `Err`
	 */
	unwrapOr: <A>(v: A) => A | T;
}

export class Ok<T, E> implements IResult<T, E> {
	constructor(readonly value: T) { }

	isOk(): this is Ok<T, E> {
		return true;
	}

	isErr(): this is Err<T, E> {
		return !this.isOk();
	}

	map<A>(f: (t: T) => A): Result<A, E> {
		return ok(f(this.value));
	}

	mapErr<U>(_f: (e: E) => U): Result<T, U> {
		return ok(this.value);
	}

	andThen<R extends Result<unknown, unknown>>(
		f: (t: T) => R,
	): Result<InferOkTypes<R>, E | InferErrTypes<R>>;
	andThen<U, F>(f: (t: T) => Result<U, F>): Result<U, E | F>;
	andThen(f: any): any {
		return f(this.value);
	}

	andThrough<R extends Result<unknown, unknown>>(f: (t: T) => R): Result<T, E | InferErrTypes<R>>;
	andThrough<F>(f: (t: T) => Result<unknown, F>): Result<T, E | F>;
	andThrough(f: any): any {
		return f(this.value).map((_value: unknown) => this.value);
	}

	andTee(f: (t: T) => unknown): Result<T, E> {
		try {
			f(this.value);
		}
		catch {
			// Tee doesn't care about the error
		}
		return ok<T, E>(this.value);
	}

	orElse<R extends Result<unknown, unknown>>(
		_f: (e: E) => R,
	): Result<InferOkTypes<R> | T, InferErrTypes<R>>;
	orElse<U, A>(_f: (e: E) => Result<U, A>): Result<T | U, A>;
	orElse(_f: any): any {
		return ok(this.value);
	}

	asyncAndThen<U, F>(f: (t: T) => ResultAsync<U, F>): ResultAsync<U, E | F> {
		return f(this.value);
	}

	asyncAndThrough<R extends ResultAsync<unknown, unknown>>(
		f: (t: T) => R,
	): ResultAsync<T, E | InferAsyncErrTypes<R>>;
	asyncAndThrough<F>(f: (t: T) => ResultAsync<unknown, F>): ResultAsync<T, E | F>;
	asyncAndThrough(f: (t: T) => ResultAsync<unknown, unknown>): any {
		return f(this.value).map(() => this.value);
	}

	asyncMap<U>(f: (t: T) => Promise<U>): ResultAsync<U, E> {
		return ResultAsync.fromSafePromise(f(this.value));
	}

	unwrapOr<A>(_v: A): A | T {
		return this.value;
	}

	match<A, B = A>(ok: (t: T) => A, _err: (e: E) => B): A | B {
		return ok(this.value);
	}

	_unsafeUnwrap(): T {
		return this.value;
	}

	_unsafeUnwrapErr(): E {
		throw new Error("Called `_unsafeUnwrapErr` on an Ok");
	}

	*[Symbol.iterator](): Generator<Err<never, E>, T> {
		return this.value;
	}
}

export class Err<T, E> implements IResult<T, E> {
	constructor(readonly error: E) { }

	isOk(): this is Ok<T, E> {
		return false;
	}

	isErr(): this is Err<T, E> {
		return !this.isOk();
	}

	map<A>(_f: (t: T) => A): Result<A, E> {
		return err(this.error);
	}

	mapErr<U>(f: (e: E) => U): Result<T, U> {
		return err(f(this.error));
	}

	andThrough<R extends Result<unknown, unknown>>(_f: (t: T) => R): Result<T, E | InferErrTypes<R>> {
		return err(this.error);
	}

	andTee(_f: (t: T) => unknown): Result<T, E> {
		return err(this.error);
	}

	andThen<R extends Result<unknown, unknown>>(
		_f: (t: T) => R,
	): Result<InferOkTypes<R>, E | InferErrTypes<R>>;
	andThen<U, F>(_f: (t: T) => Result<U, F>): Result<U, E | F>;
	andThen(_f: any): any {
		return err(this.error);
	}

	orElse<R extends Result<unknown, unknown>>(
		f: (e: E) => R,
	): Result<InferOkTypes<R> | T, InferErrTypes<R>>;
	orElse<U, A>(f: (e: E) => Result<U, A>): Result<T | U, A>;
	orElse(f: any): any {
		return f(this.error);
	}

	asyncAndThen<U, F>(_f: (t: T) => ResultAsync<U, F>): ResultAsync<U, E | F> {
		return errAsync<U, E>(this.error);
	}

	asyncAndThrough<F>(_f: (t: T) => ResultAsync<unknown, F>): ResultAsync<T, E | F> {
		return errAsync<T, E>(this.error);
	}

	asyncMap<U>(_f: (t: T) => Promise<U>): ResultAsync<U, E> {
		return errAsync<U, E>(this.error);
	}

	unwrapOr<A>(v: A): A | T {
		return v;
	}

	match<A, B = A>(_ok: (t: T) => A, err: (e: E) => B): A | B {
		return err(this.error);
	}

	_unsafeUnwrap(): T {
		throw new Error("Called `_unsafeUnwrap` on an Err");
	}

	_unsafeUnwrapErr(): E {
		return this.error;
	}

	*[Symbol.iterator](): Generator<Err<never, E>, T> {
		// eslint-disable-next-line ts/no-this-alias
		const self = this;
		// @ts-expect-error -- This is structurally equivalent and safe
		yield self;
		// @ts-expect-error -- This is structurally equivalent and safe
		return self;
	}
}

export class ResultAsync<T, E> implements PromiseLike<Result<T, E>> {
	#promise: Promise<Result<T, E>>;

	constructor(res: Promise<Result<T, E>>) {
		this.#promise = res;
	}

	static fromSafePromise<T, E = never>(promise: PromiseLike<T>): ResultAsync<T, E>;
	static fromSafePromise<T, E = never>(promise: Promise<T>): ResultAsync<T, E> {
		const newPromise = promise.then((value: T) => new Ok<T, E>(value));

		return new ResultAsync(newPromise);
	}

	static fromPromise<T, E>(promise: PromiseLike<T>, errorFn: (e: unknown) => E): ResultAsync<T, E>;
	static fromPromise<T, E>(promise: Promise<T>, errorFn: (e: unknown) => E): ResultAsync<T, E> {
		const newPromise = promise
			.then((value: T) => new Ok<T, E>(value))
			.catch(e => new Err<T, E>(errorFn(e)));

		return new ResultAsync(newPromise);
	}

	static fromThrowable<A extends readonly any[], R, E>(
		fn: (...args: A) => Promise<R>,
		errorFn?: (err: unknown) => E,
	): (...args: A) => ResultAsync<R, E> {
		return (...args) => {
			return new ResultAsync(
				(async () => {
					try {
						return new Ok(await fn(...args));
					}
					catch (error) {
						if (errorFn) {
							return new Err<R, E>(errorFn(error));
						}
						else {
							return new Err<R, E>(error as E);
						}
					}
				})(),
			);
		};
	}

	map<A>(f: (t: T) => A | Promise<A>): ResultAsync<A, E> {
		return new ResultAsync(
			this.#promise.then(async (res: Result<T, E>) => {
				if (res.isErr()) {
					return new Err<A, E>(res.error);
				}

				return new Ok<A, E>(await f(res.value));
			}),
		);
	}

	andThrough<F>(f: (t: T) => Result<unknown, F> | ResultAsync<unknown, F>): ResultAsync<T, E | F> {
		return new ResultAsync(
			this.#promise.then(async (res: Result<T, E>) => {
				if (res.isErr()) {
					return new Err<T, E>(res.error);
				}

				const newRes = await f(res.value);
				if (newRes.isErr()) {
					return new Err<T, F>(newRes.error);
				}
				return new Ok<T, F>(res.value);
			}),
		);
	}

	andTee(f: (t: T) => unknown): ResultAsync<T, E> {
		return new ResultAsync(
			this.#promise.then(async (res: Result<T, E>) => {
				if (res.isErr()) {
					return new Err<T, E>(res.error);
				}
				try {
					await f(res.value);
				}
				catch {
					// Tee does not care about the error
				}
				return new Ok<T, E>(res.value);
			}),
		);
	}

	mapErr<U>(f: (e: E) => Promise<U> | U): ResultAsync<T, U> {
		return new ResultAsync(
			this.#promise.then(async (res: Result<T, E>) => {
				if (res.isOk()) {
					return new Ok<T, U>(res.value);
				}

				return new Err<T, U>(await f(res.error));
			}),
		);
	}

	andThen<R extends Result<unknown, unknown>>(
		f: (t: T) => R,
	): ResultAsync<InferOkTypes<R>, E | InferErrTypes<R>>;
	andThen<R extends ResultAsync<unknown, unknown>>(
		f: (t: T) => R,
	): ResultAsync<InferAsyncOkTypes<R>, E | InferAsyncErrTypes<R>>;
	andThen<U, F>(f: (t: T) => Result<U, F> | ResultAsync<U, F>): ResultAsync<U, E | F>;
	andThen(f: any): any {
		return new ResultAsync(
			this.#promise.then((res) => {
				if (res.isErr()) {
					return new Err<never, E>(res.error);
				}

				const newValue = f(res.value);
				return newValue instanceof ResultAsync ? newValue.#promise : newValue;
			}),
		);
	}

	orElse<R extends Result<unknown, unknown>>(
		f: (e: E) => R,
	): ResultAsync<InferOkTypes<R> | T, InferErrTypes<R>>;
	orElse<R extends ResultAsync<unknown, unknown>>(
		f: (e: E) => R,
	): ResultAsync<InferAsyncOkTypes<R> | T, InferAsyncErrTypes<R>>;
	orElse<U, A>(f: (e: E) => Result<U, A> | ResultAsync<U, A>): ResultAsync<T | U, A>;
	orElse(f: any): any {
		return new ResultAsync(
			this.#promise.then(async (res: Result<T, E>) => {
				if (res.isErr()) {
					return f(res.error);
				}

				return new Ok<T, unknown>(res.value);
			}),
		);
	}

	async match<A, B = A>(ok: (t: T) => A, _err: (e: E) => B): Promise<A | B> {
		const res = await this;
		return res.match(ok, _err);
	}

	async unwrapOr<A>(t: A): Promise<A | T> {
		const res = await this;
		return res.unwrapOr(t);
	}

	// Makes ResultAsync implement PromiseLike<Result>
	then<A, B>(
		successCallback?: (res: Result<T, E>) => A | PromiseLike<A>,
		failureCallback?: (reason: unknown) => B | PromiseLike<B>,
	): PromiseLike<A | B> {
		return this.#promise.then(successCallback, failureCallback);
	}

	async *[Symbol.asyncIterator](): AsyncGenerator<Err<never, E>, T> {
		const result = await this.#promise;

		if (result.isErr()) {
			// @ts-expect-error -- This is structurally equivalent and safe
			yield errAsync(result.error);
		}

		// @ts-expect-error -- This is structurally equivalent and safe
		return result.value;
	}
}

export const fromPromise: <T, E>(promise: PromiseLike<T>, errorFn: (e: unknown) => E) => ResultAsync<T, E> = ResultAsync.fromPromise;
export const fromSafePromise: <T, E = never>(promise: PromiseLike<T>) => ResultAsync<T, E> = ResultAsync.fromSafePromise;

export const fromAsyncThrowable: <A extends readonly any[], R, E>(fn: (...args: A) => Promise<R>, errorFn?: (err: unknown) => E) => (...args: A) => ResultAsync<R, E> = ResultAsync.fromThrowable;

if (import.meta.vitest) {
	const { describe, expect, test, vitest } = import.meta.vitest;

	describe("Result", () => {
		describe("Ok", () => {
			test("Creates an Ok value", () => {
				const okVal = ok(12);

				expect(okVal.isOk()).toBe(true);
				expect(okVal.isErr()).toBe(false);
				expect(okVal).toBeInstanceOf(Ok);
			});

			test("Creates an Ok value with null", () => {
				const okVal = ok(null);

				expect(okVal.isOk()).toBe(true);
				expect(okVal.isErr()).toBe(false);
				expect(okVal._unsafeUnwrap()).toBe(null);
			});

			test("Creates an Ok value with undefined", () => {
				const okVal = ok(undefined);

				expect(okVal.isOk()).toBe(true);
				expect(okVal.isErr()).toBe(false);
				expect(okVal._unsafeUnwrap()).toBeUndefined();
			});

			test("Is comparable", () => {
				expect(ok(42)).toEqual(ok(42));
				expect(ok(42)).not.toEqual(ok(43));
			});

			test("Maps over an Ok value", () => {
				const okVal = ok(12);
				const mapFn = vitest.fn(number => number.toString());

				const mapped = okVal.map(mapFn);

				expect(mapped.isOk()).toBe(true);
				expect(mapped._unsafeUnwrap()).toBe("12");
				expect(mapFn).toHaveBeenCalledTimes(1);
			});

			test("Skips `mapErr`", () => {
				const mapErrorFunc = vitest.fn(_error => "mapped error value");

				const notMapped = ok(12).mapErr(mapErrorFunc);

				expect(notMapped.isOk()).toBe(true);
				expect(mapErrorFunc).not.toHaveBeenCalledTimes(1);
			});

			describe("andThen", () => {
				test("Maps to an Ok", () => {
					const okVal = ok(12);

					const flattened = okVal.andThen((_number) => {
						// ...
						// complex logic
						// ...
						return ok({ data: "why not" });
					});

					expect(flattened.isOk()).toBe(true);
					expect(flattened._unsafeUnwrap()).toStrictEqual({ data: "why not" });
				});

				test("Maps to an Err", () => {
					const okval = ok(12);

					const flattened = okval.andThen((_number) => {
						// ...
						// complex logic
						// ...
						return err("Whoopsies!");
					});

					expect(flattened.isOk()).toBe(false);

					const nextFn = vitest.fn(_val => ok("noop"));

					flattened.andThen(nextFn);

					expect(nextFn).not.toHaveBeenCalled();
				});
			});

			describe("andThrough", () => {
				test("Calls the passed function but returns an original ok", () => {
					const okVal = ok(12);
					const passedFn = vitest.fn(_number => ok(undefined));

					const thrued = okVal.andThrough(passedFn);
					expect(thrued.isOk()).toBe(true);
					expect(passedFn).toHaveBeenCalledTimes(1);
					expect(thrued._unsafeUnwrap()).toStrictEqual(12);
				});

				test("Maps to an Err", () => {
					const okval = ok(12);

					const thrued = okval.andThen((_number) => {
						// ...
						// complex logic
						// ...
						return err("Whoopsies!");
					});

					expect(thrued.isOk()).toBe(false);
					expect(thrued._unsafeUnwrapErr()).toStrictEqual("Whoopsies!");

					const nextFn = vitest.fn(_val => ok("noop"));

					thrued.andThen(nextFn);

					expect(nextFn).not.toHaveBeenCalled();
				});
			});

			describe("andTee", () => {
				test("Calls the passed function but returns an original ok", () => {
					const okVal = ok(12);
					const passedFn = vitest.fn((_number) => { });

					const teed = okVal.andTee(passedFn);

					expect(teed.isOk()).toBe(true);
					expect(passedFn).toHaveBeenCalledTimes(1);
					expect(teed._unsafeUnwrap()).toStrictEqual(12);
				});
				test("returns an original ok even when the passed function fails", () => {
					const okVal = ok(12);
					const passedFn = vitest.fn((_number) => {
						throw new Error("OMG!");
					});

					const teed = okVal.andTee(passedFn);

					expect(teed.isOk()).toBe(true);
					expect(passedFn).toHaveBeenCalledTimes(1);
					expect(teed._unsafeUnwrap()).toStrictEqual(12);
				});
			});

			describe("asyncAndThrough", () => {
				test("Calls the passed function but returns an original ok as Async", async () => {
					const okVal = ok(12);
					const passedFn = vitest.fn(_number => okAsync(undefined));

					const teedAsync = okVal.asyncAndThrough(passedFn);
					expect(teedAsync).toBeInstanceOf(ResultAsync);
					const teed = await teedAsync;
					expect(teed.isOk()).toBe(true);
					expect(passedFn).toHaveBeenCalledTimes(1);
					expect(teed._unsafeUnwrap()).toStrictEqual(12);
				});

				test("Maps to an Err", async () => {
					const okval = ok(12);

					const teedAsync = okval.asyncAndThen((_number) => {
						// ...
						// complex logic
						// ...
						return errAsync("Whoopsies!");
					});
					expect(teedAsync).toBeInstanceOf(ResultAsync);
					const teed = await teedAsync;
					expect(teed.isOk()).toBe(false);
					expect(teed._unsafeUnwrapErr()).toStrictEqual("Whoopsies!");

					const nextFn = vitest.fn(_val => ok("noop"));

					teed.andThen(nextFn);

					expect(nextFn).not.toHaveBeenCalled();
				});
			});
			describe("orElse", () => {
				test("Skips orElse on an Ok value", () => {
					const okVal = ok(12);
					const errorCallback = vitest.fn(_errVal => err<number, string>("It is now a string"));

					expect(okVal.orElse(errorCallback)).toEqual(ok(12));
					expect(errorCallback).not.toHaveBeenCalled();
				});
			});

			test("unwrapOr and return the Ok value", () => {
				const okVal = ok(12);
				expect(okVal.unwrapOr(1)).toEqual(12);
			});

			test("Maps to a ResultAsync", async () => {
				const okVal = ok(12);

				const flattened = okVal.asyncAndThen((_number) => {
					// ...
					// complex async logic
					// ...
					return okAsync({ data: "why not" });
				});

				expect(flattened).toBeInstanceOf(ResultAsync);

				const newResult = await flattened;

				expect(newResult.isOk()).toBe(true);
				expect(newResult._unsafeUnwrap()).toStrictEqual({ data: "why not" });
			});

			test("Maps to a promise", async () => {
				const asyncMapper = vitest.fn((_val) => {
					// ...
					// complex logic
					// ..

					// db queries
					// network calls
					// disk io
					// etc ...
					return Promise.resolve("Very Nice!");
				});

				const okVal = ok(12);

				const promise = okVal.asyncMap(asyncMapper);

				expect(promise).toBeInstanceOf(ResultAsync);

				const newResult = await promise;

				expect(newResult.isOk()).toBe(true);
				expect(asyncMapper).toHaveBeenCalledTimes(1);
				expect(newResult._unsafeUnwrap()).toStrictEqual("Very Nice!");
			});

			test("Matches on an Ok", () => {
				const okMapper = vitest.fn(_val => "weeeeee");
				const errMapper = vitest.fn(_val => "wooooo");

				const matched = ok(12).match(okMapper, errMapper);

				expect(matched).toBe("weeeeee");
				expect(okMapper).toHaveBeenCalledTimes(1);
				expect(errMapper).not.toHaveBeenCalled();
			});

			test("Unwraps without issue", () => {
				const okVal = ok(12);

				expect(okVal._unsafeUnwrap()).toBe(12);
			});

			test("Can read the value after narrowing", () => {
				const fallible: () => Result<string, number> = () => ok("safe to read");
				const val = fallible();

				// After this check we val is narrowed to Ok<string, number>. Without this
				// line TypeScript will not allow accessing val.value.
				if (val.isErr())
					return;

				expect(val.value).toBe("safe to read");
			});
		});

		describe("Err", () => {
			test("Creates an Err value", () => {
				const errVal = err("I have you now.");

				expect(errVal.isOk()).toBe(false);
				expect(errVal.isErr()).toBe(true);
				expect(errVal).toBeInstanceOf(Err);
			});

			test("Is comparable", () => {
				expect(err(42)).toEqual(err(42));
				expect(err(42)).not.toEqual(err(43));
			});

			test("Skips `map`", () => {
				const errVal = err("I am your father");

				const mapper = vitest.fn(_value => "noooo");

				const hopefullyNotMapped = errVal.map(mapper);

				expect(hopefullyNotMapped.isErr()).toBe(true);
				expect(mapper).not.toHaveBeenCalled();
				expect(hopefullyNotMapped._unsafeUnwrapErr()).toEqual(errVal._unsafeUnwrapErr());
			});

			test("Maps over an Err", () => {
				const errVal = err("Round 1, Fight!");

				const mapper = vitest.fn((error: string) => error.replace("1", "2"));

				const mapped = errVal.mapErr(mapper);

				expect(mapped.isErr()).toBe(true);
				expect(mapper).toHaveBeenCalledTimes(1);
				expect(mapped._unsafeUnwrapErr()).not.toEqual(errVal._unsafeUnwrapErr());
			});

			test("unwrapOr and return the default value", () => {
				const okVal = err<number, string>("Oh nooo");
				expect(okVal.unwrapOr(1)).toEqual(1);
			});

			test("Skips over andThen", () => {
				const errVal = err("Yolo");

				const mapper = vitest.fn(_val => ok<string, string>("yooyo"));

				const hopefullyNotFlattened = errVal.andThen(mapper);

				expect(hopefullyNotFlattened.isErr()).toBe(true);
				expect(mapper).not.toHaveBeenCalled();
				expect(errVal._unsafeUnwrapErr()).toEqual("Yolo");
			});

			test("Skips over andThrough", () => {
				const errVal = err("Yolo");

				const mapper = vitest.fn(_val => ok<void, string>(undefined));

				const hopefullyNotFlattened = errVal.andThrough(mapper);

				expect(hopefullyNotFlattened.isErr()).toBe(true);
				expect(mapper).not.toHaveBeenCalled();
				expect(errVal._unsafeUnwrapErr()).toEqual("Yolo");
			});

			test("Skips over andTee", () => {
				const errVal = err("Yolo");

				const mapper = vitest.fn((_val) => { });

				const hopefullyNotFlattened = errVal.andTee(mapper);

				expect(hopefullyNotFlattened.isErr()).toBe(true);
				expect(mapper).not.toHaveBeenCalled();
				expect(errVal._unsafeUnwrapErr()).toEqual("Yolo");
			});

			test("Skips over asyncAndThrough but returns ResultAsync instead", async () => {
				const errVal = err("Yolo");

				const mapper = vitest.fn(_val => okAsync<string, unknown>("Async"));

				const hopefullyNotFlattened = errVal.asyncAndThrough(mapper);
				expect(hopefullyNotFlattened).toBeInstanceOf(ResultAsync);

				const result = await hopefullyNotFlattened;
				expect(result.isErr()).toBe(true);
				expect(mapper).not.toHaveBeenCalled();
				expect(result._unsafeUnwrapErr()).toEqual("Yolo");
			});

			test("Transforms error into ResultAsync within `asyncAndThen`", async () => {
				const errVal = err("Yolo");

				const asyncMapper = vitest.fn(_val => okAsync<string, string>("yooyo"));

				const hopefullyNotFlattened = errVal.asyncAndThen(asyncMapper);

				expect(hopefullyNotFlattened).toBeInstanceOf(ResultAsync);
				expect(asyncMapper).not.toHaveBeenCalled();

				const syncResult = await hopefullyNotFlattened;
				expect(syncResult._unsafeUnwrapErr()).toEqual("Yolo");
			});

			test("Does not invoke callback within `asyncMap`", async () => {
				const asyncMapper = vitest.fn((_val) => {
					// ...
					// complex logic
					// ..

					// db queries
					// network calls
					// disk io
					// etc ...
					return Promise.resolve("Very Nice!");
				});

				const errVal = err("nooooooo");

				const promise = errVal.asyncMap(asyncMapper);

				expect(promise).toBeInstanceOf(ResultAsync);

				const sameResult = await promise;

				expect(sameResult.isErr()).toBe(true);
				expect(asyncMapper).not.toHaveBeenCalled();
				expect(sameResult._unsafeUnwrapErr()).toEqual(errVal._unsafeUnwrapErr());
			});

			test("Matches on an Err", () => {
				const okMapper = vitest.fn(_val => "weeeeee");
				const errMapper = vitest.fn(_val => "wooooo");

				const matched = err(12).match(okMapper, errMapper);

				expect(matched).toBe("wooooo");
				expect(okMapper).not.toHaveBeenCalled();
				expect(errMapper).toHaveBeenCalledTimes(1);
			});

			test("Throws when you unwrap an Err", () => {
				const errVal = err("woopsies");

				expect(() => {
					errVal._unsafeUnwrap();
				}).toThrowError();
			});

			test("Unwraps without issue", () => {
				const okVal = err(12);

				expect(okVal._unsafeUnwrapErr()).toBe(12);
			});

			describe("orElse", () => {
				test("invokes the orElse callback on an Err value", () => {
					const okVal = err("BOOOM!");
					const errorCallback = vitest.fn(_errVal => err(true));

					expect(okVal.orElse(errorCallback)).toEqual(err(true));
					expect(errorCallback).toHaveBeenCalledTimes(1);
				});
			});
		});

		describe("fromThrowable", () => {
			test("Creates a function that returns an OK result when the inner function does not throw", () => {
				const hello = (): string => "hello";
				const safeHello = fromThrowable(hello);

				const result = hello();
				const safeResult = safeHello();

				expect(safeResult).toBeInstanceOf(Ok);
				expect(result).toEqual(safeResult._unsafeUnwrap());
			});

			// Added for issue #300 -- the test here is not so much that expectations are met as that the test compiles.
			test("Accepts an inner function which takes arguments", () => {
				const hello = (fname: string): string => `hello, ${fname}`;
				const safeHello = fromThrowable(hello);

				const result = hello("Dikembe");
				const safeResult = safeHello("Dikembe");

				expect(safeResult).toBeInstanceOf(Ok);
				expect(result).toEqual(safeResult._unsafeUnwrap());
			});

			test("Creates a function that returns an err when the inner function throws", () => {
				const thrower = (): string => {
					throw new Error("error");
				};

				// type: () => Result<string, unknown>
				// received types from thrower fn, no errorFn is provides therefore Err type is unknown
				const safeThrower = fromThrowable(thrower);
				const result = safeThrower();

				expect(result).toBeInstanceOf(Err);
				expect(result._unsafeUnwrapErr()).toBeInstanceOf(Error);
			});

			test("Accepts an error handler as a second argument", () => {
				const thrower = (): string => {
					throw new Error("error");
				};
				interface MessageObject { message: string }
				const toMessageObject = (): MessageObject => ({ message: "error" });

				// type: () => Result<string, MessageObject>
				// received types from thrower fn and errorFn return type
				const safeThrower = fromThrowable(thrower, toMessageObject);
				const result = safeThrower();

				expect(result.isOk()).toBe(false);
				expect(result.isErr()).toBe(true);
				expect(result).toBeInstanceOf(Err);
				expect(result._unsafeUnwrapErr()).toEqual({ message: "error" });
			});

			test("has a top level export", () => {
				expect(fromThrowable).toBe(fromThrowable);
			});
		});
	});

	describe("ResultAsync", () => {
		test("Is awaitable to a Result", async () => {
			// For a success value
			const asyncVal = okAsync(12);
			expect(asyncVal).toBeInstanceOf(ResultAsync);

			const val = await asyncVal;

			expect(val).toBeInstanceOf(Ok);
			expect(val._unsafeUnwrap()).toEqual(12);

			// For an error
			const asyncErr = errAsync("Wrong format");
			expect(asyncErr).toBeInstanceOf(ResultAsync);

			const err = await asyncErr;

			expect(err).toBeInstanceOf(Err);
			expect(err._unsafeUnwrapErr()).toEqual("Wrong format");
		});

		describe("acting as a Promise<Result>", () => {
			test("Is chainable like any Promise", async () => {
				// For a success value
				// @ts-expect-error 7030
				const asyncValChained = okAsync(12).then((res) => {
					if (res.isOk()) {
						return res.value + 2;
					}
				});

				expect(asyncValChained).toBeInstanceOf(Promise);
				const val = await asyncValChained;
				expect(val).toEqual(14);

				// For an error
				// @ts-expect-error 7030
				const asyncErrChained = errAsync("Oops").then((res) => {
					if (res.isErr()) {
						return `${res.error}!`;
					}
				});

				expect(asyncErrChained).toBeInstanceOf(Promise);
				const err = await asyncErrChained;
				expect(err).toEqual("Oops!");
			});

			test("Can be used with Promise.all", async () => {
				const allResult = await Promise.all([okAsync<string, Error>("1")]);

				expect(allResult).toHaveLength(1);
				expect(allResult[0]).toBeInstanceOf(Ok);
				if (!(allResult[0] instanceof Ok))
					return;
				expect(allResult[0].isOk()).toBe(true);
				expect(allResult[0]._unsafeUnwrap()).toEqual("1");
			});

			test("rejects if the underlying promise is rejected", () => {
				// eslint-disable-next-line prefer-promise-reject-errors
				const asyncResult = new ResultAsync(Promise.reject("oops"));
				expect(asyncResult).rejects.toBe("oops");
			});
		});

		describe("map", () => {
			test("Maps a value using a synchronous function", async () => {
				const asyncVal = okAsync(12);

				const mapSyncFn = vitest.fn(number => number.toString());

				const mapped = asyncVal.map(mapSyncFn);

				expect(mapped).toBeInstanceOf(ResultAsync);

				const newVal = await mapped;

				expect(newVal.isOk()).toBe(true);
				expect(newVal._unsafeUnwrap()).toBe("12");
				expect(mapSyncFn).toHaveBeenCalledTimes(1);
			});

			test("Maps a value using an asynchronous function", async () => {
				const asyncVal = okAsync(12);

				const mapAsyncFn = vitest.fn(number => Promise.resolve(number.toString()));

				const mapped = asyncVal.map(mapAsyncFn);

				expect(mapped).toBeInstanceOf(ResultAsync);

				const newVal = await mapped;

				expect(newVal.isOk()).toBe(true);
				expect(newVal._unsafeUnwrap()).toBe("12");
				expect(mapAsyncFn).toHaveBeenCalledTimes(1);
			});

			test("Skips an error", async () => {
				const asyncErr = errAsync<number, string>("Wrong format");

				const mapSyncFn = vitest.fn(number => number.toString());

				const notMapped = asyncErr.map(mapSyncFn);

				expect(notMapped).toBeInstanceOf(ResultAsync);

				const newVal = await notMapped;

				expect(newVal.isErr()).toBe(true);
				expect(newVal._unsafeUnwrapErr()).toBe("Wrong format");
				expect(mapSyncFn).toHaveBeenCalledTimes(0);
			});
		});

		describe("mapErr", () => {
			test("Maps an error using a synchronous function", async () => {
				const asyncErr = errAsync("Wrong format");

				const mapErrSyncFn = vitest.fn(str => `Error: ${str}`);

				const mappedErr = asyncErr.mapErr(mapErrSyncFn);

				expect(mappedErr).toBeInstanceOf(ResultAsync);

				const newVal = await mappedErr;

				expect(newVal.isErr()).toBe(true);
				expect(newVal._unsafeUnwrapErr()).toBe("Error: Wrong format");
				expect(mapErrSyncFn).toHaveBeenCalledTimes(1);
			});

			test("Maps an error using an asynchronous function", async () => {
				const asyncErr = errAsync("Wrong format");

				const mapErrAsyncFn = vitest.fn(str => Promise.resolve(`Error: ${str}`));

				const mappedErr = asyncErr.mapErr(mapErrAsyncFn);

				expect(mappedErr).toBeInstanceOf(ResultAsync);

				const newVal = await mappedErr;

				expect(newVal.isErr()).toBe(true);
				expect(newVal._unsafeUnwrapErr()).toBe("Error: Wrong format");
				expect(mapErrAsyncFn).toHaveBeenCalledTimes(1);
			});

			test("Skips a value", async () => {
				const asyncVal = okAsync(12);

				const mapErrSyncFn = vitest.fn(str => `Error: ${str}`);

				const notMapped = asyncVal.mapErr(mapErrSyncFn);

				expect(notMapped).toBeInstanceOf(ResultAsync);

				const newVal = await notMapped;

				expect(newVal.isOk()).toBe(true);
				expect(newVal._unsafeUnwrap()).toBe(12);
				expect(mapErrSyncFn).toHaveBeenCalledTimes(0);
			});
		});

		describe("andThen", () => {
			test("Maps a value using a function returning a ResultAsync", async () => {
				const asyncVal = okAsync(12);

				const andThenResultAsyncFn = vitest.fn(() => okAsync("good"));

				const mapped = asyncVal.andThen(andThenResultAsyncFn);

				expect(mapped).toBeInstanceOf(ResultAsync);

				const newVal = await mapped;

				expect(newVal.isOk()).toBe(true);
				expect(newVal._unsafeUnwrap()).toBe("good");
				expect(andThenResultAsyncFn).toHaveBeenCalledTimes(1);
			});

			test("Maps a value using a function returning a Result", async () => {
				const asyncVal = okAsync(12);

				const andThenResultFn = vitest.fn(() => ok("good"));

				const mapped = asyncVal.andThen(andThenResultFn);

				expect(mapped).toBeInstanceOf(ResultAsync);

				const newVal = await mapped;

				expect(newVal.isOk()).toBe(true);
				expect(newVal._unsafeUnwrap()).toBe("good");
				expect(andThenResultFn).toHaveBeenCalledTimes(1);
			});

			test("Skips an Error", async () => {
				const asyncVal = errAsync<string, string>("Wrong format");

				const andThenResultFn = vitest.fn(() => ok<string, string>("good"));

				const notMapped = asyncVal.andThen(andThenResultFn);

				expect(notMapped).toBeInstanceOf(ResultAsync);

				const newVal = await notMapped;

				expect(newVal.isErr()).toBe(true);
				expect(newVal._unsafeUnwrapErr()).toBe("Wrong format");
				expect(andThenResultFn).toHaveBeenCalledTimes(0);
			});
		});

		describe("andThrough", () => {
			test("Returns the original value when map function returning ResultAsync succeeds", async () => {
				const asyncVal = okAsync(12);
				/*
					A couple examples of this function

					DB persistence (create or update)
					API calls (create or update)
				*/
				const andThroughResultAsyncFn = vitest.fn(() => okAsync("good"));

				const thrued = asyncVal.andThrough(andThroughResultAsyncFn);

				expect(thrued).toBeInstanceOf(ResultAsync);

				const result = await thrued;

				expect(result.isOk()).toBe(true);
				expect(result._unsafeUnwrap()).toBe(12);
				expect(andThroughResultAsyncFn).toHaveBeenCalledTimes(1);
			});

			test("Maps to an error when map function returning ResultAsync fails", async () => {
				const asyncVal = okAsync(12);

				const andThroughResultAsyncFn = vitest.fn(() => errAsync("oh no!"));

				const thrued = asyncVal.andThrough(andThroughResultAsyncFn);

				expect(thrued).toBeInstanceOf(ResultAsync);

				const result = await thrued;

				expect(result.isErr()).toBe(true);
				expect(result._unsafeUnwrapErr()).toBe("oh no!");
				expect(andThroughResultAsyncFn).toHaveBeenCalledTimes(1);
			});

			test("Returns the original value when map function returning Result succeeds", async () => {
				const asyncVal = okAsync(12);

				const andThroughResultFn = vitest.fn(() => ok("good"));

				const thrued = asyncVal.andThrough(andThroughResultFn);

				expect(thrued).toBeInstanceOf(ResultAsync);

				const newVal = await thrued;

				expect(newVal.isOk()).toBe(true);
				expect(newVal._unsafeUnwrap()).toBe(12);
				expect(andThroughResultFn).toHaveBeenCalledTimes(1);
			});

			test("Maps to an error when map function returning Result fails", async () => {
				const asyncVal = okAsync(12);

				const andThroughResultFn = vitest.fn(() => err("oh no!"));

				const thrued = asyncVal.andThrough(andThroughResultFn);

				expect(thrued).toBeInstanceOf(ResultAsync);

				const newVal = await thrued;

				expect(newVal.isErr()).toBe(true);
				expect(newVal._unsafeUnwrapErr()).toBe("oh no!");
				expect(andThroughResultFn).toHaveBeenCalledTimes(1);
			});

			test("Skips an Error", async () => {
				const asyncVal = errAsync<string, string>("Wrong format");

				const andThroughResultFn = vitest.fn(() => ok<string, string>("good"));

				const notMapped = asyncVal.andThrough(andThroughResultFn);

				expect(notMapped).toBeInstanceOf(ResultAsync);

				const newVal = await notMapped;

				expect(newVal.isErr()).toBe(true);
				expect(newVal._unsafeUnwrapErr()).toBe("Wrong format");
				expect(andThroughResultFn).toHaveBeenCalledTimes(0);
			});
		});

		describe("andTee", () => {
			test("Calls the passed function but returns an original ok", async () => {
				const okVal = okAsync(12);
				const passedFn = vitest.fn((_number) => { });

				const teed = await okVal.andTee(passedFn);

				expect(teed.isOk()).toBe(true);
				expect(passedFn).toHaveBeenCalledTimes(1);
				expect(teed._unsafeUnwrap()).toStrictEqual(12);
			});
			test("returns an original ok even when the passed function fails", async () => {
				const okVal = okAsync(12);
				const passedFn = vitest.fn((_number) => {
					throw new Error("OMG!");
				});

				const teed = await okVal.andTee(passedFn);

				expect(teed.isOk()).toBe(true);
				expect(passedFn).toHaveBeenCalledTimes(1);
				expect(teed._unsafeUnwrap()).toStrictEqual(12);
			});
		});

		describe("orElse", () => {
			test("Skips orElse on an Ok value", async () => {
				const okVal = okAsync(12);
				const errorCallback = vitest.fn(_errVal => errAsync<number, string>("It is now a string"));

				const result = await okVal.orElse(errorCallback);

				expect(result).toEqual(ok(12));

				expect(errorCallback).not.toHaveBeenCalled();
			});

			test("Invokes the orElse callback on an Err value", async () => {
				const myResult = errAsync("BOOOM!");
				const errorCallback = vitest.fn(_errVal => errAsync(true));

				const result = await myResult.orElse(errorCallback);

				expect(result).toEqual(err(true));
				expect(errorCallback).toHaveBeenCalledTimes(1);
			});

			test("Accepts a regular Result in the callback", async () => {
				const myResult = errAsync("BOOOM!");
				const errorCallback = vitest.fn(_errVal => err(true));

				const result = await myResult.orElse(errorCallback);

				expect(result).toEqual(err(true));
				expect(errorCallback).toHaveBeenCalledTimes(1);
			});
		});

		describe("match", () => {
			test("Matches on an Ok", async () => {
				const okMapper = vitest.fn(_val => "weeeeee");
				const errMapper = vitest.fn(_val => "wooooo");

				const matched = await okAsync(12).match(okMapper, errMapper);

				expect(matched).toBe("weeeeee");
				expect(okMapper).toHaveBeenCalledTimes(1);
				expect(errMapper).not.toHaveBeenCalled();
			});

			test("Matches on an Error", async () => {
				const okMapper = vitest.fn(_val => "weeeeee");
				const errMapper = vitest.fn(_val => "wooooo");

				const matched = await errAsync("bad").match(okMapper, errMapper);

				expect(matched).toBe("wooooo");
				expect(okMapper).not.toHaveBeenCalled();
				expect(errMapper).toHaveBeenCalledTimes(1);
			});
		});

		describe("unwrapOr", () => {
			test("returns a promise to the result value on an Ok", async () => {
				const unwrapped = await okAsync(12).unwrapOr(10);
				expect(unwrapped).toBe(12);
			});

			test("returns a promise to the provided default value on an Error", async () => {
				const unwrapped = await errAsync<number, number>(12).unwrapOr(10);
				expect(unwrapped).toBe(10);
			});
		});

		describe("fromSafePromise", () => {
			test("Creates a ResultAsync from a Promise", async () => {
				const res = ResultAsync.fromSafePromise(Promise.resolve(12));

				expect(res).toBeInstanceOf(ResultAsync);

				const val = await res;
				expect(val.isOk()).toBe(true);
				expect(val._unsafeUnwrap()).toEqual(12);
			});

			test("has a top level export", () => {
				expect(fromSafePromise).toBe(ResultAsync.fromSafePromise);
			});
		});

		describe("fromPromise", () => {
			test("Accepts an error handler as a second argument", async () => {
				// eslint-disable-next-line prefer-promise-reject-errors
				const res = ResultAsync.fromPromise(Promise.reject("No!"), e => new Error(`Oops: ${e}`));

				expect(res).toBeInstanceOf(ResultAsync);

				const val = await res;
				expect(val.isErr()).toBe(true);
				expect(val._unsafeUnwrapErr()).toEqual(new Error("Oops: No!"));
			});

			test("has a top level export", () => {
				expect(fromPromise).toBe(ResultAsync.fromPromise);
			});
		});

		describe("ResultAsync.fromThrowable", () => {
			test("creates a new function that returns a ResultAsync", async () => {
				const example = ResultAsync.fromThrowable(async (a: number, b: number) => a + b);
				const res = example(4, 8);
				expect(res).toBeInstanceOf(ResultAsync);

				const val = await res;
				expect(val.isOk()).toBe(true);
				expect(val._unsafeUnwrap()).toEqual(12);
			});

			test("handles synchronous errors", async () => {
				const example = ResultAsync.fromThrowable(() => {
					if (1 > 0)
						throw new Error("Oops: No!");

					return Promise.resolve(12);
				});

				const val = await example();
				expect(val.isErr()).toBe(true);

				expect(val._unsafeUnwrapErr()).toEqual(new Error("Oops: No!"));
			});

			test("handles asynchronous errors", async () => {
				const example = ResultAsync.fromThrowable(async () => {
					if (1 > 0)
						throw new Error("Oops: No!");

					return 12;
				});

				const val = await example();
				expect(val.isErr()).toBe(true);

				expect(val._unsafeUnwrapErr()).toEqual(new Error("Oops: No!"));
			});

			test("Accepts an error handler as a second argument", async () => {
				const example = ResultAsync.fromThrowable(
					// eslint-disable-next-line prefer-promise-reject-errors
					() => Promise.reject("No!"),
					e => new Error(`Oops: ${e}`),
				);

				const val = await example();
				expect(val.isErr()).toBe(true);

				expect(val._unsafeUnwrapErr()).toEqual(new TypeError("Oops: No!"));
			});

			test("has a top level export", () => {
				expect(fromAsyncThrowable).toBe(ResultAsync.fromThrowable);
			});
		});

		describe("okAsync", () => {
			test("Creates a ResultAsync that resolves to an Ok", async () => {
				const val = okAsync(12);

				expect(val).toBeInstanceOf(ResultAsync);

				const res = await val;

				expect(res.isOk()).toBe(true);
				expect(res._unsafeUnwrap()).toEqual(12);
			});
		});

		describe("errAsync", () => {
			test("Creates a ResultAsync that resolves to an Err", async () => {
				const err = errAsync("bad");

				expect(err).toBeInstanceOf(ResultAsync);

				const res = await err;

				expect(res.isErr()).toBe(true);
				expect(res._unsafeUnwrapErr()).toEqual("bad");
			});
		});
	});

	describe("safeTry", () => {
		describe("Returns what is returned from the generator function", () => {
			const val = "value";

			test("With synchronous Ok", () => {
				const res = safeTry(function* () {
					return ok(val);
				});
				expect(res).toBeInstanceOf(Ok);
				expect(res._unsafeUnwrap()).toBe(val);
			});

			test("With synchronous Err", () => {
				const res = safeTry(function* () {
					return err(val);
				});
				expect(res).toBeInstanceOf(Err);
				expect(res._unsafeUnwrapErr()).toBe(val);
			});

			test("With async Ok", async () => {
				const res = await safeTry(async function* () {
					return await okAsync(val);
				});
				expect(res).toBeInstanceOf(Ok);
				expect(res._unsafeUnwrap()).toBe(val);
			});

			test("With async Err", async () => {
				const res = await safeTry(async function* () {
					return await errAsync(val);
				});
				expect(res).toBeInstanceOf(Err);
				expect(res._unsafeUnwrapErr()).toBe(val);
			});
		});

		describe("Returns the first occurence of Err instance as yiled*'s operand", () => {
			test("With synchronous results", () => {
				const errVal = "err";
				const okValues = Array<string>();

				const result = safeTry(function* () {
					const okFoo = yield* ok("foo");
					okValues.push(okFoo);

					const okBar = yield* ok("bar");
					okValues.push(okBar);

					yield* err(errVal);

					throw new Error("This line should not be executed");
				});

				expect(okValues).toMatchObject(["foo", "bar"]);

				expect(result).toBeInstanceOf(Err);
				expect(result._unsafeUnwrapErr()).toBe(errVal);
			});

			test("With async results", async () => {
				const errVal = "err";
				const okValues = Array<string>();

				const result = await safeTry(async function* () {
					const okFoo = yield* okAsync("foo");
					okValues.push(okFoo);

					const okBar = yield* okAsync("bar");
					okValues.push(okBar);

					yield* errAsync(errVal);

					throw new Error("This line should not be executed");
				});

				expect(okValues).toMatchObject(["foo", "bar"]);

				expect(result).toBeInstanceOf(Err);
				expect(result._unsafeUnwrapErr()).toBe(errVal);
			});

			test("Mix results of synchronous and async in AsyncGenerator", async () => {
				const errVal = "err";
				const okValues = Array<string>();

				const result = await safeTry(async function* () {
					const okFoo = yield* okAsync("foo");
					okValues.push(okFoo);

					const okBar = yield* ok("bar");
					okValues.push(okBar);

					yield* err(errVal);

					throw new Error("This line should not be executed");
				});

				expect(okValues).toMatchObject(["foo", "bar"]);

				expect(result).toBeInstanceOf(Err);
				expect(result._unsafeUnwrapErr()).toBe(errVal);
			});
		});

		describe("Tests examples work", () => {
			const okValue = 3;
			const errValue = "err!";
			function good(): Result<number, string> {
				return ok(okValue);
			}
			function bad(): Result<number, string> {
				return err(errValue);
			}
			function promiseGood(): Promise<Result<number, string>> {
				return Promise.resolve(ok(okValue));
			}
			function promiseBad(): Promise<Result<number, string>> {
				return Promise.resolve(err(errValue));
			}
			function asyncGood(): ResultAsync<number, string> {
				return okAsync(okValue);
			}
			function asyncBad(): ResultAsync<number, string> {
				return errAsync(errValue);
			}

			test("mayFail2 error", () => {
				function myFunc(): Result<number, string> {
					return safeTry(function* () {
						return ok(
							(yield* good()
								.mapErr(e => `1st, ${e}`)
							)
							+ (yield* bad()
								.mapErr(e => `2nd, ${e}`)
							),
						);
					});
				}

				const result = myFunc();
				expect(result.isErr()).toBe(true);
				expect(result._unsafeUnwrapErr()).toBe(`2nd, ${errValue}`);
			});

			test("all ok", () => {
				function myFunc(): Result<number, string> {
					return safeTry(function* () {
						return ok(
							(yield* good()
								.mapErr(e => `1st, ${e}`)
							)
							+ (yield* good()
								.mapErr(e => `2nd, ${e}`)
							),
						);
					});
				}

				const result = myFunc();
				expect(result.isOk()).toBe(true);
				expect(result._unsafeUnwrap()).toBe(okValue + okValue);
			});

			test("async mayFail1 error", async () => {
				function myFunc(): ResultAsync<number, string> {
					return safeTry(async function* () {
						return ok(
							(yield* (await promiseBad())
								.mapErr(e => `1st, ${e}`)
							)
							+ (yield* asyncGood()
								.mapErr(e => `2nd, ${e}`)
							),
						);
					});
				}

				const result = await myFunc();
				expect(result.isErr()).toBe(true);
				expect(result._unsafeUnwrapErr()).toBe(`1st, ${errValue}`);
			});

			test("async mayFail2 error", async () => {
				function myFunc(): ResultAsync<number, string> {
					return safeTry(async function* () {
						return ok(
							(yield* (await promiseGood())
								.mapErr(e => `1st, ${e}`)
							)
							+ (yield* asyncBad()
								.mapErr(e => `2nd, ${e}`)
							),
						);
					});
				}

				const result = await myFunc();
				expect(result.isErr()).toBe(true);
				expect(result._unsafeUnwrapErr()).toBe(`2nd, ${errValue}`);
			});

			test("promise async all ok", async () => {
				function myFunc(): ResultAsync<number, string> {
					return safeTry(async function* () {
						return ok(
							(yield* (await promiseGood())
								.mapErr(e => `1st, ${e}`)
							)
							+ (yield* asyncGood()
								.mapErr(e => `2nd, ${e}`)
							),
						);
					});
				}

				const result = await myFunc();
				expect(result.isOk()).toBe(true);
				expect(result._unsafeUnwrap()).toBe(okValue + okValue);
			});
		});

		describe("it yields and works without safeUnwrap", () => {
			test("With synchronous Ok", () => {
				const res: Result<string, string> = ok("ok");

				const actual = safeTry(function* () {
					const x = yield* res;
					return ok(x);
				});

				expect(actual).toBeInstanceOf(Ok);
				expect(actual._unsafeUnwrap()).toBe("ok");
			});

			test("With synchronous Err", () => {
				const res: Result<number, string> = err("error");

				const actual = safeTry(function* () {
					const x = yield* res;
					return ok(x);
				});

				expect(actual).toBeInstanceOf(Err);
				expect(actual._unsafeUnwrapErr()).toBe("error");
			});

			const okValue = 3;
			const errValue = "err!";

			function good(): Result<number, string> {
				return ok(okValue);
			}
			function bad(): Result<number, string> {
				return err(errValue);
			}
			function promiseGood(): Promise<Result<number, string>> {
				return Promise.resolve(ok(okValue));
			}
			function promiseBad(): Promise<Result<number, string>> {
				return Promise.resolve(err(errValue));
			}
			function asyncGood(): ResultAsync<number, string> {
				return okAsync(okValue);
			}
			function asyncBad(): ResultAsync<number, string> {
				return errAsync(errValue);
			}

			test("mayFail2 error", () => {
				function fn(): Result<number, string> {
					return safeTry<number, string>(function* () {
						const first = yield* good().mapErr(e => `1st, ${e}`);
						const second = yield* bad().mapErr(e => `2nd, ${e}`);

						return ok(first + second);
					});
				}

				const result = fn();
				expect(result.isErr()).toBe(true);
				expect(result._unsafeUnwrapErr()).toBe(`2nd, ${errValue}`);
			});

			test("all ok", () => {
				function myFunc(): Result<number, string> {
					return safeTry<number, string>(function* () {
						const first = yield* good().mapErr(e => `1st, ${e}`);
						const second = yield* good().mapErr(e => `2nd, ${e}`);
						return ok(first + second);
					});
				}

				const result = myFunc();
				expect(result.isOk()).toBe(true);
				expect(result._unsafeUnwrap()).toBe(okValue + okValue);
			});

			test("async mayFail1 error", async () => {
				function myFunc(): ResultAsync<number, string> {
					return safeTry<number, string>(async function* () {
						const first = yield* (await promiseBad()).mapErr(e => `1st, ${e}`);
						const second = yield* asyncGood().mapErr(e => `2nd, ${e}`);
						return ok(first + second);
					});
				}

				const result = await myFunc();
				expect(result.isErr()).toBe(true);
				expect(result._unsafeUnwrapErr()).toBe(`1st, ${errValue}`);
			});

			test("async mayFail2 error", async () => {
				function myFunc(): ResultAsync<number, string> {
					return safeTry<number, string>(async function* () {
						const goodResult = await promiseGood();
						const value = yield* goodResult.mapErr(e => `1st, ${e}`);
						const value2 = yield* asyncBad().mapErr(e => `2nd, ${e}`);

						return okAsync(value + value2);
					});
				}

				const result = await myFunc();
				expect(result.isErr()).toBe(true);
				expect(result._unsafeUnwrapErr()).toBe(`2nd, ${errValue}`);
			});

			test("promise async all ok", async () => {
				function myFunc(): ResultAsync<number, string> {
					return safeTry(async function* () {
						const first = yield* (await promiseGood()).mapErr(e => `1st, ${e}`);
						const second = yield* asyncGood().mapErr(e => `2nd, ${e}`);
						return ok(first + second);
					});
				}

				const result = await myFunc();
				expect(result.isOk()).toBe(true);
				expect(result._unsafeUnwrap()).toBe(okValue + okValue);
			});
		});
	});
}
