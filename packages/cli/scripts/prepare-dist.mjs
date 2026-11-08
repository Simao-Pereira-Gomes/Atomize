import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const projectRoot = join(__dirname, "..");
const distCliDir = join(projectRoot, "dist", "cli");

rmSync(distCliDir, { recursive: true, force: true });
mkdirSync(distCliDir, { recursive: true });
// dist/cli/index.js is a small launcher that enables the compile cache, then imports the bundle (main.js).
cpSync(join(__dirname, "cli-launcher.mjs"), join(distCliDir, "index.js"));

// packages/atomize-core/catalog is the single authored copy of the builtin
// catalog. The published CLI package ships its own copy (declared in the
// "files" field) because atomize-core is private and never installed as a
// real dependency
const catalogDir = join(projectRoot, "catalog");
rmSync(catalogDir, { recursive: true, force: true });
cpSync(join(projectRoot, "..", "atomize-core", "catalog"), catalogDir, { recursive: true });
