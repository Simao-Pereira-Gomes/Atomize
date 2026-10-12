import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function discoverWorkspaceRoot(invocationCwd = process.cwd(), homeDirectory = homedir()): string {
  const start = resolve(invocationCwd);
  const home = resolve(homeDirectory);

  let current = start;
  while (true) {
    if (current !== home && isDirectory(resolve(current, ".atomize"))) {
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
