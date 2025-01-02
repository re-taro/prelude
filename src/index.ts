export {
	isBoolean,
	isBrowser,
	isDate,
	isDef,
	isFunction,
	isNull,
	isNumber,
	isObject,
	isRegExp,
	isString,
	isUndefined,
	isWindow,
} from "./is.js";
export {
	err,
	Err,
	errAsync,
	fromAsyncThrowable,
	fromPromise,
	fromSafePromise,
	fromThrowable,
	ok,
	Ok,
	okAsync,
	ResultAsync,
	safeTry,
} from "./result.js";
export type { Result } from "./result.js";
export type {
	ArgumentsType,
	DeepMerge,
	ElementOf,
	EnumLike,
	GetTagMetadata,
	MergeInsertions,
	Tagged,
	UnionToIntersection,
} from "./types.js";
