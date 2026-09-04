import { cpSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const projectRoot = join(__dirname, "..");
const distCliDir = join(projectRoot, "dist", "cli");

rmSync(distCliDir, { recursive: true, force: true });
mkdirSync(distCliDir, { recursive: true });

// packages/atomize-core/catalog is the single authored copy of the builtin
// catalog. The published CLI package ships its own copy (declared in the
// "files" field) because atomize-core is private and never installed as a
// real dependency — TemplateCatalog's findPackageRoot() resolves against the
// nearest package.json to the running code, which for the bundled dist
// output is this package's own. Regenerating it here (rather than committing
// a second copy) keeps atomize-core/catalog the only place content is authored.
const catalogDir = join(projectRoot, "catalog");
rmSync(catalogDir, { recursive: true, force: true });
cpSync(join(projectRoot, "..", "atomize-core", "catalog"), catalogDir, { recursive: true });
