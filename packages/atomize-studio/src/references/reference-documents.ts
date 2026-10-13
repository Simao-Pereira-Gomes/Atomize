/** The Project Reference Documents found around a folder or file (ADR-0070). */
export type ReferenceList = { workspaceRoot: string; entries: string[]; problems: string[] };

/** Loaded Reference Documents, fitted to the limit, as Document Grounding. */
export type DocumentGrounding = { documents: { ref: string; title: string; text: string; truncated: boolean; originalLength: number }[] };

export type LoadedReferences = {
  grounding: DocumentGrounding | null;
  /** Documents shortened to fit, shown before sending. */
  notices: string[];
  /** Entries that couldn't be used, never dropped silently. */
  skipped: { entry: string; message: string }[];
};

const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []);
const record = (value: unknown): Record<string, unknown> => (typeof value === "object" && value !== null ? value as Record<string, unknown> : {});

export function parseReferenceList(value: unknown): ReferenceList {
  const response = record(value);
  if (typeof response.workspaceRoot !== "string") throw new Error("The project folder could not be read.");
  return { workspaceRoot: response.workspaceRoot, entries: strings(response.entries), problems: strings(response.problems) };
}

export function parseLoadedReferences(value: unknown): LoadedReferences {
  const response = record(value);
  const grounding = record(response.grounding);
  const documents = Array.isArray(grounding.documents) ? grounding.documents as DocumentGrounding["documents"] : [];
  return {
    grounding: documents.length > 0 ? { documents } : null,
    notices: strings(response.notices),
    skipped: Array.isArray(response.skipped)
      ? response.skipped.flatMap((item) => {
        const skipped = record(item);
        return typeof skipped.entry === "string" ? [{ entry: skipped.entry, message: typeof skipped.message === "string" ? skipped.message : "" }] : [];
      })
      : [],
  };
}

/** A local file's entry, relative to the Workspace Root; undefined when the file is outside it. */
export function localEntry(workspaceRoot: string, filePath: string): string | undefined {
  const root = workspaceRoot.replace(/[\\/]+$/, "");
  const normalised = filePath.replace(/\\/g, "/");
  const prefix = `${root.replace(/\\/g, "/")}/`;
  return normalised.startsWith(prefix) ? `file:${normalised.slice(prefix.length)}` : undefined;
}

export function wikiEntry(wiki: string, pagePath: string): string {
  return `wiki:${wiki}${pagePath.startsWith("/") ? pagePath : `/${pagePath}`}`;
}

/** Shortens a Workspace Root for display: just its last folder. */
export function folderName(path: string): string {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || path;
}
