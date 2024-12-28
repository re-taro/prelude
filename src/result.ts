const okSymbol: symbol = Symbol("ResultOk");
const errSymbol: symbol = Symbol("ResultErr");

/**
 * The `Ok` variant of `Result`, which expresses a success.
 */
export type Ok<T> = readonly [typeof okSymbol, T];
/**
 * The `Err` variant of `Result`, which expresses an error.
 */
export type Err<E> = readonly [typeof errSymbol, E];

/**
 * The type represents either error `Err` or success `Ok`. Note that the order of type arguments is `E, T`, because it is useful to place the primary type parameter on the last.
 */
export type Result<T, E> = Err<E> | Ok<T>;

/**
 * Creates a new success value.
 *
 * @param v - The success value.
 * @returns The new `Ok` .
 */
export const ok = <T>(v: T): Ok<T> => [okSymbol, v];
/**
 * Creates a new error value.
 *
 * @param e - The error value.
 * @returns The new `Err`.
 */
export const err = <E>(e: E): Err<E> => [errSymbol, e];

/**
 * Checks whether the result is an `Ok`.
 *
 * @param res - The result to be checked.
 * @returns Whether the result is an `Ok`.
 */
export function isOk<T, E>(res: Result<T, E>): res is Ok<T> {
  return res[0] === okSymbol;
}

/**
 * Checks whether the result is an `Err`.
 *
 * @param res - The result to be checked.
 * @returns Whether the result is an `Err`.
 */
export function isErr<T, E>(res: Result<T, E>): res is Err<E> {
  return res[0] === errSymbol;
}

/**
 * Wraps the return value of `body` into a Result.
 *
 * @param catcher - The function to cast an error from `body`.
 * @param body - The function to be wrapped.
 * @returns The wrapped function.
 */
export function wrapThrowable<E>(catcher: (err: unknown) => E) {
  return <A extends unknown[], R>(body: (...args: A) => R) =>
    (...args: A): Result<R, E> => {
      try {
        return ok(body(...args));
      }
      catch (error: unknown) {
        return err(catcher(error));
      }
    };
}

/**
 * Wraps the return value of `body` into a Result over `Promise`.
 *
 * @param catcher - The function to cast an error from `body`.
 * @param body - The asynchronous function to be wrapped.
 * @returns The wrapped function.
 */
export function wrapAsyncThrowable<E>(catcher: (err: unknown) => E) {
  return <A extends unknown[], R>(body: (...args: A) => Promise<R>) =>
    async (...args: A): Promise<Result<R, E>> => {
      try {
        return ok(await body(...args));
      }
      catch (error: unknown) {
        return err(catcher(error));
      }
    };
}

/**
 * Maps the value in variant by two mappers.
 *
 * @param g - The mapper from error.
 * @param f - The mapper from success.
 * @param res - The result to be mapped.
 * @returns The mapped value.
 */
export function either<E, R>(g: (e: E) => R) {
  return <T>(f: (t: T) => R) => (res: Result<T, E>): R =>
    isOk(res) ? f(res[1]) : g(res[1]);
}

/**
 * Unwraps the `Ok` value from a `Result`, or throws an error.
 *
 * @param res - The value which should be an `Ok`.
 * @returns The unwrapped item.
 */
export function unwrap<T, E>(res: Result<T, E>): T {
  if (isErr(res)) {
    throw new Error("unwrapped Err");
  }
  return res[1];
}

/**
 * Unwraps the `Err` value from a `Result`, or throws an error.
 *
 * @param res - The value which should be an `Err`.
 * @returns The unwrapped item.
 */
export function unwrapErr<T, E>(res: Result<T, E>): E {
  if (isOk(res)) {
    throw new Error("unwrapped Ok");
  }
  return res[1];
}

/**
 * Returns `resB` if `resA` is an `Ok`, otherwise returns the error `resA`. The order of arguments is reversed because of that it is useful for partial applying.
 *
 * @param resB - The second result.
 * @param resA - The first result.
 * @returns `resB` if `resA` is a `Ok`.
 */
export function and<U, E>(resB: Result<U, E>) {
  return <T>(resA: Result<T, E>): Result<U, E> =>
    isOk(resA) ? resB : resA;
}

/**
 * Returns `fn(v)` if `resA` is an `Ok(v)`, otherwise returns the error `resA`. This is an implementation of `FlatMap`. The order of arguments is reversed because of that it is useful for partial applying.
 *
 * @param fn - The function provides a second result.
 * @param resA - The first result.
 * @returns `fn()` if `resA` is an `Ok`.
 */
export function andThen<T, U, E>(fn: (t: T) => Result<U, E>) {
  return (resA: Result<T, E>): Result<U, E> => isOk(resA) ? fn(resA[1]) : resA;
}

/**
 * Returns `fn(v)` if `res` is an `Ok(v)`, otherwise the error `res`. The order of arguments is reversed because of that it is useful for partial applying.
 *
 * @param fn - The function which provides a second result.
 * @returns `fn()` if `res` is an `Ok`.
 */
export function asyncAndThen<T, U, F>(fn: (value: T) => Promise<Result<U, F>>) {
  return <E extends F>(res: Result<T, E>): Promise<Result<U, E | F>> =>
    isOk(res) ? fn(res[1]) : Promise.resolve(res);
}

/**
 * Returns `resB` if `resA` is an `Err`, otherwise returns the success `resA`. The order of arguments is reversed because of that it is useful for partial applying.
 *
 * @param resB - The second result.
 * @param resA - The first result.
 * @returns `resA` or `resB`.
 */
export function or<T, E>(resB: Result<T, E>) {
  return <F>(resA: Result<T, F>): Result<T, E> =>
    isErr(resA) ? resB : resA;
}

/**
 * Returns `fn()` if `resA` is an `Err`, otherwise returns the success `resA`. The order of arguments is reversed because of that it is useful for partial applying.
 *
 * @param fn - The second result.
 * @param resA - The first result.
 * @returns `resA` or `fn()`.
 */
export function orElse<F, T, E>(fn: (error: F) => Result<T, E>) {
  return (resA: Result<T, F>): Result<T, E> => isErr(resA) ? fn(resA[1]) : resA;
}

if (import.meta.vitest) {
  const { describe, expect, test } = import.meta.vitest;

  describe("Result", () => {
    test("wrapThrowable", () => {
      const safeSqrt = wrapThrowable(err => err as Error)(
        (x: number) => {
          if ((x < 0)) {
            throw new RangeError("x must be positive or a zero");
          }
          return Math.sqrt(x);
        },
      );

      expect(safeSqrt(4)).toEqual(ok(2));
      expect(safeSqrt(0)).toEqual(ok(0));
      expect(
        safeSqrt(-1),
      ).toEqual(err(new RangeError("x must be positive or a zero")));
    });
    test("wrapAsyncThrowable", async () => {
      const safeSqrt = wrapAsyncThrowable(err => err as Error)(
        async (x: number) => {
          if ((x < 0)) {
            return Promise.reject(new RangeError("x must be positive or a zero"));
          }
          return Math.sqrt(x);
        },
      );

      expect(await safeSqrt(4)).toEqual(ok(2));
      expect(await safeSqrt(0)).toEqual(ok(0));
      expect(
        await safeSqrt(-1),
      ).toEqual(err(new RangeError("x must be positive or a zero")));
    });
  });
}
