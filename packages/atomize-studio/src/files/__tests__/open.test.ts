import { describe, expect, it } from "vitest";
import { LocalFileResolutionError } from "../local-file-loader";
import { openLocalFile } from "../open";
import { PickLocalFileError } from "../pick-local-file";

describe("openLocalFile", () => {
  it("returns cancelled when the file picker is dismissed", async () => {
    const result = await openLocalFile(async () => null);
    expect(result).toEqual({ kind: "cancelled" });
  });

  it("returns the loaded valid Template alongside its path", async () => {
    const pick = async () => "/tmp/backend.atomize.yaml";
    const read = async () => "version: '1.0'\nname: Backend\nfilter: {}\ntasks:\n  - title: Implement\n";

    const result = await openLocalFile(pick, read);

    expect(result).toEqual({
      kind: "valid",
      path: "/tmp/backend.atomize.yaml",
      template: { version: "1.0", name: "Backend", filter: {}, tasks: [{ title: "Implement" }] },
    });
  });

  it("returns malformed with the coerced template and no path loss", async () => {
    const pick = async () => "/tmp/draft.atomize.yaml";
    const read = async () => "version: '1.0'\nname: Draft\nfilter: {}\ntasks:\n  - title: ''\n";

    const result = await openLocalFile(pick, read);

    expect(result.kind).toBe("malformed");
    if (result.kind !== "malformed") throw new Error("expected malformed");
    expect(result.path).toBe("/tmp/draft.atomize.yaml");
  });

  it("returns wrong-format without a path for an unrecognizable file", async () => {
    const pick = async () => "/tmp/notes.txt";
    const read = async () => "just some notes";

    const result = await openLocalFile(pick, read);

    expect(result).toEqual({ kind: "wrong-format", message: "This file doesn't have the shape of an Atomize Template (a name, a filter, and at least one task)." });
  });

  it("propagates a picker failure as PickLocalFileError", async () => {
    const pick = async () => {
      throw new Error("dialog crashed");
    };

    await expect(openLocalFile(pick)).rejects.toBeInstanceOf(PickLocalFileError);
  });

  it("propagates a resolution failure as LocalFileResolutionError", async () => {
    const pick = async () => "/tmp/child.atomize.yaml";
    const read = async () => "extends: missing-base\nname: Child\n";
    const resolve = async () => {
      throw new Error('template "missing-base" not found.');
    };

    await expect(openLocalFile(pick, read, resolve)).rejects.toBeInstanceOf(LocalFileResolutionError);
  });
});
