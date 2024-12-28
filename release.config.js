/**
 * @type {import('semantic-release').GlobalConfig}
 */
export default {
	branches: ["main"],
	plugins: [
		[
			"@semantic-release/commit-analyzer",
			{
				parserOpts: {
					revertCorrespondence: ["header"],
					revertPattern: /^Revert\s"([\s\S]*)"$/m,
				},
				preset: "angular",
				releaseRules: [
					{ breaking: true, release: "major" },
					{ release: "patch", revert: true },
					{ release: "minor", type: "feat" },
				],
			},
		],
		"@semantic-release/release-notes-generator",
		"@semantic-release/changelog",
		[
			"@semantic-release/exec",
			{
				// eslint-disable-next-line no-template-curly-in-string
				successCmd: "echo \"VERSION=${nextRelease.version}\" >> $GITHUB_OUTPUT",
			},
		],
		[
			"@semantic-release/github",
			{
				failTitle: false,
				successComment: false,
			},
		],
		"@semantic-release/npm",
		"@semantic-release/git",
	],
};
