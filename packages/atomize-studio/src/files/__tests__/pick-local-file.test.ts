import { describe, expect, it } from "vitest";
import { PickLocalFileError, pickLocalFile } from "../pick-local-file";

describe("pickLocalFile", () => {
  it("returns the picked path and its contents", async () => {
    const pick = async () => "/Users/me/Desktop/backend.atomize.yaml";
    const read = async (path: string) => `# ${path}\nname: Backend\n`;

    const result = await pickLocalFile(pick, read);

    expect(result).toEqual({ path: "/Users/me/Desktop/backend.atomize.yaml", contents: "# /Users/me/Desktop/backend.atomize.yaml\nname: Backend\n" });
  });

  it("returns undefined and never reads when the dialog is cancelled", async () => {
    let readCalled = false;
    const pick = async () => null;
    const read = async () => {
      readCalled = true;
      return "";
    };

    const result = await pickLocalFile(pick, read);

    expect(result).toBeUndefined();
    expect(readCalled).toBe(false);
  });

  it("wraps a picker failure in PickLocalFileError", async () => {
    const pick = async () => {
      throw new Error("dialog crashed");
    };
    const read = async () => "";

    const error = await pickLocalFile(pick, read).catch((e) => e);

    expect(error).toBeInstanceOf(PickLocalFileError);
    expect((error as PickLocalFileError).message).toBe("dialog crashed");
  });

  it("wraps a read failure in PickLocalFileError", async () => {
    const pick = async () => "/Users/me/Desktop/backend.atomize.yaml";
    const read = async () => {
      throw new Error("permission denied");
    };

    const error = await pickLocalFile(pick, read).catch((e) => e);

    expect(error).toBeInstanceOf(PickLocalFileError);
    expect((error as PickLocalFileError).message).toBe("permission denied");
  });
});
