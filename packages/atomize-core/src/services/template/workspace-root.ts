import { existsSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, relative, resolve } from "node:path";

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The path with symlinks resolved, so one folder reached two ways compares equal (on macOS,
 * /var is /private/var; a home folder can be a symlink). A path that doesn't exist stays as given.
 */
export function canonicalPath(path: string): string {
  const absolute = resolve(path);
  try {
    return realpathSync(absolute);
  } catch {
    return absolute;
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
  // Paths are returned as given; only comparisons use the real path, so a symlinked home (or
  // macOS's /var vs /private/var) is still recognised as the home folder.
  const start = resolve(invocationCwd);
  const home = resolve(homeDirectory);
  const realHome = canonicalPath(home);
  if (isInside(canonicalPath(start), resolve(realHome, ".atomize"))) return home;

  let current = start;
  while (true) {
    if (canonicalPath(current) !== realHome && isDirectory(resolve(current, ".atomize"))) {
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
  return canonicalPath(root) !== canonicalPath(homeDirectory) && isDirectory(resolve(root, ".atomize")) ? "project" : "user";
}
