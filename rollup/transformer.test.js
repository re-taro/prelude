import { describe, expect, it } from "vitest";
import ts from "typescript";
import { importMetaVitestTransformer } from "./transformer.js";

describe("importMetaVitestTransformer", () => {
	it("should return a transformer factory", () => {
		const sourceCode = `
if (import.meta.vitest) {
  console.log("This is test code.");
}
    `.trim();

		const result = ts.transpileModule(sourceCode, {
			compilerOptions: { target: ts.ScriptTarget.ESNext },
			transformers: { before: [importMetaVitestTransformer()] },
		});

		expect(result.outputText).toMatchSnapshot();
	});
});
