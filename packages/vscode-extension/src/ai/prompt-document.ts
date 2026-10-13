import type { GroundingContext } from './grounding-context.js';

/**
 * A prompt document is an untitled Markdown buffer for describing a Template at length. Its first
 * line marks it, so a CodeLens can offer to draft from it; the rest is the description. When the
 * Grounding was chosen first, the marker comment also lists it, so the description can refer to it.
 */
export const PROMPT_DOCUMENT_MARKER = '<!-- atomize-draft-prompt';

const INSTRUCTION = 'Describe the Template you need below, as fully as you like, then choose "Draft Template with AI" above.';

// A name containing "-->" would end the marker comment early and leak into the description.
const safe = (text: string) => text.replace(/-->/g, '->');

function contextLines(context: GroundingContext): string[] {
	if (!context.profile && context.documents.length === 0) return [];
	return [
		'',
		`Grounded in: ${safe(context.profile ?? 'no Work Project')}`,
		...(context.documents.length > 0
			? [`Reference Documents: ${context.documents.map(document => safe(document.title)).join('; ')}`, 'Refer to them by document name.']
			: []),
	];
}

export function promptDocumentContent(description: string, context?: GroundingContext): string {
	const header = [`${PROMPT_DOCUMENT_MARKER}: ${INSTRUCTION}`, ...(context ? contextLines(context) : [])].join('\n');
	return `${header} -->\n\n${description.trim()}\n`;
}

export function isPromptDocument(text: string): boolean {
	return text.trimStart().startsWith(PROMPT_DOCUMENT_MARKER);
}

/** The description a prompt document holds: everything except its marker comment. */
export function promptDocumentDescription(text: string): string {
	return text.trimStart().replace(/^<!--[\s\S]*?-->/, '').trim();
}
