import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { Document, isMap, isSeq, parseDocument, YAMLSeq } from "yaml";
import { hasWikiReader } from "../../platforms/capabilities";
import type { IPlatformAdapter, WikiInfo } from "../../platforms/interfaces/platform.interface";
import { getErrorMessage } from "../../utils/errors";

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
  | "REFERENCE_NOT_FOUND"
  /** A wiki the run's Connection Profile doesn't reach; a saved entry is skipped, not a failure. */
  | "REFERENCE_UNAVAILABLE"
  /** The token can't read wikis: it needs the optional Wiki (Read) scope. */
  | "REFERENCE_WIKI_ACCESS"
  | "REFERENCE_READ_FAILED";

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

/** Lists a wiki's page paths, so the user can pick pages without copying URLs. */
export async function listWikiPagePaths(platform: IPlatformAdapter, wiki: string): Promise<string[]> {
  try {
    if (!hasWikiReader(platform)) throw noWikis();
    return await platform.listWikiPages(wiki);
  } catch (error) {
    throw toWikiError(error, `wiki:${wiki}`);
  }
}

/** The wikis the Connection Profile's project has. */
export async function listProjectWikis(platform: IPlatformAdapter): Promise<WikiInfo[]> {
  try {
    if (!hasWikiReader(platform)) throw noWikis();
    return await platform.listWikis();
  } catch (error) {
    throw toWikiError(error, "this project's wikis");
  }
}

/**
 * Reads one Azure DevOps wiki page's Markdown as a Reference Document: never its sub-pages, the
 * pages it links to, or its images and attachments. A wiki outside the profile's project is
 * unavailable for that profile rather than an error the run must stop for.
 */
export async function loadWikiReference(platform: IPlatformAdapter, ref: Extract<ReferenceDocumentRef, { kind: "wiki" }>): Promise<ReferenceDocument> {
  const entry = `wiki:${ref.wiki}${ref.pagePath}`;
  try {
    if (!hasWikiReader(platform)) throw noWikis();
    const wikis = await platform.listWikis();
    const wiki = wikis.find((candidate) => candidate.name === ref.wiki || candidate.id === ref.wiki);
    if (!wiki) {
      throw new ReferenceDocumentError("REFERENCE_UNAVAILABLE", `"${entry}" is in a wiki this Connection Profile's project doesn't have.`);
    }
    const text = await platform.readWikiPage(wiki.id, ref.pagePath);
    return { ref: entry, title: ref.pagePath.split("/").filter(Boolean).pop() ?? ref.pagePath, text };
  } catch (error) {
    throw toWikiError(error, entry);
  }
}

function noWikis(): ReferenceDocumentError {
  return new ReferenceDocumentError("REFERENCE_UNAVAILABLE", "This platform has no wikis to read Reference Documents from.");
}

function toWikiError(error: unknown, what: string): ReferenceDocumentError {
  if (error instanceof ReferenceDocumentError) return error;
  const status = typeof error === "object" && error !== null ? (error as { statusCode?: unknown; status?: unknown }).statusCode ?? (error as { status?: unknown }).status : undefined;
  const message = getErrorMessage(error);
  if (status === 401 || status === 403 || /unauthori[sz]ed|forbidden|TF400813|access denied/i.test(message)) {
    return new ReferenceDocumentError(
      "REFERENCE_WIKI_ACCESS",
      "This Connection Profile's token can't read wikis. Rotate it with the Wiki (Read) scope added, or use local files instead.",
    );
  }
  if (status === 404 || /not found|does not exist/i.test(message)) {
    return new ReferenceDocumentError("REFERENCE_NOT_FOUND", `"${what}" wasn't found.`);
  }
  return new ReferenceDocumentError("REFERENCE_READ_FAILED", `Atomize could not read ${what}: ${message}`);
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
  const doc = text ? parseDocument(text) : new Document({});
  if (!isMap(doc.contents)) doc.contents = doc.createNode({}) as unknown as typeof doc.contents;
  const existing = doc.get("referenceDocuments", true);
  const list = isSeq(existing) ? existing : new YAMLSeq();
  if (list.items.some((item) => String(item && typeof item === "object" && "value" in item ? item.value : item) === entry)) return;
  list.add(doc.createNode(entry));
  doc.set("referenceDocuments", list);
  await writeFile(path, doc.toString(), "utf8");
}

/** One Reference Document entry to load, and whether the user asked for it on this run. */
export interface ReferenceEntryRequest {
  entry: string;
  /** Asked for on this run (e.g. `--reference`), so failing to load it fails the run. */
  requested: boolean;
}

export interface SkippedReference {
  entry: string;
  code: ReferenceDocumentErrorCode;
  message: string;
}

export interface ReferenceSources {
  /** Where `file:` entries resolve; without one, local entries are skipped as unavailable. */
  workspaceRoot?: string;
  /**
   * The run's connection for `wiki:` entries, opened the first time one is needed. A run without one
   * passes a function that throws a REFERENCE_UNAVAILABLE ReferenceDocumentError in its own words.
   */
  wiki: () => Promise<IPlatformAdapter>;
  /** Wraps each read, e.g. to show progress while a wiki page loads. */
  reading?: (entry: string, read: () => Promise<ReferenceDocument>) => Promise<ReferenceDocument>;
}

/**
 * Loads Reference Documents for an AI run (ADR-0069, ADR-0070). A requested document that can't be
 * loaded throws its ReferenceDocumentError; a saved default that can't be loaded, or whose wiki the
 * run's connection doesn't reach, is skipped and reported, never silently dropped.
 */
export async function loadReferenceDocuments(
  entries: ReferenceEntryRequest[],
  sources: ReferenceSources,
): Promise<{ documents: ReferenceDocument[]; skipped: SkippedReference[] }> {
  let connection: Promise<IPlatformAdapter> | undefined;
  const wiki = () => (connection ??= sources.wiki());
  const read = sources.reading ?? ((_entry, load) => load());
  const documents: ReferenceDocument[] = [];
  const skipped: SkippedReference[] = [];

  for (const { entry, requested } of entries) {
    try {
      const ref = parseReferenceRef(entry);
      documents.push(await read(entry, async () => {
        if (ref.kind === "wiki") return await loadWikiReference(await wiki(), ref);
        if (!sources.workspaceRoot) {
          throw new ReferenceDocumentError("REFERENCE_UNAVAILABLE", `"${ref.path}" needs an open workspace folder.`);
        }
        return await loadLocalReference(sources.workspaceRoot, ref.path);
      }));
    } catch (error) {
      const failure = error instanceof ReferenceDocumentError
        ? error
        : new ReferenceDocumentError("REFERENCE_READ_FAILED", error instanceof Error ? error.message : String(error));
      if (requested) throw failure;
      skipped.push({ entry, code: failure.code, message: failure.message });
    }
  }
  return { documents, skipped };
}

/** What to do when fitting would shorten some documents. */
export type ShortenedChoice =
  | { action: "continue" }
  | { action: "keep"; refs: string[] }
  | { action: "cancel" };

/**
 * Fits Reference Documents to the shared limit, asking before any is sent shortened: continue with
 * them, keep only some (then refit), or cancel. Null when no documents are left; undefined when cancelled.
 */
export async function fitReferenceDocuments(
  documents: ReferenceDocument[],
  onShortened: (notices: string[], documents: ReferenceDocument[]) => Promise<ShortenedChoice>,
): Promise<DocumentGrounding | null | undefined> {
  let kept = documents;
  while (kept.length > 0) {
    const grounding = fitDocumentsToLimit(kept);
    const notices = truncationNotices(grounding);
    if (notices.length === 0) return grounding;
    const choice = await onShortened(notices, kept);
    if (choice.action === "continue") return grounding;
    if (choice.action === "cancel") return undefined;
    kept = kept.filter((document) => choice.refs.includes(document.ref));
  }
  return null;
}
