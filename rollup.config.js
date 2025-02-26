// @ts-check

import path from "node:path";
import process from "node:process";
import fs from "node:fs";
import { defineConfig } from "rollup";
import nodeResolve from "@rollup/plugin-node-resolve";
import replace from "@rollup/plugin-replace";
import esbuild from "rollup-plugin-esbuild";
import typescript from "@rollup/plugin-typescript";
import { importMetaVitestTransformer } from "./rollup/transformer.js";

const extensions = [".js", ".ts"];
const { root } = path.parse(process.cwd());

/**
 * @param {string} id
 * @returns {boolean} Whether the module is external
 */
function external(id) {
	return !id.startsWith(".") && !id.startsWith(root);
}

/**
 * @param {string} input
 * @param {string} output
 * @returns {import("rollup").RollupOptions} Rollup configuration
 */
function createDTSConfig(input, output) {
	return {
		external,
		input,
		output: {
			dir: output,
		},
		plugins: [
			replace({
				"import.meta.vitest": "undefined",
				"preventAssignment": false,
			}),
			typescript({
				compilerOptions: {
					declaration: true,
					declarationMap: true,
					emitDeclarationOnly: true,
					incremental: false,
					isolatedDeclarations: true,
					noEmit: false,
					outDir: output,
					rootDir: "src",
				},
				exclude: ["**/*.bench.ts", "**/testing/*.ts"],
				transformers: {
					before: [
						{
							factory: program => importMetaVitestTransformer(program),
							type: "program",
						},
					],
				},
			}),
		],
	};
}

/**
 * @param {string} input
 * @param {string} output
 * @returns {import("rollup").RollupOptions} Rollup configuration
 */
function createESMConfig(input, output) {
	return {
		external,
		input,
		output: {
			file: output,
			format: "esm",
			sourcemap: true,
		},
		plugins: [
			esbuild({
				target: "es2022",
			}),
			nodeResolve({ extensions }),
			replace({
				"import.meta.vitest": "undefined",
				"preventAssignment": false,
			}),
		],
	};
}

const srcPath = path.join(process.cwd(), "src");

/**
 * @returns {string[]} List of files in the src directory
 */
function files() {
	try {
		const items = fs.readdirSync(srcPath);

		const fileNames = items
			.filter(item => fs.statSync(path.join(srcPath, item)).isFile())
			.map(item => path.parse(item).name);

		return fileNames;
	}
	catch (err) {
		console.error("Error reading directory:", err);
		return [];
	}
}

export default defineConfig(files().filter(file => file !== "types").flatMap(file => [
	...(file === "index" ? [createDTSConfig(`src/${file}.ts`, "dist")] : []),
	createESMConfig(`src/${file}.ts`, `dist/${file}.js`),
]));
