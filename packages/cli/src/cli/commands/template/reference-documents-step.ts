import { relative, resolve } from "node:path";
import { autocompleteMultiselect, confirm, multiselect, select, text } from "@clack/prompts";
import type { IPlatformAdapter } from "@sppg2001/atomize-core/platforms/interfaces/platform.interface";
import {
  type DocumentGrounding,
  fitDocumentsToLimit,
  listProjectWikis,
  listWikiPagePaths,
  loadLocalReference,
  loadWikiReference,
  parseReferenceRef,
  type ReferenceDocument,
  ReferenceDocumentError,
  readProjectReferences,
  saveProjectReference,
  truncationNotices,
} from "@sppg2001/atomize-core/services/template/reference-documents";
import { discoverWorkspaceRoot } from "@sppg2001/atomize-core/services/template/workspace-root";
import { CancellationError, ConfigurationError, getErrorMessage } from "@sppg2001/atomize-core/utils/errors";
import { createCommandOutput, resolveCommandOutputPolicy } from "@/cli/utilities/command-output";
import { assertNotCancelled, isInteractiveTerminal, sanitizeTty, withSpinner } from "@/cli/utilities/prompt-utilities";
import { connectProfile } from "./ai-creation/grounding";

export interface ReferenceDocumentOptions {
  /** The Connection Profile wiki pages are read through (the default profile when omitted). */
  profile?: string;
  /** `--reference <path|wiki:...>`, repeatable. */
  reference?: string[];
  /** False with `--no-project-references`. */
  projectReferences?: boolean;
}

export interface ReferenceDocumentDeps {
  interactive?: boolean;
  /** Opens an authenticated adapter for reading wiki pages; only called when a wiki page is needed. */
  connect?: (profile?: string) => Promise<IPlatformAdapter>;
  /** Where relative `--reference` paths start from. */
  cwd?: string;
}

const output = createCommandOutput(resolveCommandOutputPolicy({}));

/**
 * Chooses the Reference Documents for an AI draft or improvement (ADR-0069, ADR-0070): those named
 * with `--reference` plus the Project Reference Documents in `.atomize/ai.yaml`, all shown ticked in
 * an interactive run, where local files can be added and saved for the project. Documents are fitted
 * to the shared limit, and any shortening is shown before anything is sent.
 */
export async function resolveReferenceDocuments(
  options: ReferenceDocumentOptions,
  deps: ReferenceDocumentDeps = {},
): Promise<DocumentGrounding | null> {
  const interactive = deps.interactive ?? isInteractiveTerminal();
  const cwd = deps.cwd ?? process.cwd();
  const root = discoverWorkspaceRoot(cwd);
  const connect = deps.connect ?? connectProfile;
  let connection: Promise<IPlatformAdapter> | undefined;
  const sources: Sources = { root, adapter: () => (connection ??= connect(options.profile)) };

  const flagged = (options.reference ?? []).map((entry) => toEntry(entry, cwd, root));
  const project = options.projectReferences === false ? { entries: [], problems: [] } : await readProjectReferences(root);
  for (const problem of project.problems) output.warn(sanitizeTty(problem));
  const saved = project.entries.filter((entry) => !flagged.includes(entry));

  const chosenSaved = interactive && saved.length > 0 ? await tickSaved(saved) : saved;
  const documents: ReferenceDocument[] = [];
  for (const entry of flagged) documents.push(await load(sources, entry, { requested: true }));
  for (const entry of chosenSaved) {
    const document = await load(sources, entry, { requested: false });
    if (document) documents.push(document);
  }
  if (interactive) documents.push(...await addDocuments(sources, documents));
  if (documents.length === 0) return null;

  return confirmFit(documents, interactive);
}

function toEntry(entry: string, cwd: string, root: string): string {
  if (entry.startsWith("wiki:") || entry.startsWith("file:")) return entry;
  return `file:${relative(root, resolve(cwd, entry)).split("\\").join("/")}`;
}

async function tickSaved(saved: string[]): Promise<string[]> {
  return assertNotCancelled(
    await multiselect({
      message: "Project Reference Documents to send (untick any to leave out of this run):",
      options: saved.map((entry) => ({ value: entry, label: sanitizeTty(entry) })),
      initialValues: saved,
      required: false,
    }),
  ) as string[];
}

interface Sources {
  root: string;
  /** The run's Azure DevOps connection, opened the first time a wiki page is needed. */
  adapter: () => Promise<IPlatformAdapter>;
}

/**
 * Loads one entry. A document named on the command line was asked for, so failing to load it stops
 * the run; a saved default that can't be loaded, or whose wiki this profile doesn't reach, is
 * reported and left out.
 */
async function load(sources: Sources, entry: string, context: { requested: true }): Promise<ReferenceDocument>;
async function load(sources: Sources, entry: string, context: { requested: false }): Promise<ReferenceDocument | undefined>;
async function load(sources: Sources, entry: string, context: { requested: boolean }): Promise<ReferenceDocument | undefined> {
  try {
    const ref = parseReferenceRef(entry);
    return ref.kind === "wiki"
      ? await withSpinner(`Reading ${sanitizeTty(entry)}…`, async () => loadWikiReference(await sources.adapter(), ref), { done: () => `Read ${sanitizeTty(entry)}`, failed: `Could not read ${sanitizeTty(entry)}` })
      : await loadLocalReference(sources.root, ref.path);
  } catch (error) {
    const message = getErrorMessage(error);
    if (context.requested) throw new ConfigurationError(`Reference Document ${message}`);
    const unavailable = error instanceof ReferenceDocumentError && error.code === "REFERENCE_UNAVAILABLE";
    output.warn(sanitizeTty(unavailable ? `Unavailable for this profile, so left out: ${message}` : `Left out a Project Reference Document: ${message}`));
    return undefined;
  }
}

async function addDocuments(sources: Sources, already: ReferenceDocument[]): Promise<ReferenceDocument[]> {
  const added: ReferenceDocument[] = [];
  const isNew = (document: ReferenceDocument) => ![...already, ...added].some((existing) => existing.ref === document.ref);
  while (true) {
    const next = assertNotCancelled(
      await select({
        message: already.length + added.length > 0 ? "Add another Reference Document?" : "Add a Reference Document describing how your team works? (optional)",
        options: [
          { label: "No, continue", value: "done" },
          { label: "Add a local Markdown or text file…", value: "file" },
          { label: "Add an Azure DevOps wiki page…", value: "wiki" },
        ],
      }),
    ) as string;
    if (next === "done") return added;
    if (next === "wiki") {
      const pages = (await pickWikiPages(sources)).filter(isNew);
      added.push(...pages);
      if (pages.length > 0) await offerToSave(sources.root, pages);
      continue;
    }

    const path = assertNotCancelled(
      await text({
        message: "Path to the file, inside this workspace:",
        placeholder: "docs/how-we-work.md",
        validate: (value): string | undefined => (value?.trim() ? undefined : "Enter a path"),
      }),
    );
    let document: ReferenceDocument;
    try {
      document = await loadLocalReference(sources.root, resolve(sources.root, path.trim()));
    } catch (error) {
      output.warn(sanitizeTty(getErrorMessage(error)));
      continue;
    }
    if (!isNew(document)) continue;
    added.push(document);
    await offerToSave(sources.root, [document]);
  }
}

/** Picks pages from one of the project's wikis by filtering their paths, so nobody copies URLs. */
async function pickWikiPages(sources: Sources): Promise<ReferenceDocument[]> {
  try {
    const { adapter, wikis } = await withSpinner("Loading this project's wikis…", async () => {
      const adapter = await sources.adapter();
      return { adapter, wikis: await listProjectWikis(adapter) };
    }, { done: ({ wikis }) => `Found ${wikis.length} ${wikis.length === 1 ? "wiki" : "wikis"}`, failed: "Could not load the wikis" });
    if (wikis.length === 0) {
      output.warn("This project has no wikis.");
      return [];
    }
    const wikiName = wikis.length === 1
      ? (wikis[0] as { name: string }).name
      : assertNotCancelled(await select({ message: "Which wiki?", options: wikis.map((wiki) => ({ value: wiki.name, label: sanitizeTty(wiki.name) })) })) as string;
    const paths = await withSpinner(
      `Loading the pages of ${sanitizeTty(wikiName)}…`,
      () => listWikiPagePaths(adapter, (wikis.find((wiki) => wiki.name === wikiName) ?? { id: wikiName }).id),
      { done: (found) => `Found ${found.length} ${found.length === 1 ? "page" : "pages"}`, failed: "Could not list the wiki's pages" },
    );
    const picked = assertNotCancelled(
      await autocompleteMultiselect<string>({
        message: `Pages from ${wikiName} (only each page itself is read, not its sub-pages):`,
        placeholder: "Type to filter page paths",
        options: paths.map((path) => ({ value: path, label: sanitizeTty(path) })),
        required: false,
      }),
    ) as string[];
    if (picked.length === 0) return [];
    return await withSpinner(`Reading ${picked.length} wiki ${picked.length === 1 ? "page" : "pages"}…`, async () => {
      const documents: ReferenceDocument[] = [];
      for (const pagePath of picked) documents.push(await loadWikiReference(adapter, { kind: "wiki", wiki: wikiName, pagePath }));
      return documents;
    }, { done: (documents) => `Read ${documents.length} wiki ${documents.length === 1 ? "page" : "pages"}`, failed: "Could not read the wiki pages" });
  } catch (error) {
    output.warn(sanitizeTty(getErrorMessage(error)));
    return [];
  }
}

async function offerToSave(root: string, documents: ReferenceDocument[]): Promise<void> {
  const names = documents.map((document) => document.ref).join(", ");
  const save = assertNotCancelled(
    await confirm({ message: `Also save ${names} for this project, so ${documents.length === 1 ? "it's" : "they're"} offered on every AI run?`, initialValue: false }),
  ) as boolean;
  if (!save) return;
  for (const document of documents) await saveProjectReference(root, document.ref);
  output.success(`Saved ${names} to .atomize/ai.yaml`);
}

/** Shows any shortening before sending; an interactive run can continue, leave documents out, or cancel. */
async function confirmFit(documents: ReferenceDocument[], interactive: boolean): Promise<DocumentGrounding | null> {
  let kept = documents;
  while (true) {
    const grounding = fitDocumentsToLimit(kept);
    const notices = truncationNotices(grounding);
    if (notices.length === 0) return grounding;
    if (!interactive) {
      for (const notice of notices) output.warn(sanitizeTty(`${notice} to fit the AI request.`));
      return grounding;
    }
    const choice = assertNotCancelled(
      await select({
        message: `${notices.join("; ")} to fit the AI request. What would you like to do?`,
        options: [
          { label: "Continue with the shortened documents", value: "continue" },
          { label: "Leave some documents out", value: "deselect" },
          { label: "Cancel", value: "cancel" },
        ],
      }),
    ) as string;
    if (choice === "continue") return grounding;
    if (choice === "cancel") throw new CancellationError("AI request cancelled");
    const refs = assertNotCancelled(
      await multiselect({
        message: "Reference Documents to keep:",
        options: kept.map((document) => ({ value: document.ref, label: sanitizeTty(document.title), hint: `${document.text.length.toLocaleString("en-US")} characters` })),
        initialValues: kept.map((document) => document.ref),
        required: false,
      }),
    ) as string[];
    kept = kept.filter((document) => refs.includes(document.ref));
    if (kept.length === 0) return null;
  }
}
