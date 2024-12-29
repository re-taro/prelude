import { toString } from "./_internal/utils.js";

// @__NO_SIDE_EFFECTS__
export const isDef = <T = any>(val?: T): val is T => typeof val !== "undefined";
// @__NO_SIDE_EFFECTS__
export const isBoolean = (val: any): val is boolean => typeof val === "boolean";
// @__NO_SIDE_EFFECTS__
// eslint-disable-next-line ts/no-unsafe-function-type
export const isFunction = <T extends Function>(val: any): val is T => typeof val === "function";
// @__NO_SIDE_EFFECTS__
export const isNumber = (val: any): val is number => typeof val === "number";
// @__NO_SIDE_EFFECTS__
export const isString = (val: unknown): val is string => typeof val === "string";
// @__NO_SIDE_EFFECTS__
export const isObject = (val: any): val is object => toString(val) === "[object Object]";
// @__NO_SIDE_EFFECTS__
export const isUndefined = (val: any): val is undefined => toString(val) === "[object Undefined]";
// @__NO_SIDE_EFFECTS__
export const isNull = (val: any): val is null => toString(val) === "[object Null]";
// @__NO_SIDE_EFFECTS__
export const isRegExp = (val: any): val is RegExp => toString(val) === "[object RegExp]";
// @__NO_SIDE_EFFECTS__
export const isDate = (val: any): val is Date => toString(val) === "[object Date]";

// @ts-expect-error 2552
// @__NO_SIDE_EFFECTS__
export const isWindow = (val: any): boolean => typeof window !== "undefined" && toString(val) === "[object Window]";
// @ts-expect-error 2552
export const isBrowser: boolean = typeof window !== "undefined";
