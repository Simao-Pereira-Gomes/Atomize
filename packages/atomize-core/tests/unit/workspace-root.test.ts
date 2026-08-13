import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TemplateCatalog } from "@sppg2001/atomize-core/services/template/template-catalog";
import { discoverWorkspaceRoot } from "@sppg2001/atomize-core/services/template/workspace-root";

const TEST_DIR = join(tmpdir(), `atomize-workspace-root-test-${process.pid}`);

const VALID_TEMPLATE = `name: team
description: Team template
filter:
  workItemTypes:
    - User Story
tasks:
  - title: Team task`;

beforeEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe("discoverWorkspaceRoot", () => {
  test("prefers nearest .atomize directory over git root", async () => {
    const repo = join(TEST_DIR, "repo");
    const nested = join(repo, "packages", "app");
    await mkdir(join(repo, ".git"), { recursive: true });
    await mkdir(join(nested, ".atomize"), { recursive: true });

    expect(discoverWorkspaceRoot(join(nested, "src"))).toBe(nested);
  });

  test("ignores .atomize files", async () => {
    const repo = join(TEST_DIR, "repo");
    const nested = join(repo, "src");
    await mkdir(nested, { recursive: true });
    await writeFile(join(nested, ".atomize"), "", "utf-8");
    await writeFile(join(repo, ".git"), "gitdir: ../real-git", "utf-8");

    expect(discoverWorkspaceRoot(nested)).toBe(repo);
  });

  test("falls back to invocation cwd", async () => {
    const cwd = join(TEST_DIR, "loose", "nested");
    await mkdir(cwd, { recursive: true });

    expect(discoverWorkspaceRoot(cwd)).toBe(cwd);
  });
});

describe("TemplateCatalog project root discovery", () => {
  test("anchors project legacy reads to discovered git workspace root", async () => {
    const repo = join(TEST_DIR, "repo");
    const nested = join(repo, "src", "feature");
    await mkdir(join(repo, ".git"), { recursive: true });
    await mkdir(nested, { recursive: true });
    await mkdir(join(repo, ".atomize", "templates", "templates"), { recursive: true });
    await writeFile(
      join(repo, ".atomize", "templates", "templates", "team.atomize.yaml"),
      VALID_TEMPLATE,
      "utf-8",
    );

    const catalog = new TemplateCatalog({
      invocationCwd: nested,
      packageRoot: join(TEST_DIR, "package"),
      userRoot: join(TEST_DIR, "user", "catalog"),
      legacyUserRoot: join(TEST_DIR, "user", "templates"),
    });

    const items = await catalog.listTemplates();
    expect(items.map((item) => item.name)).toContain("team");
  });
});
