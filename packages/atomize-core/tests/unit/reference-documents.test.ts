import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DOCUMENT_GROUNDING_LIMIT,
  fitDocumentsToLimit,
  loadLocalReference,
  parseReferenceRef,
  ReferenceDocumentError,
  readProjectReferences,
  saveProjectReference,
  truncationNotices,
} from "@sppg2001/atomize-core/services/template/reference-documents";

describe("parseReferenceRef", () => {
  test("reads file and wiki references", () => {
    expect(parseReferenceRef("file:docs/how-we-work.md")).toEqual({ kind: "file", path: "docs/how-we-work.md" });
    expect(parseReferenceRef("wiki:Team.wiki/Process/How we work")).toEqual({ kind: "wiki", wiki: "Team.wiki", pagePath: "/Process/How we work" });
  });

  test("rejects anything else", () => {
    for (const entry of ["docs/x.md", "file:", "wiki:Team.wiki", "http://example.com"]) {
      expect(() => parseReferenceRef(entry)).toThrow(ReferenceDocumentError);
    }
  });
});

describe("loadLocalReference", () => {
  let root: string;
  let outside: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "atomize-refs-"));
    outside = await mkdtemp(join(tmpdir(), "atomize-outside-"));
    await mkdir(join(root, "docs"));
    await writeFile(join(root, "docs", "how-we-work.md"), "# How we work\n\nWe always pair on reviews.\n");
    await writeFile(join(root, "notes.txt"), "Plain notes");
    await writeFile(join(root, "config.json"), "{}");
    await writeFile(join(outside, "secret.md"), "secret");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  test("reads a Markdown or text file inside the Workspace Root", async () => {
    const doc = await loadLocalReference(root, "docs/how-we-work.md");
    expect(doc).toEqual({ ref: "file:docs/how-we-work.md", title: "how-we-work.md", text: "# How we work\n\nWe always pair on reviews.\n" });
    expect((await loadLocalReference(root, join(root, "notes.txt"))).ref).toBe("file:notes.txt");
  });

  test("refuses files outside the Workspace Root, including through a symlink", async () => {
    await expect(loadLocalReference(root, join(outside, "secret.md"))).rejects.toMatchObject({ code: "REFERENCE_OUTSIDE_WORKSPACE" });
    await expect(loadLocalReference(root, "../secret.md")).rejects.toMatchObject({ code: "REFERENCE_OUTSIDE_WORKSPACE" });
    await symlink(join(outside, "secret.md"), join(root, "docs", "linked.md"));
    await expect(loadLocalReference(root, "docs/linked.md")).rejects.toMatchObject({ code: "REFERENCE_OUTSIDE_WORKSPACE" });
  });

  test("refuses other file types and missing files", async () => {
    await expect(loadLocalReference(root, "config.json")).rejects.toMatchObject({ code: "REFERENCE_UNSUPPORTED_TYPE" });
    await expect(loadLocalReference(root, "docs/missing.md")).rejects.toMatchObject({ code: "REFERENCE_NOT_FOUND" });
  });
});

describe("fitDocumentsToLimit", () => {
  const doc = (title: string, length: number) => ({ ref: `file:${title}`, title, text: "x".repeat(length) });

  test("keeps documents whole when they fit", () => {
    const fitted = fitDocumentsToLimit([doc("a.md", 1000), doc("b.md", 2000)]);
    expect(fitted.documents.map((d) => [d.text.length, d.truncated])).toEqual([[1000, false], [2000, false]]);
  });

  test("splits the limit evenly, giving space a short document doesn't use to the others", () => {
    const fitted = fitDocumentsToLimit([doc("short.md", 2000), doc("long.md", 50_000), doc("longer.md", 90_000)]);
    const [short, long, longer] = fitted.documents;
    expect(short?.text.length).toBe(2000);
    expect(long?.text.length).toBe(11_000);
    expect(longer?.text.length).toBe(11_000);
    expect(fitted.documents.reduce((sum, d) => sum + d.text.length, 0)).toBe(DOCUMENT_GROUNDING_LIMIT);
    expect(long).toMatchObject({ truncated: true, originalLength: 50_000 });
  });

  test("describes every shortened document so the user can decide before sending", () => {
    const notices = truncationNotices(fitDocumentsToLimit([doc("how-we-work.md", 31_000)]));
    expect(notices).toEqual(['"how-we-work.md" will be shortened to 24,000 of 31,000 characters']);
    expect(truncationNotices(fitDocumentsToLimit([doc("a.md", 10)]))).toEqual([]);
  });
});

describe("Project Reference Documents in .atomize/ai.yaml", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "atomize-aiyaml-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  test("reads nothing when there is no ai.yaml", async () => {
    expect(await readProjectReferences(root)).toEqual({ entries: [], problems: [] });
  });

  test("saves entries, creating the file once and never duplicating", async () => {
    await saveProjectReference(root, "file:docs/how-we-work.md");
    await saveProjectReference(root, "wiki:Team.wiki/Process/Sizing");
    await saveProjectReference(root, "file:docs/how-we-work.md");
    expect((await readProjectReferences(root)).entries).toEqual(["file:docs/how-we-work.md", "wiki:Team.wiki/Process/Sizing"]);
  });

  test("keeps a hand-written file's comments when saving", async () => {
    await mkdir(join(root, ".atomize"));
    await writeFile(join(root, ".atomize", "ai.yaml"), "# Our team's process docs\nreferenceDocuments:\n  - file:docs/a.md # sizing\n");
    await saveProjectReference(root, "file:docs/b.md");
    const text = await readFile(join(root, ".atomize", "ai.yaml"), "utf8");
    expect(text).toContain("# Our team's process docs");
    expect(text).toContain("# sizing");
    expect((await readProjectReferences(root)).entries).toEqual(["file:docs/a.md", "file:docs/b.md"]);
  });

  test("reports entries it can't read instead of failing", async () => {
    await mkdir(join(root, ".atomize"));
    await writeFile(join(root, ".atomize", "ai.yaml"), "referenceDocuments:\n  - file:docs/a.md\n  - nonsense\n  - 42\n");
    const { entries, problems } = await readProjectReferences(root);
    expect(entries).toEqual(["file:docs/a.md"]);
    expect(problems).toHaveLength(2);
  });

  test("reports a file that isn't valid YAML", async () => {
    await mkdir(join(root, ".atomize"));
    await writeFile(join(root, ".atomize", "ai.yaml"), "referenceDocuments: [unclosed");
    const { entries, problems } = await readProjectReferences(root);
    expect(entries).toEqual([]);
    expect(problems[0]).toContain("ai.yaml");
  });
});
