import { afterEach, beforeEach, expect, vi } from "vitest";
import { onMount } from "../../index.js";

export function createLifecycleUtils() {
	const mounts = vi.fn();
	const unmounts = vi.fn();
	const executions = vi.fn();

	function reset() {
		mounts.mockReset();
		unmounts.mockReset();
		executions.mockReset();
	}

	const connect = (...args: unknown[]) => {
		executions(...args);
		onMount(() => {
			mounts(...args);
			return function testUnMountFn() {
				unmounts(...args);
			};
		});
	};
	beforeEach(() => reset());
	afterEach(() => reset());

	const expectToMatchCalls = (...args: unknown[]) => {
		expect.soft(executions.mock.calls).toStrictEqual(args);
		expect.soft(mounts.mock.calls).toStrictEqual(args);
		expect(unmounts.mock.calls).toStrictEqual(args);
	};

	const expectCalledTimesEach = (
		timesExecuted: number,
		timesMounted: number,
		timesUnmounted: number,
	) => {
		expect.soft(executions).toHaveBeenCalledTimes(timesExecuted);
		expect.soft(mounts).toHaveBeenCalledTimes(timesMounted);
		expect(unmounts).toHaveBeenCalledTimes(timesUnmounted);
	};

	const expectToHaveBeenCalledTimes = (num: number) => {
		expectCalledTimesEach(num, num, num);
	};

	const expectUncalled = () => expectCalledTimesEach(0, 0, 0);
	const expectRunButUnmounted = () => expectCalledTimesEach(1, 0, 0);
	const expectActivelyMounted = () => expectCalledTimesEach(1, 1, 0);

	return {
		connect,
		executions,
		expectActivelyMounted,
		expectCalledTimesEach,
		expectRunButUnmounted,
		expectToHaveBeenCalledTimes,
		expectToMatchCalls,
		expectUncalled,
		mounts,
		reset,
		unmounts,
	};
}
