import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function discoverWorkspaceRoot(invocationCwd = process.cwd()): string {
  const start = resolve(invocationCwd);

  let current = start;
  while (true) {
    if (isDirectory(resolve(current, ".atomize"))) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  current = start;
  while (true) {
    const gitPath = resolve(current, ".git");
    if (existsSync(gitPath)) {
      return current;
    }

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return start;
}
