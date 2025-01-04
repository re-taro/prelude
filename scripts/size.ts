import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, gzipSync } from "node:zlib";
import pc from "picocolors";
import { displaySize } from "./utils.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const sizeDir = path.resolve(__dirname, "../temp/size");

async function main() {
	await run();

	async function run() {
		await fs.mkdir(sizeDir, { recursive: true });

		await checkSizes();
	}

	async function checkSizes() {
		const files = await checkSizeDistFiles();
		for (const file of files) {
			await checkFileSize(`dist/${file}`);
		}
	}

	async function checkFileSize(filePath: string) {
		if (!existsSync(filePath)) {
			return;
		}
		const file = await fs.readFile(filePath);
		const filename = path.basename(filePath);

		const gzipped = gzipSync(file);
		const brotli = brotliCompressSync(file);
		console.log(
			`📦  ${pc.green(
				pc.bold(path.basename(filePath)),
			)} - min: ${displaySize(file.length)} / gzip: ${displaySize(gzipped.length)} / brotli: ${displaySize(brotli.length)}`,
		);

		const sizeContents = JSON.stringify(
			{
				brotli: brotli.length,
				file: filename,
				gzip: gzipped.length,
				size: file.length,
			},
			null,
			2,
		);
		await fs.writeFile(
			path.resolve(sizeDir, `${filename}.json`),
			sizeContents,
			"utf-8",
		);
	}

	async function checkSizeDistFiles() {
		const dirs = await fs.readdir("dist");

		return dirs.filter(file => file.endsWith(".js"));
	}
}

main().catch((err) => {
	console.error(err);
	// eslint-disable-next-line node/prefer-global/process
	process.exit(1);
});
