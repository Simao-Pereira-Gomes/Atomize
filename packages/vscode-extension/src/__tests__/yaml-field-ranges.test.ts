import { expect, test } from 'bun:test';
import { yamlFieldRanges } from '../authoring/yaml-field-ranges.js';

test('links keys in nested task maps with concrete sequence indices', () => {
	const text = 'tasks:\n  - condition:\n      field: tags\n  - title: Example\n';
	const fields = yamlFieldRanges(text);
	expect(fields.map(field => field.path)).toEqual(['tasks', 'tasks[0].condition', 'tasks[0].condition.field', 'tasks[1].title']);
	expect(fields.map(field => text.slice(field.start, field.end))).toEqual(['tasks', 'condition', 'field', 'title']);
});

test('preserves quoted keys and flow-map key ranges', () => {
	const text = 'tasks: [{"title": Example}, {condition: true}]';
	const fields = yamlFieldRanges(text);
	expect(fields.map(field => field.path)).toEqual(['tasks', 'tasks[0].title', 'tasks[1].condition']);
	expect(fields.map(field => text.slice(field.start, field.end))).toEqual(['tasks', '"title"', 'condition']);
});

test('ignores comments, scalar values and block-scalar content', () => {
	const text = '# tasks: comment\ntasks:\n  - description: |\n      condition: literal text\n    title: condition\n';
	expect(yamlFieldRanges(text).map(field => field.path)).toEqual(['tasks', 'tasks[0].description', 'tasks[0].title']);
});

test('retains keys in incomplete documents', () => {
	expect(yamlFieldRanges('tasks:\n  - condition: [').map(field => field.path)).toEqual(['tasks', 'tasks[0].condition']);
	expect(yamlFieldRanges('')).toEqual([]);
	expect(yamlFieldRanges('# comment')).toEqual([]);
});

test('ignores alias values instead of linking an anchored field twice', () => {
	const fields = yamlFieldRanges('tasks:\n  - &task {title: Example}\n  - *task\n');
	expect(fields.map(field => field.path)).toEqual(['tasks', 'tasks[0].title']);
});
