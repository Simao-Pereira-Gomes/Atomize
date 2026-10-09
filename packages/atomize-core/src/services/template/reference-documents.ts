import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { isMap, isSeq, parseDocument, YAMLSeq } from "yaml";

/** The total size of Document Grounding on every surface, so a document behaves the same everywhere (ADR-0069). */
export const DOCUMENT_GROUNDING_LIMIT = 24_000;
const LOCAL_EXTENSIONS = new Set([".md", ".txt"]);
const PROJECT_AI_CONFIG = join(".atomize", "ai.yaml");

/** Where a Reference Document lives: a file inside the Workspace Root, or an Azure DevOps wiki page. */
export type ReferenceDocumentRef = { kind: "file"; path: string } | { kind: "wiki"; wiki: string; pagePath: string };

export type ReferenceDocumentErrorCode =
  | "REFERENCE_INVALID"
  | "REFERENCE_OUTSIDE_WORKSPACE"
  | "REFERENCE_UNSUPPORTED_TYPE"
  | "REFERENCE_NOT_FOUND";

export class ReferenceDocumentError extends Error {
  constructor(readonly code: ReferenceDocumentErrorCode, message: string) {
    super(message);
    this.name = "ReferenceDocumentError";
  }
}

/** A Reference Document's text, read from its source. */
export interface ReferenceDocument {
  /** The `file:` or `wiki:` entry naming it, as Project Reference Documents record it. */
  ref: string;
  title: string;
  text: string;
}

/** Reference Documents fitted to the limit: Document Grounding (see CONTEXT.md). */
export interface DocumentGrounding {
  documents: (ReferenceDocument & { truncated: boolean; originalLength: number })[];
}

export function parseReferenceRef(entry: string): ReferenceDocumentRef {
  const value = entry.trim();
  if (value.startsWith("file:") && value.length > "file:".length) {
    return { kind: "file", path: value.slice("file:".length).trim() };
  }
  const wiki = /^wiki:([^/]+)(\/.+)$/.exec(value);
  if (wiki?.[1] && wiki[2]) return { kind: "wiki", wiki: wiki[1].trim(), pagePath: wiki[2].trim() };
  throw new ReferenceDocumentError(
    "REFERENCE_INVALID",
    `"${entry}" isn't a Reference Document. Use file:<path> or wiki:<wiki>/<page path>.`,
  );
}

/**
 * Reads a local Reference Document. Only `.md` and `.txt` files whose real location is inside the
 * Workspace Root are allowed, so a committed ai.yaml can never send files from outside the repo.
 * Relative paths resolve against the Workspace Root.
 */
export async function loadLocalReference(workspaceRoot: string, path: string): Promise<ReferenceDocument> {
  const root = await realpath(workspaceRoot);
  const requested = isAbsolute(path) ? path : resolve(root, path);
  const display = relative(root, requested) || path;

  if (!LOCAL_EXTENSIONS.has(extname(requested).toLowerCase())) {
    throw new ReferenceDocumentError("REFERENCE_UNSUPPORTED_TYPE", `"${display}" isn't a Markdown (.md) or text (.txt) file.`);
  }
  let actual: string;
  try {
    actual = await realpath(requested);
  } catch {
    if (!isInside(root, resolve(requested))) throw outsideWorkspace(display);
    throw new ReferenceDocumentError("REFERENCE_NOT_FOUND", `"${display}" wasn't found.`);
  }
  if (!isInside(root, actual)) throw outsideWorkspace(display);

  const relativePath = relative(root, actual).split(sep).join("/");
  return { ref: `file:${relativePath}`, title: basename(actual), text: await readFile(actual, "utf8") };
}

function isInside(root: string, path: string): boolean {
  const fromRoot = relative(root, path);
  return fromRoot !== "" && !fromRoot.startsWith("..") && !isAbsolute(fromRoot);
}

function outsideWorkspace(display: string): ReferenceDocumentError {
  return new ReferenceDocumentError(
    "REFERENCE_OUTSIDE_WORKSPACE",
    `"${display}" is outside this workspace. Reference Documents must be files inside the Workspace Root.`,
  );
}

/**
 * Fits Reference Documents into the shared limit: an even share each, with space a short document
 * doesn't use handed to the others. Shortened documents say so, so the user can decide before sending.
 */
export function fitDocumentsToLimit(documents: ReferenceDocument[], limit = DOCUMENT_GROUNDING_LIMIT): DocumentGrounding {
  const allowance = new Map<number, number>();
  let remaining = limit;
  let open = documents.map((_, index) => index);
  while (open.length > 0) {
    const share = Math.floor(remaining / open.length);
    const fitting = open.filter((index) => (documents[index]?.text.length ?? 0) <= share);
    if (fitting.length === 0) {
      for (const index of open) allowance.set(index, share);
      break;
    }
    for (const index of fitting) {
      const length = documents[index]?.text.length ?? 0;
      allowance.set(index, length);
      remaining -= length;
    }
    open = open.filter((index) => !fitting.includes(index));
  }
  return {
    documents: documents.map((document, index) => {
      const keep = allowance.get(index) ?? document.text.length;
      return { ...document, text: document.text.slice(0, keep), truncated: keep < document.text.length, originalLength: document.text.length };
    }),
  };
}

export function truncationNotices(grounding: DocumentGrounding): string[] {
  const format = (n: number) => n.toLocaleString("en-US");
  return grounding.documents
    .filter((document) => document.truncated)
    .map((document) => `"${document.title}" will be shortened to ${format(document.text.length)} of ${format(document.originalLength)} characters`);
}

/** Project Reference Documents recorded in `.atomize/ai.yaml` (ADR-0070), with any entries that couldn't be read. */
export async function readProjectReferences(workspaceRoot: string): Promise<{ entries: string[]; problems: string[] }> {
  let text: string;
  try {
    text = await readFile(join(workspaceRoot, PROJECT_AI_CONFIG), "utf8");
  } catch {
    return { entries: [], problems: [] };
  }
  const doc = parseDocument(text);
  if (doc.errors.length > 0) {
    return { entries: [], problems: [`.atomize/ai.yaml isn't valid YAML: ${doc.errors[0]?.message ?? "unknown error"}`] };
  }
  const listed: unknown = (doc.toJS() as { referenceDocuments?: unknown } | null)?.referenceDocuments;
  if (listed === undefined || listed === null) return { entries: [], problems: [] };
  if (!Array.isArray(listed)) return { entries: [], problems: [".atomize/ai.yaml: referenceDocuments must be a list."] };

  const entries: string[] = [];
  const problems: string[] = [];
  for (const entry of listed) {
    try {
      if (typeof entry !== "string") throw new ReferenceDocumentError("REFERENCE_INVALID", `${JSON.stringify(entry)} isn't a Reference Document.`);
      parseReferenceRef(entry);
      entries.push(entry.trim());
    } catch (error) {
      problems.push(`.atomize/ai.yaml: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { entries, problems };
}

/** Adds an entry to `.atomize/ai.yaml`, creating it if needed and keeping any comments. */
export async function saveProjectReference(workspaceRoot: string, entry: string): Promise<void> {
  parseReferenceRef(entry);
  const path = join(workspaceRoot, PROJECT_AI_CONFIG);
  let text = "";
  try {
    text = await readFile(path, "utf8");
  } catch {
    await mkdir(join(workspaceRoot, ".atomize"), { recursive: true });
  }
  const doc = parseDocument(text || "{}");
  if (!isMap(doc.contents)) doc.contents = doc.createNode({}) as unknown as typeof doc.contents;
  const existing = doc.get("referenceDocuments", true);
  const list = isSeq(existing) ? existing : new YAMLSeq();
  if (list.items.some((item) => String(item && typeof item === "object" && "value" in item ? item.value : item) === entry)) return;
  list.add(doc.createNode(entry));
  doc.set("referenceDocuments", list);
  await writeFile(path, doc.toString(), "utf8");
}
