export type FilePicker = () => Promise<string | null>;
export type FileReader = (path: string) => Promise<string>;

export class PickLocalFileError extends Error {
  override readonly name = "PickLocalFileError";
}

/**
 * Prefers Studio's own Open dialog, which shows hidden folders such as a project Catalog's
 * `.atomize/` (macOS and Linux hide them, and the dialog plugin can't show them). Where there's no
 * such dialog, which Rust reports as "UNSUPPORTED" (Windows, which doesn't hide dot-folders), the
 * dialog plugin is used instead.
 */
export async function pickShowingHiddenFolders(native: FilePicker, fallback: FilePicker): Promise<string | null> {
  try {
    return await native();
  } catch (error) {
    if (error === "UNSUPPORTED") return await fallback();
    throw error;
  }
}

async function nativeFilePicker(): Promise<string | null> {
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<string | null>("open_atomize_file");
}

async function pluginFilePicker(): Promise<string | null> {
  const { open } = await import("@tauri-apps/plugin-dialog");
  const path = await open({ multiple: false, filters: [{ name: "Atomize YAML", extensions: ["yaml", "yml"] }] });
  return typeof path === "string" ? path : null;
}

const defaultFilePicker: FilePicker = () => pickShowingHiddenFolders(nativeFilePicker, pluginFilePicker);

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
