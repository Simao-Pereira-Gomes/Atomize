import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const projectRoot = join(__dirname, "..");
const distDir = join(projectRoot, "dist");
const distCliDir = join(distDir, "cli");
const presetsDir = join(projectRoot, "templates", "presets");

if (!existsSync(distDir)) {
	throw new Error("Missing dist directory");
}

if (!existsSync(join(distCliDir, "index.js"))) {
	throw new Error("Missing dist/cli/index.js");
}

if (!existsSync(presetsDir)) {
	throw new Error("Missing templates/presets directory");
}

const nativeArtifacts = readdirSync(distCliDir).filter((entry) => entry.endsWith(".node"));
if (nativeArtifacts.length > 0) {
	throw new Error(`Unexpected native artifacts in dist/cli: ${nativeArtifacts.join(", ")}`);
}
