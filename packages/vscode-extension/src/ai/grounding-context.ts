import type { DocumentGrounding } from '@sppg2001/atomize-core/services/template/reference-documents';
import type { AIGrounding } from './ai-grounding.js';

/**
 * The Grounding chosen before the description or focus is written, so the text can refer to it:
 * document titles are the names Copilot sees.
 */
export interface GroundingContext {
	profile?: string;
	documents: { title: string }[];
}

export function groundingContext(grounding: AIGrounding, documents: DocumentGrounding | null): GroundingContext {
	return {
		...(grounding.profile ? { profile: grounding.profile } : {}),
		documents: documents?.documents.map(document => ({ title: document.title })) ?? [],
	};
}

const count = (amount: number, one: string, many: string) => `${amount} ${amount === 1 ? one : many}`;

/** "Grounded in Contoso Web · 1 Reference Document", or the ungrounded wording. */
export function groundingSummary(context: GroundingContext, ungrounded: string): string {
	return [
		context.profile ? `Grounded in ${context.profile}` : ungrounded,
		...(context.documents.length > 0 ? [count(context.documents.length, 'Reference Document', 'Reference Documents')] : []),
	].join(' · ');
}

/** An example description that refers to what was chosen, so it's clear the description can. */
export function draftDescriptionPlaceholder(context: GroundingContext): string {
	const [document] = context.documents;
	if (document) return `e.g. Backend API stories, estimated the way "${document.title}" describes`;
	return 'e.g. Backend API stories with design, implementation, and testing tasks';
}

/** An example focus that refers to what was chosen, so it's clear the focus can. */
export function improveFocusPlaceholder(context: GroundingContext): string {
	const [document] = context.documents;
	if (document) return `e.g. match the estimates to "${document.title}"`;
	return 'e.g. tighten the estimates, add security reviews';
}
