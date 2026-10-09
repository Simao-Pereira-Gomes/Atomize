import { relative, resolve } from "node:path";
import { confirm, multiselect, select, text } from "@clack/prompts";
import {
  type DocumentGrounding,
  fitDocumentsToLimit,
  loadLocalReference,
  parseReferenceRef,
  type ReferenceDocument,
  readProjectReferences,
  saveProjectReference,
  truncationNotices,
} from "@sppg2001/atomize-core/services/template/reference-documents";
import { discoverWorkspaceRoot } from "@sppg2001/atomize-core/services/template/workspace-root";
import { CancellationError, ConfigurationError, getErrorMessage } from "@sppg2001/atomize-core/utils/errors";
import { createCommandOutput, resolveCommandOutputPolicy } from "@/cli/utilities/command-output";
import { assertNotCancelled, isInteractiveTerminal, sanitizeTty } from "@/cli/utilities/prompt-utilities";

export interface ReferenceDocumentOptions {
  /** `--reference <path|wiki:...>`, repeatable. */
  reference?: string[];
  /** False with `--no-project-references`. */
  projectReferences?: boolean;
}

export interface ReferenceDocumentDeps {
  interactive?: boolean;
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

  const flagged = (options.reference ?? []).map((entry) => toEntry(entry, cwd, root));
  const project = options.projectReferences === false ? { entries: [], problems: [] } : await readProjectReferences(root);
  for (const problem of project.problems) output.warn(sanitizeTty(problem));
  const saved = project.entries.filter((entry) => !flagged.includes(entry));

  const chosenSaved = interactive && saved.length > 0 ? await tickSaved(saved) : saved;
  const documents: ReferenceDocument[] = [];
  for (const entry of flagged) documents.push(await load(root, entry, { requested: true, interactive }));
  for (const entry of chosenSaved) {
    const document = await load(root, entry, { requested: false, interactive });
    if (document) documents.push(document);
  }
  if (interactive) documents.push(...await addLocalFiles(root, documents));
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

/**
 * Loads one entry. A document named on the command line was asked for, so failing to load it stops
 * the run; a saved default that can't be loaded is reported and left out.
 */
async function load(root: string, entry: string, context: { requested: true; interactive: boolean }): Promise<ReferenceDocument>;
async function load(root: string, entry: string, context: { requested: false; interactive: boolean }): Promise<ReferenceDocument | undefined>;
async function load(root: string, entry: string, context: { requested: boolean; interactive: boolean }): Promise<ReferenceDocument | undefined> {
  try {
    const ref = parseReferenceRef(entry);
    if (ref.kind === "wiki") {
      throw new ConfigurationError(`"${entry}" is an Azure DevOps wiki page, which this version of Atomize can't read yet.`);
    }
    return await loadLocalReference(root, ref.path);
  } catch (error) {
    const message = getErrorMessage(error);
    if (context.requested) throw new ConfigurationError(`Reference Document ${message}`);
    output.warn(sanitizeTty(`Left out a Project Reference Document: ${message}`));
    return undefined;
  }
}

async function addLocalFiles(root: string, already: ReferenceDocument[]): Promise<ReferenceDocument[]> {
  const added: ReferenceDocument[] = [];
  while (true) {
    const next = assertNotCancelled(
      await select({
        message: already.length + added.length > 0 ? "Add another Reference Document?" : "Add a Reference Document describing how your team works? (optional)",
        options: [
          { label: "No, continue", value: "done" },
          { label: "Add a local Markdown or text file…", value: "file" },
        ],
      }),
    ) as string;
    if (next === "done") return added;

    const path = assertNotCancelled(
      await text({
        message: "Path to the file, inside this workspace:",
        placeholder: "docs/how-we-work.md",
        validate: (value): string | undefined => (value?.trim() ? undefined : "Enter a path"),
      }),
    );
    let document: ReferenceDocument;
    try {
      document = await loadLocalReference(root, resolve(root, path.trim()));
    } catch (error) {
      output.warn(sanitizeTty(getErrorMessage(error)));
      continue;
    }
    if ([...already, ...added].some((existing) => existing.ref === document.ref)) continue;
    added.push(document);

    const save = assertNotCancelled(
      await confirm({ message: `Also save ${document.ref} for this project, so it's offered on every AI run?`, initialValue: false }),
    ) as boolean;
    if (save) {
      await saveProjectReference(root, document.ref);
      output.success(`Saved ${document.ref} to .atomize/ai.yaml`);
    }
  }
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
