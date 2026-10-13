import { describe, expect, test } from 'bun:test';
import { buildSchemaTrees, normalizeDocumentPath } from '@sppg2001/atomize-schema-reference';
import schema from '@sppg2001/atomize-schema-reference/schema.json';
import { yamlCursorPath } from '../authoring/yaml-cursor-path.js';

function pathAtCursor(marked: string): string | undefined {
	const offset = marked.indexOf('¦');
	if (offset < 0) throw new Error('Missing cursor marker');
	return yamlCursorPath(marked.replace('¦', ''), offset);
}

describe('YAML Cursor Path', () => {
	test.each([
		['na¦me: Example\n', 'name'],
		['name: Ex¦ample\n', 'name'],
		['name: Exampl¦e', 'name'],
		['name: Example¦', 'name'],
		['name: Example¦\n', 'name'],
		['name¦: Example\n', 'name'],
		['"na¦me": "Example"\n', 'name'],
		['filter:\n  savedQuery:\n    path: Shared ¦Queries/Team\n', 'filter.savedQuery.path'],
		['tasks:\n  - title: First\n  - co¦ndition: true\n', 'tasks[1].condition'],
		['tasks:\n  - condition:\n      field: ¦tags\n', 'tasks[0].condition.field'],
		['filter:\n  workItemTypes: [Story, ¦Bug]\n', 'filter.workItemTypes[1]'],
		['filter:\n  workItemTypes:\n    - Story\n    - ¦Bug\n', 'filter.workItemTypes[1]'],
		['tasks: [{title: First}, {title: ¦Second}]\n', 'tasks[1].title'],
		['tasks:\n  - title: "an ¦# inside a string"\n', 'tasks[0].title'],
		['tasks:\n  - description: |\n      a ¦# literal\n', 'tasks[0].description'],
		['name: &name Example\ntasks:\n  - title: *na¦me\n', 'tasks[0].title'],
		['tasks:\r\n  - title: 😀 ¦Example\r\n', 'tasks[0].title'],
		['tasks:\n  - condit¦ion:', 'tasks[0].condition'],
		['tasks:\n  - condition:¦', 'tasks[0].condition'],
		['tasks:\n  - condition: [tr¦ue,', 'tasks[0].condition[0]'],
		['name: "unfin¦ished', 'name'],
		['name: Ex¦ample\nbroken: [\n', 'name'],
		['¦', undefined],
		['# ¦comment\nname: Example\n', undefined],
		['name: Example # ¦comment\n', undefined],
		['tasks:\n  # ¦comment\n  - title: Example\n', undefined],
		['tasks: [\n  # ¦comment\n  {title: Example}\n]\n', undefined],
		['tasks:\n  ¦\n  - title: Example\n', undefined],
		['name: Example\n¦\n', undefined],
		['tasks:\n  - description: |\n      Example\n¦', undefined],
		['tasks:\n¦  - title: Example\n', undefined],
		['¦just a scalar', undefined],
	])('resolves %j to %j', (marked, expected) => {
		expect(pathAtCursor(marked)).toBe(expected);
	});

	test('rejects invalid cursor offsets', () => {
		for (const offset of [-1, 100, 0.5, Number.NaN]) {
			expect(yamlCursorPath('name: Example', offset)).toBeUndefined();
		}
	});

	test('normalises a task condition to the selected file kind', () => {
		const path = pathAtCursor('tasks:\n  - condition:\n      fi¦eld: tags\n');
		expect(path).toBe('tasks[0].condition.field');
		if (!path) throw new Error('Expected a field path');
		const trees = buildSchemaTrees(schema);
		expect(normalizeDocumentPath(trees, path, 'template')).toBe('template.tasks[].condition.field');
		expect(normalizeDocumentPath(trees, path, 'mixin')).toBe('mixin.tasks[].condition.field');
		const condition = pathAtCursor('tasks:\n  - co¦ndition: true\n');
		expect(normalizeDocumentPath(trees, condition ?? '', 'template')).toBe('template.tasks[].condition');
	});
});
