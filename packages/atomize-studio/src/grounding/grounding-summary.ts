import type { DocumentGrounding } from "../references/reference-documents";

/**
 * One-line summaries of the Grounding chosen for an AI draft or improvement, so what Copilot will
 * receive is visible before sending without opening each choice.
 */

const count = (amount: number, one: string, many: string) => `${amount} ${amount === 1 ? one : many}`;

/** The documents that will be shortened to fit one AI request. */
export function shortenedDocuments(grounding: DocumentGrounding | null): DocumentGrounding["documents"] {
  return grounding?.documents.filter((document) => document.truncated) ?? [];
}

/** "None", "Checking…", or the count with how many will be shortened: "2 documents · 1 shortened". */
export function documentsSummary(grounding: DocumentGrounding | null, loading: boolean): string {
  if (loading) return "Checking…";
  const documents = grounding?.documents.length ?? 0;
  if (documents === 0) return "None";
  const shortened = shortenedDocuments(grounding).length;
  return `${count(documents, "document", "documents")}${shortened > 0 ? ` · ${shortened} shortened` : ""}`;
}

/** A Reference Document entry without its `file:` or `wiki:` prefix, for display. */
export function documentLabel(ref: string): string {
  return ref.replace(/^(file|wiki):/, "");
}

/** An example AI draft brief that refers to what was chosen, so it's clear the brief can. */
export function draftBriefPlaceholder(grounding: DocumentGrounding | null): string {
  const [document] = grounding?.documents ?? [];
  if (document) return `For example: a backend API feature, estimated the way "${document.title}" describes.`;
  return "For example: a backend API feature with design, implementation, tests, documentation, and review.";
}

/** An example Improve with AI focus that refers to what was chosen, so it's clear the focus can. */
export function improveFocusPlaceholder(grounding: DocumentGrounding | null): string {
  const [document] = grounding?.documents ?? [];
  if (document) return `For example: match the estimates to "${document.title}". Leave empty for a general review.`;
  return "For example: tighten the estimates, add security reviews. Leave empty for a general review.";
}
