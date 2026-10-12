import type { DocumentGrounding } from '@sppg2001/atomize-core/services/template/reference-documents';
import type { AIGrounding } from './ai-grounding.js';

/**
 * The Grounding chosen before the description or focus is written, so the text can refer to it:
 * Story IDs and titles and document titles are the names Copilot sees.
 */
export interface GroundingContext {
	profile?: string;
	stories: { id: string; title: string }[];
	documents: { title: string }[];
}

export function groundingContext(grounding: AIGrounding, documents: DocumentGrounding | null): GroundingContext {
	return {
		...(grounding.profile ? { profile: grounding.profile } : {}),
		stories: grounding.storyGrounding?.stories.map(story => ({ id: story.id, title: story.title })) ?? [],
		documents: documents?.documents.map(document => ({ title: document.title })) ?? [],
	};
}

const count = (amount: number, one: string, many: string) => `${amount} ${amount === 1 ? one : many}`;

/** "Grounded in Contoso Web · 2 Stories · 1 Reference Document", or the ungrounded wording. */
export function groundingSummary(context: GroundingContext, ungrounded: string): string {
	return [
		context.profile ? `Grounded in ${context.profile}` : ungrounded,
		...(context.stories.length > 0 ? [count(context.stories.length, 'Story', 'Stories')] : []),
		...(context.documents.length > 0 ? [count(context.documents.length, 'Reference Document', 'Reference Documents')] : []),
	].join(' · ');
}

/** An example description that refers to what was chosen, so it's clear the description can. */
export function draftDescriptionPlaceholder(context: GroundingContext): string {
	const [story] = context.stories;
	if (story) return `e.g. Like ${story.id}, but add a security review`;
	const [document] = context.documents;
	if (document) return `e.g. Backend API stories, estimated the way "${document.title}" describes`;
	return 'e.g. Backend API stories with design, implementation, and testing tasks';
}

/** An example focus that refers to what was chosen, so it's clear the focus can. */
export function improveFocusPlaceholder(context: GroundingContext): string {
	const [story] = context.stories;
	if (story) return `e.g. ${story.id} needed a security review the Template doesn't have`;
	const [document] = context.documents;
	if (document) return `e.g. match the estimates to "${document.title}"`;
	return 'e.g. tighten the estimates, add security reviews';
}
