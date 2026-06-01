import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const vsixPath = path.resolve(`atomize-${packageJson.version}.vsix`);
const expectedImageBase =
	"https://github.com/Simao-Pereira-Gomes/atomize/raw/HEAD/packages/vscode-extension/";

if (!existsSync(vsixPath)) {
	console.error(`Expected packaged VSIX at ${vsixPath}. Run \`bun run package\` first.`);
	process.exit(1);
}

const readme = execFileSync("unzip", ["-p", vsixPath, "extension/README.md"], {
	encoding: "utf8",
});
const imageUrls = [...readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(
	(match) => match[1],
);

if (imageUrls.length === 0) {
	console.error("Packaged README does not contain any image references.");
	process.exit(1);
}

const invalidUrls = imageUrls.filter((url) => !url.startsWith(expectedImageBase));

if (invalidUrls.length > 0) {
	console.error("Packaged README contains image URLs outside the expected base:");
	for (const url of invalidUrls) {
		console.error(`- ${url}`);
	}
	process.exit(1);
}

console.log(`Verified ${imageUrls.length} packaged README image URLs.`);
