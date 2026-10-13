import { describe, expect, it } from 'bun:test';
import { parse } from 'yaml';
import { draftDocumentContent } from '../ai/draft-document.js';

const template = {
	version: '1.0',
	name: 'Backend API',
	filter: { workItemTypes: ['User Story'] },
	tasks: [{ title: 'Build', estimationPercent: 100 }],
};

describe('draftDocumentContent', () => {
	it('opens a valid draft as an Atomize YAML File with the modeline first', () => {
		const content = draftDocumentContent({ ok: true, template: template as never, attempts: 1 });
		expect(content.split('\n')[0]).toBe('# atomize-yaml');
		expect(parse(content)).toEqual(template);
	});

	it('lists the remaining problems as comments above a Template-shaped draft that is still invalid', () => {
		const invalid = { ...template, tasks: [{ title: '', estimationPercent: 120 }] };
		const content = draftDocumentContent({
			ok: false, attempts: 3, rawOutput: 'ignored', errors: ['tasks.0.title: Required', 'estimation: must sum to 100'], template: invalid,
		});
		const lines = content.split('\n');
		expect(lines[0]).toBe('# atomize-yaml');
		expect(lines).toContain('#  - tasks.0.title: Required');
		expect(lines).toContain('#  - estimation: must sum to 100');
		expect(parse(content)).toEqual(invalid);
	});

	it('keeps the raw output, without markdown fences, when the draft is not even Template-shaped', () => {
		const content = draftDocumentContent({ ok: false, attempts: 3, rawOutput: '```yaml\nname: half\n```', errors: ['version: Required'] });
		expect(content).toContain('#  - version: Required');
		expect(content).toEndWith('name: half\n');
		expect(content).not.toContain('```');
	});
});
