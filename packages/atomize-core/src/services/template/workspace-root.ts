import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, relative, resolve } from "node:path";

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isInside(path: string, folder: string): boolean {
  const fromFolder = relative(folder, path);
  return fromFolder === "" || (!fromFolder.startsWith("..") && !isAbsolute(fromFolder));
}

/**
 * The Workspace Root (ADR-0019): the nearest ancestor with a `.atomize/` directory, else the nearest
 * git root, else the invocation directory. The home folder's `.atomize/` never counts: it holds
 * Connection Profiles and the user Catalog, so it exists for nearly every user. Nor is any folder
 * inside it a project, such as the personal Catalog: discovery from there returns the home folder.
 */
export function discoverWorkspaceRoot(invocationCwd = process.cwd(), homeDirectory = homedir()): string {
  const start = resolve(invocationCwd);
  const home = resolve(homeDirectory);
  if (isInside(start, resolve(home, ".atomize"))) return home;

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

/**
 * The Catalog scope to install to when none is given: "project" when the Workspace Root has its own
 * `.atomize/` folder, which means the team has opted in to a project Catalog, and "user" otherwise.
 */
export function defaultCatalogScope(invocationCwd = process.cwd(), homeDirectory = homedir()): "user" | "project" {
  const root = discoverWorkspaceRoot(invocationCwd, homeDirectory);
  return root !== resolve(homeDirectory) && isDirectory(resolve(root, ".atomize")) ? "project" : "user";
}
