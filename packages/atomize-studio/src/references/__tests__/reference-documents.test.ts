import { describe, expect, it } from "vitest";
import { folderName, localEntry, parseLoadedReferences, parseReferenceList, wikiEntry } from "../reference-documents";

describe("Reference Documents model", () => {
  it("reads the project folder's saved Reference Documents", () => {
    expect(parseReferenceList({ workspaceRoot: "/repo", entries: ["file:docs/a.md", 3], problems: ["bad entry"] }))
      .toEqual({ workspaceRoot: "/repo", entries: ["file:docs/a.md"], problems: ["bad entry"] });
    expect(() => parseReferenceList({})).toThrow("project folder");
  });

  it("reads loaded documents with their shortening and anything skipped", () => {
    const parsed = parseLoadedReferences({
      grounding: { documents: [{ ref: "file:a.md", title: "a.md", text: "x", truncated: true, originalLength: 9 }] },
      notices: ['"a.md" will be shortened'],
      skipped: [{ entry: "file:../b.md", message: "outside" }, { nope: 1 }],
    });
    expect(parsed.grounding?.documents).toHaveLength(1);
    expect(parsed.notices).toEqual(['"a.md" will be shortened']);
    expect(parsed.skipped).toEqual([{ entry: "file:../b.md", message: "outside" }]);
    expect(parseLoadedReferences({ grounding: null }).grounding).toBeNull();
  });

  it("makes a local file's entry relative to the project folder, refusing files outside it", () => {
    expect(localEntry("/repo/", "/repo/docs/how-we-work.md")).toBe("file:docs/how-we-work.md");
    expect(localEntry("C:\\repo", "C:\\repo\\docs\\a.md")).toBe("file:docs/a.md");
    expect(localEntry("/repo", "/elsewhere/a.md")).toBeUndefined();
    expect(localEntry("/repo", "/repository/a.md")).toBeUndefined();
  });

  it("names wiki pages and folders", () => {
    expect(wikiEntry("Team.wiki", "/Process/Sizing")).toBe("wiki:Team.wiki/Process/Sizing");
    expect(wikiEntry("Team.wiki", "Process")).toBe("wiki:Team.wiki/Process");
    expect(folderName("/Users/me/repo/")).toBe("repo");
  });
});
