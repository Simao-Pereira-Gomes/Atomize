import { fileURLToPath } from "node:url";
import { build } from "astro";

// Astro treats ambient DEV/PROD as private variables and can substitute them for
// Vite's boolean built-ins. A developer's DEV directory must not disable search.
delete process.env.DEV;
delete process.env.PROD;

await build({ root: fileURLToPath(new URL("../", import.meta.url)) });
