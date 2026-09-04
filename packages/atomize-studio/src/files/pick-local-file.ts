export type FilePicker = () => Promise<string | null>;
export type FileReader = (path: string) => Promise<string>;

export class PickLocalFileError extends Error {
  override readonly name = "PickLocalFileError";
}

async function defaultFilePicker(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const path = await open({ multiple: false, filters: [{ name: "Atomize YAML", extensions: ["yaml", "yml"] }] });
  return typeof path === "string" ? path : null;
}

async function defaultFileReader(path: string): Promise<string> {
  const { readTextFile } = await import("@tauri-apps/plugin-fs");
  return await readTextFile(path);
}

/** Shared by Open's Starting Path and its resolution flow — the picker/reader mechanics are identical either way. */
export async function pickLocalFile(
  pick: FilePicker = defaultFilePicker,
  read: FileReader = defaultFileReader,
): Promise<{ path: string; contents: string } | undefined> {
  let path: string | null;
  try {
    path = await pick();
  } catch (error) {
    throw new PickLocalFileError(error instanceof Error ? error.message : "Could not open the file picker.");
  }
  if (!path) return undefined;

  try {
    return { path, contents: await read(path) };
  } catch (error) {
    throw new PickLocalFileError(error instanceof Error ? error.message : "Could not read the selected file.");
  }
}
