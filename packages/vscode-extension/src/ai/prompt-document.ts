/**
 * A prompt document is an untitled Markdown buffer for describing a Template at length. Its first
 * line marks it, so a CodeLens can offer to draft from it; the rest is the description.
 */
export const PROMPT_DOCUMENT_MARKER = '<!-- atomize-draft-prompt';

const HEADER = `${PROMPT_DOCUMENT_MARKER}: Describe the Template you need below, as fully as you like, then choose "Draft Template with AI" above. -->`;

export function promptDocumentContent(description: string): string {
	return `${HEADER}\n\n${description.trim()}\n`;
}

export function isPromptDocument(text: string): boolean {
	return text.trimStart().startsWith(PROMPT_DOCUMENT_MARKER);
}

/** The description a prompt document holds: everything except its marker comment. */
export function promptDocumentDescription(text: string): string {
	return text.trimStart().replace(/^<!--[\s\S]*?-->/, '').trim();
}
