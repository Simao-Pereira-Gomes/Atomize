import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const projectRoot = join(__dirname, "..");
const distCliDir = join(projectRoot, "dist", "cli");

rmSync(distCliDir, { recursive: true, force: true });
mkdirSync(distCliDir, { recursive: true });
