import { deriveImprovedCopy } from '@sppg2001/atomize-core/services/template/template-writeback';
import type { TaskTemplate } from '@sppg2001/atomize-core/templates/schema';
import { parse, stringify } from 'yaml';
import { ATOMIZE_YAML_MODELINE } from './draft-document.js';

/**
 * The untitled Atomize YAML File "Save as New Template" opens: the proposal as it reads in the
 * diff (including the user's edits), named as improved, with `origin` pointing at the source only
 * when it is a Catalog Template (ADR-0010, ADR-0037).
 */
export function improvedCopyContent(proposalText: string, catalogRef: string | undefined): string {
	const copy = deriveImprovedCopy(parse(proposalText) as TaskTemplate, { catalogRef });
	return `${ATOMIZE_YAML_MODELINE}\n${stringify(copy)}`;
}

/** The Catalog ref (`template:<name>`) of the Catalog Template stored at `path`, if any. */
export function catalogRefFor(path: string, items: { kind: string; path: string; ref: string }[]): string | undefined {
	return items.find(item => item.kind === 'template' && item.path === path)?.ref;
}

/** The message shown beside the diff: how to finish the review, Copilot's notes, and anything still wrong. */
export function reviewMessage(notes: string[], problems: string[]): string {
	const parts = ['Review the proposed changes, then choose Accept, Save as New Template, or Reject in the editor title bar.'];
	if (notes.length > 0) parts.push(`Copilot's notes: ${notes.join(' • ')}`);
	if (problems.length > 0) parts.push(`Still to fix: ${problems.join(' • ')}`);
	return parts.join(' ');
}
