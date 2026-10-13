import { describe, expect, it } from "vitest";
import type { DocumentGrounding } from "../../references/reference-documents";
import { documentLabel, documentsSummary, draftBriefPlaceholder, improveFocusPlaceholder, shortenedDocuments } from "../grounding-summary";

const document = (ref: string, truncated: boolean) => ({ ref, title: ref, text: "x", truncated, originalLength: 10 });
const grounding = (...documents: DocumentGrounding["documents"]): DocumentGrounding => ({ documents });

describe("Grounding summary", () => {
  it("counts the documents and how many will be shortened", () => {
    expect(documentsSummary(null, false)).toBe("None");
    expect(documentsSummary(grounding(document("file:a.md", false)), true)).toBe("Checking…");
    expect(documentsSummary(grounding(document("file:a.md", false)), false)).toBe("1 document");
    expect(documentsSummary(grounding(document("file:a.md", true), document("wiki:W/b", false)), false)).toBe("2 documents · 1 shortened");
  });

  it("lists only the documents that will be shortened", () => {
    expect(shortenedDocuments(null)).toEqual([]);
    expect(shortenedDocuments(grounding(document("file:a.md", true), document("file:b.md", false))).map((item) => item.ref)).toEqual(["file:a.md"]);
  });

  it("shows an entry without its source prefix", () => {
    expect(documentLabel("file:docs/a.md")).toBe("docs/a.md");
    expect(documentLabel("wiki:Contoso.wiki/Engineering")).toBe("Contoso.wiki/Engineering");
  });

  it("suggests a brief or focus that refers to what was chosen", () => {
    const docs = grounding({ ...document("file:docs/estimation.md", false), title: "Estimation guide" });
    expect(draftBriefPlaceholder(docs)).toContain('"Estimation guide"');
    expect(draftBriefPlaceholder(null)).toContain("backend API feature with design");
    expect(improveFocusPlaceholder(docs)).toContain('"Estimation guide"');
    expect(improveFocusPlaceholder(null)).toContain("tighten the estimates");
  });
});
