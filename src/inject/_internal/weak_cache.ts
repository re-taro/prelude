export type WeakCache<TKey extends object, TValue> = WeakMap<
	TKey,
  [WeakCache<TKey, TValue>, TValue] | [WeakCache<TKey, TValue>]
>;

function getWeakCacheItem<TKey extends object, TValue>(cache: WeakCache<TKey, TValue>, deps: Deps<TKey>): TValue | undefined {
	while (true) {
		const [dep, ...rest] = deps;
		if (typeof dep === "undefined") {
			return;
		}
		const entry = cache.get(dep);
		if (typeof entry === "undefined") {
			return;
		}
		if (rest.length === 0) {
			return entry[1];
		}
		cache = entry[0];
		deps = rest;
	}
}

function setWeakCacheItem<TKey extends object, TValue>(cache: WeakCache<TKey, TValue>, deps: Deps<TKey>, item: TValue): void {
	while (true) {
		const [dep, ...rest] = deps;
		if (typeof dep === "undefined") {
			return;
		}
		let entry = cache.get(dep);
		if (typeof entry === "undefined") {
			entry = [new WeakMap()];
			cache.set(dep, entry);
		}
		if (rest.length === 0) {
			entry[1] = item;
			return;
		}
		cache = entry[0];
		deps = rest;
	}
}

type Deps<T> = readonly T[];

export interface DeepCache<TKey extends object, TValue> {
	cache: WeakCache<TKey, TValue>;
	deepCache: (
		createFn: () => TValue,
		foundFn: (found: TValue) => void,
		deps: Deps<TKey>,
	) => TValue;
	get: (deps: Deps<TKey>) => TValue | undefined;
	remove: (...deps: TKey[]) => void;
	upsert: (
		createFn: (previous: TValue | undefined) => TValue,
		deps: Deps<TKey>,
	) => void;
}

export function createDeepCache<TKey extends object, TValue>(): DeepCache<
	TKey,
	TValue
> {
	const cache: WeakCache<TKey, TValue> = new WeakMap();
	const deepCache = (
		createFn: () => TValue,
		foundFn: (found: TValue) => void,
		deps: Deps<TKey>,
	) => {
		if (deps.length === 0)
			throw new Error("Dependencies need to exist.");
		const cachedValue = getWeakCacheItem(cache, deps);
		if (typeof cachedValue !== "undefined") {
			foundFn(cachedValue);
			return cachedValue!;
		}
		const newObject = createFn();
		setWeakCacheItem(cache, deps, newObject);
		return newObject;
	};
	const upsert = (
		createFn: (previous: TValue | undefined) => TValue,
		deps: Deps<TKey>,
	) => {
		if (deps.length === 0)
			throw new Error("Dependencies need to exist.");
		const cachedValue = getWeakCacheItem(cache, deps);
		const newObject = createFn(cachedValue);
		setWeakCacheItem(cache, deps, newObject);
	};

	const remove = (...deps: Deps<TKey>) => {
		removeWeakCacheItem(cache, deps);
	};

	const get = (deps: Deps<TKey>) => getWeakCacheItem(cache, deps);

	return {
		cache,
		deepCache,
		get,
		remove,
		upsert,
	};
}

function removeWeakCacheItem<TKey extends object, TValue>(cache: WeakCache<TKey, TValue>, deps: Deps<TKey>): void {
	while (true) {
		const [dep, ...rest] = deps;
		if (typeof dep === "undefined") {
			return;
		}
		const entry = cache.get(dep);
		if (typeof entry === "undefined") {
			return;
		}
		const isBottom = rest.length === 0;
		if (isBottom) {
			entry[1] = void 0;
			return;
		}
		else {
			cache = entry[0];
			deps = rest;
		}
	}
}

if (import.meta.vitest) {
	const { describe, expect, test } = import.meta.vitest;

	describe("createDeepCache", () => {
		test("Caches based on orders of dependencies", () => {
			const memoize = createDeepCache<object, { value: number }>();

			const first = {};
			const second = {};
			let i = 0;
			const fn = () => ({
				value: i++,
			});

			const firstValue = memoize.deepCache(fn, () => { }, [first, second]);
			const secondValue = memoize.deepCache(fn, () => { }, [first, second]);
			expect(secondValue).toBe(firstValue);

			const thirdValue = memoize.deepCache(fn, () => { }, [second, first]);
			expect(thirdValue).not.toBe(firstValue);
			expect(thirdValue).not.toBe(secondValue);
		});

		test("Caches based on orders of dependencies", () => {
			const memoize = createDeepCache<object, number>();

			const first = {};
			const fn = (previous?: number) => (previous ? previous + 1 : 1);

			memoize.upsert(fn, [first]);

			const one = memoize.deepCache(
				() => 0,
				() => { },
				[first],
			);

			memoize.upsert(fn, [first]);

			const two = memoize.deepCache(
				() => 0,
				() => { },
				[first],
			);

			expect(one).toBe(1);
			expect(two).toBe(2);
		});
	});
}
