// @ts-check

import ts from "typescript";

/**
 *
 * @param {import('typescript').Program} _program
 * @returns {import('typescript').TransformerFactory<import('typescript').SourceFile>}
 */
export function importMetaVitestTransformer(_program) {
	/**
	 * @param {import('typescript').TransformationContext} context
	 * @returns {import('typescript').Transformer<import('typescript').SourceFile>}
	 */
	return (context) => {
		/**
		 * @param {import('typescript').Node} node
		 * @returns {import('typescript').VisitResult<import('typescript').Node>}
		 */
		const visitor = (node) => {
			if (
				ts.isIfStatement(node)
				&& ts.isPropertyAccessExpression(node.expression)
				&& ts.isMetaProperty(node.expression.expression)
				&& node.expression.expression.keywordToken === ts.SyntaxKind.ImportKeyword
				&& node.expression.name.text === "vitest"
			) {
				return ts.factory.createNotEmittedStatement(node);
			}

			return ts.visitEachChild(node, visitor, context);
		};

		/**
		 * @param {import('typescript').SourceFile} sourceFile
		 * @returns {import('typescript').SourceFile}
		 */
		return (sourceFile) => {
			const updatedSourceFile = ts.visitNode(sourceFile, visitor);
			if (!ts.isSourceFile(updatedSourceFile)) {
				throw new Error("Transformation did not return a SourceFile.");
			}
			return updatedSourceFile;
		};
	};
}
