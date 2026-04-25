import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LOG_LEVEL_VALUES } from "@config/logger";
import { z } from "zod";

/**
 * Schema for all environment variables that Atomize reads from --env-file.
 * Unknown keys are rejected to prevent accidental credential bleed from
 * project-level .env files (e.g. AWS_SECRET_ACCESS_KEY, DATABASE_URL).
 */
const EnvFileSchema = z
  .object({
    ATOMIZE_PAT: z.string().min(1).optional(),
    ATOMIZE_PROFILE: z.string().min(1).optional(),
    ATOMIZE_DEV: z.enum(["true", "false"]).optional(),
    LOG_LEVEL: z.enum(LOG_LEVEL_VALUES).optional(),
  })
  .strict();

export type EnvFile = z.infer<typeof EnvFileSchema>;

/**
 * Loads environment variables from a file into process.env.
 * Shell environment takes precedence — existing vars are never overwritten.
 * Only keys defined in EnvFileSchema are accepted; unknown or invalid keys
 * cause a hard error listing all violations and the allowed key names.
 *
 * Supports: KEY=VALUE, KEY="VALUE", KEY='VALUE', comments (#), empty lines.
 *
 * @throws {Error} If the file does not exist, cannot be read, or fails schema validation.
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

  const parsed: Record<string, string> = {};

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

    parsed[key] = value;
  }

  const result = EnvFileSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    const allowed = Object.keys(EnvFileSchema.shape).join(", ");
    throw new Error(
      `Env file ${absolutePath} failed validation:\n${issues}\n` +
        `Allowed keys: ${allowed}`,
    );
  }

  for (const [key, value] of Object.entries(result.data)) {
    if (value !== undefined && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
