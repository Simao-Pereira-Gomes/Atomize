import { chmod, mkdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export function getAtomizeDir(): string {
  return join(homedir(), ".atomize");
}

/**
 * Ensures ~/.atomize exists and has permissions 0o700 (owner-only).
 */
export async function ensureAtomizeDir(): Promise<void> {
  const dir = getAtomizeDir();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await chmod(dir, 0o700);
}

/**
 * Asserts that a credential file has permissions no looser than 0o600
 * (owner read/write only). Throws if group or other bits are set so callers
 * never silently consume world- or group-readable credential material.
 * Silently returns when the file does not exist (callers handle ENOENT).
 */
export async function assertSafeFilePermissions(filePath: string): Promise<void> {
  let stats: Awaited<ReturnType<typeof stat>>;
  try {
    stats = await stat(filePath);
  } catch {
    return; // File doesn't exist — nothing to check.
  }
  const looseBits = stats.mode & 0o077;
  if (looseBits !== 0) {
    const octal = (stats.mode & 0o777).toString(8);
    throw new Error(
      `${filePath} has unsafe permissions (${octal}). ` +
        `Fix with: chmod 600 ${filePath}`,
    );
  }
}
