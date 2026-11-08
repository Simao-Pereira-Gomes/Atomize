import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockPlatformAdapter } from "@sppg2001/atomize-core/platforms/adapters/mock/mock.adapter";
import {
  DOCUMENT_GROUNDING_LIMIT,
  fitReferenceDocuments,
  loadReferenceDocuments,
  type ReferenceDocument,
  ReferenceDocumentError,
} from "@sppg2001/atomize-core/services/template/reference-documents";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "atomize-refs-session-"));
  await mkdir(join(root, "docs"));
  await writeFile(join(root, "docs", "how-we-work.md"), "# How we work\n\nWe pair on reviews.\n");
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const wiki = async () => {
  const adapter = new MockPlatformAdapter();
  await adapter.authenticate();
  return adapter;
};
const noWiki = async (): Promise<never> => {
  throw new ReferenceDocumentError("REFERENCE_UNAVAILABLE", "Wiki pages need a Connection Profile.");
};

describe("loadReferenceDocuments", () => {
  test("loads local files and wiki pages in order", async () => {
    const { documents, skipped } = await loadReferenceDocuments(
      [{ entry: "file:docs/how-we-work.md", requested: true }, { entry: "wiki:Team.wiki/Process/Sizing", requested: false }],
      { workspaceRoot: root, wiki },
    );

    expect(documents.map((document) => document.ref)).toEqual(["file:docs/how-we-work.md", "wiki:Team.wiki/Process/Sizing"]);
    expect(skipped).toEqual([]);
  });

  test("a requested document that can't be read stops the run", async () => {
    await expect(
      loadReferenceDocuments([{ entry: "file:docs/missing.md", requested: true }], { workspaceRoot: root, wiki }),
    ).rejects.toBeInstanceOf(ReferenceDocumentError);
  });

  test("a saved default that can't be read is skipped and reported with its reason", async () => {
    const { documents, skipped } = await loadReferenceDocuments(
      [{ entry: "file:docs/missing.md", requested: false }, { entry: "wiki:Team.wiki/Process/Sizing", requested: false }],
      { workspaceRoot: root, wiki: noWiki },
    );

    expect(documents).toEqual([]);
    expect(skipped.map((item) => [item.entry, item.code])).toEqual([
      ["file:docs/missing.md", "REFERENCE_NOT_FOUND"],
      ["wiki:Team.wiki/Process/Sizing", "REFERENCE_UNAVAILABLE"],
    ]);
  });

  test("connects for wiki pages once, and only when one is needed", async () => {
    let connections = 0;
    const counting = async () => {
      connections++;
      return await wiki();
    };
    await loadReferenceDocuments([{ entry: "file:docs/how-we-work.md", requested: false }], { workspaceRoot: root, wiki: counting });
    expect(connections).toBe(0);

    await loadReferenceDocuments(
      [{ entry: "wiki:Team.wiki/Process/Sizing", requested: false }, { entry: "wiki:Team.wiki/Process/How we work", requested: false }],
      { workspaceRoot: root, wiki: counting },
    );
    expect(connections).toBe(1);
  });
});

describe("fitReferenceDocuments", () => {
  const document = (ref: string, length: number): ReferenceDocument => ({ ref, title: ref, text: "x".repeat(length) });
  const long = [document("file:a.md", DOCUMENT_GROUNDING_LIMIT), document("file:b.md", DOCUMENT_GROUNDING_LIMIT)];

  test("returns the documents without asking when nothing is shortened", async () => {
    const grounding = await fitReferenceDocuments([document("file:a.md", 10)], async () => {
      throw new Error("should not ask");
    });
    expect(grounding?.documents).toHaveLength(1);
  });

  test("asks before sending shortened documents, and continues with them", async () => {
    const asked: string[][] = [];
    const grounding = await fitReferenceDocuments(long, async (notices) => {
      asked.push(notices);
      return { action: "continue" };
    });
    expect(asked[0]).toHaveLength(2);
    expect(grounding?.documents.every((item) => item.truncated)).toBe(true);
  });

  test("keeps only the documents the user chose, and refits them", async () => {
    const grounding = await fitReferenceDocuments(long, async () => ({ action: "keep", refs: ["file:b.md"] }));
    expect(grounding?.documents.map((item) => [item.ref, item.truncated])).toEqual([["file:b.md", false]]);
  });

  test("is null when the user keeps none, and undefined when they cancel", async () => {
    expect(await fitReferenceDocuments(long, async () => ({ action: "keep", refs: [] }))).toBeNull();
    expect(await fitReferenceDocuments(long, async () => ({ action: "cancel" }))).toBeUndefined();
    expect(await fitReferenceDocuments([], async () => ({ action: "continue" }))).toBeNull();
  });
});
