import { describe, expect, it } from 'bun:test';
import { draftDescriptionPlaceholder, type GroundingContext, groundingSummary, improveFocusPlaceholder } from '../ai/grounding-context.js';
import { isPromptDocument, promptDocumentContent, promptDocumentDescription } from '../ai/prompt-document.js';

const grounded: GroundingContext = {
	profile: 'Contoso Web',
	stories: [{ id: '4101', title: 'Checkout shows tax breakdown' }, { id: '4102', title: 'Export orders as CSV' }],
	documents: [{ title: 'Estimation guide' }],
};
const ungrounded: GroundingContext = { stories: [], documents: [] };

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
		const text = promptDocumentContent('Like 4101, but with a security review', grounded);
		expect(text).toContain('Grounded in: Contoso Web');
		expect(text).toContain('Example Stories: 4101 Checkout shows tax breakdown; 4102 Export orders as CSV');
		expect(text).toContain('Reference Documents: Estimation guide');
		expect(promptDocumentDescription(text)).toBe('Like 4101, but with a security review');
	});

	it('leaves the header alone when nothing was chosen', () => {
		expect(promptDocumentContent('x', ungrounded)).toBe(promptDocumentContent('x'));
	});

	it('keeps a name containing a comment end inside the header', () => {
		const text = promptDocumentContent('mine', { stories: [{ id: '1', title: 'A --> B' }], documents: [] });
		expect(promptDocumentDescription(text)).toBe('mine');
	});
});

describe('grounding context', () => {
	it('summarises what the draft is grounded in', () => {
		expect(groundingSummary(grounded, 'No project grounding')).toBe('Grounded in Contoso Web · 2 Stories · 1 Reference Document');
		expect(groundingSummary(ungrounded, 'No project grounding')).toBe('No project grounding');
		expect(groundingSummary({ stories: [], documents: [{ title: 'a' }, { title: 'b' }] }, 'No grounding')).toBe('No grounding · 2 Reference Documents');
	});

	it('suggests a description that refers to what was chosen', () => {
		expect(draftDescriptionPlaceholder(grounded)).toBe('e.g. Like 4101, but add a security review');
		expect(draftDescriptionPlaceholder({ stories: [], documents: [{ title: 'Estimation guide' }] })).toContain('"Estimation guide"');
		expect(draftDescriptionPlaceholder(ungrounded)).toStartWith('e.g. Backend API stories');
		expect(improveFocusPlaceholder(grounded)).toContain('4101');
		expect(improveFocusPlaceholder({ stories: [], documents: [{ title: 'Estimation guide' }] })).toContain('"Estimation guide"');
		expect(improveFocusPlaceholder(ungrounded)).toBe('e.g. tighten the estimates, add security reviews');
	});
});
