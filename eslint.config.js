// @ts-check

import { re_taro } from "@re-taro/eslint-config";

export default re_taro({
	formatters: true,
}, {
	files: ["src/**/*.ts"],
	rules: {
		"style/yield-star-spacing": ["error", "after"],
		"ts/no-redeclare": "off",
	},
});
