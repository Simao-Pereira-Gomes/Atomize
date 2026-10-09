import { describe, expect, it } from 'bun:test';
import { isPromptDocument, promptDocumentContent, promptDocumentDescription } from '../ai/prompt-document.js';

describe('prompt document', () => {
	it('starts with a marker comment and carries the description below it', () => {
		const text = promptDocumentContent('  Backend API stories\n\nwith reviews  ');
		expect(isPromptDocument(text)).toBe(true);
		expect(text.split('\n')[0]).toStartWith('<!-- atomize-draft-prompt');
		expect(promptDocumentDescription(text)).toBe('Backend API stories\n\nwith reviews');
	});

	it('reads back whatever the user wrote, however long', () => {
		const body = Array.from({ length: 40 }, (_, i) => `Paragraph ${i} about the team's process.`).join('\n\n');
		expect(promptDocumentDescription(promptDocumentContent(body))).toBe(body);
	});

	it('is empty until the user writes something', () => {
		expect(promptDocumentDescription(promptDocumentContent(''))).toBe('');
	});

	it('does not mistake other Markdown for a prompt document', () => {
		expect(isPromptDocument('# Notes\n<!-- atomize-draft-prompt -->')).toBe(false);
	});
});
