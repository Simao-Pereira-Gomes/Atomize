import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Loads environment variables from a file into process.env.
 * Shell environment takes precedence — existing vars are never overwritten.
 *
 * Supports: KEY=VALUE, KEY="VALUE", KEY='VALUE', comments (#), empty lines.
 *
 * @throws {Error} If the file does not exist or cannot be read.
 */
export function loadEnvFile(filePath: string): void {
  const absolutePath = resolve(filePath);
  let content: string;

  try {
    content = readFileSync(absolutePath, "utf-8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Env file not found: ${absolutePath}`);
    }
    throw err;
  }

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (!key) continue;

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
