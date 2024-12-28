import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		includeSource: ["src/**/*.ts"],
		// @ts-expect-error 4111
		// eslint-disable-next-line node/prefer-global/process
		reporters: process.env.GITHUB_ACTIONS ? ["default", "github-actions"] : "default",
	},
});
