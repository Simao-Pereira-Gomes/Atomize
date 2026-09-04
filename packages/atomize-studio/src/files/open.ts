import type { TaskTemplate } from "@sppg2001/atomize-schema";
import { type LocalFileResolver, loadLocalFile } from "./local-file-loader";
import { type FilePicker, type FileReader, pickLocalFile } from "./pick-local-file";

export type OpenLocalFileResult =
  | { kind: "cancelled" }
  | { kind: "valid" | "malformed"; path: string; template: TaskTemplate }
  | { kind: "wrong-format"; message: string };

/** Open's orchestration: pick a file, classify it, and hand back what the Authoring Store needs. Throws PickLocalFileError/LocalFileResolutionError for their respective failures. */
export async function openLocalFile(pick?: FilePicker, read?: FileReader, resolve?: LocalFileResolver): Promise<OpenLocalFileResult> {
  const picked = await pickLocalFile(pick, read);
  if (!picked) return { kind: "cancelled" };

  const loaded = await loadLocalFile(picked.contents, picked.path, resolve);
  if (loaded.kind === "wrong-format") return loaded;
  return { kind: loaded.kind, path: picked.path, template: loaded.template };
}
