import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkInternalLinks } from "./check-docs";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

test("rendered links catch missing pages and anchors while accepting encoded anchors and shared schema fields", async () => {
  const directory = await mkdtemp(join(tmpdir(), "atomize-doc-links-"));
  directories.push(directory);
  await mkdir(join(directory, "schema"));
  await writeFile(join(directory, "schema/index.html"), "<h1>Schema Reference</h1>");
  await writeFile(join(directory, "index.html"), `<h1 id="a.b">Guide</h1><a href="#a%2Eb">valid</a><a href="/schema#template.extends">Template field</a><a href="/schema#mixin.tasks[].id">Mixin field</a><a href="/missing">missing page</a><a href="#wrong">missing anchor</a><a href="/schema#template.noSuchField">missing field</a>`);
  const { failures } = await checkInternalLinks(directory);
  expect(failures).toHaveLength(3);
  expect(failures.join("\n")).toContain("missing target: /missing");
  expect(failures.join("\n")).toContain("missing anchor: #wrong");
  expect(failures.join("\n")).toContain("missing anchor: /schema#template.noSuchField");
});
