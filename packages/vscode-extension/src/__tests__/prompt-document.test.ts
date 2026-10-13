import { describe, expect, it } from 'bun:test';
import { draftDescriptionPlaceholder, type GroundingContext, groundingSummary, improveFocusPlaceholder } from '../ai/grounding-context.js';
import { isPromptDocument, promptDocumentContent, promptDocumentDescription } from '../ai/prompt-document.js';

const grounded: GroundingContext = {
	profile: 'Contoso Web',
	documents: [{ title: 'Estimation guide' }],
};
const ungrounded: GroundingContext = { documents: [] };

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

	it('lists the chosen grounding in its header, outside the description', () => {
		const text = promptDocumentContent('Estimate it the way the guide says', grounded);
		expect(text).toContain('Grounded in: Contoso Web');
		expect(text).not.toContain('Example Stories');
		expect(text).toContain('Reference Documents: Estimation guide');
		expect(promptDocumentDescription(text)).toBe('Estimate it the way the guide says');
	});

	it('leaves the header alone when nothing was chosen', () => {
		expect(promptDocumentContent('x', ungrounded)).toBe(promptDocumentContent('x'));
	});

	it('keeps a name containing a comment end inside the header', () => {
		const text = promptDocumentContent('mine', { documents: [{ title: 'A --> B' }] });
		expect(promptDocumentDescription(text)).toBe('mine');
	});
});

describe('grounding context', () => {
	it('summarises what the draft is grounded in', () => {
		expect(groundingSummary(grounded, 'No project grounding')).toBe('Grounded in Contoso Web · 1 Reference Document');
		expect(groundingSummary(ungrounded, 'No project grounding')).toBe('No project grounding');
		expect(groundingSummary({ documents: [{ title: 'a' }, { title: 'b' }] }, 'No grounding')).toBe('No grounding · 2 Reference Documents');
	});

	it('suggests a description that refers to what was chosen', () => {
		expect(draftDescriptionPlaceholder(grounded)).toContain('"Estimation guide"');
		expect(draftDescriptionPlaceholder(ungrounded)).toStartWith('e.g. Backend API stories');
		expect(improveFocusPlaceholder(grounded)).toContain('"Estimation guide"');
		expect(improveFocusPlaceholder(ungrounded)).toBe('e.g. tighten the estimates, add security reviews');
	});
});
