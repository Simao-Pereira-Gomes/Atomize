import { describe, expect, it, mock } from 'bun:test';
import { baseVscodeMock } from './vscode-test-helpers.js';

describe('resolvePathToRange', () => {
	it('ignores comments and values that mention the target path before the real key', async () => {
		mock.module('vscode', () => baseVscodeMock());

		// We must re-import the module in EVERY test case where we want a fresh mock
		const { resolvePathToRange } = await import(`../validation/diagnostics.js?t=${Date.now()}-1`);

		const text = [
			'# filter.savedQuery: this comment should not receive the diagnostic',
			'description: "filter.savedQuery: this string should not receive the diagnostic"',
			'notes:',
			'  - "savedQuery: this list value should not receive the diagnostic"',
			'filter:',
			'  savedQuery:',
			'    path: "Shared Queries/Current Sprint"',
		].join('\n');
		const doc = {
			getText: () => text,
			lineAt: (line: number) => ({ text: text.split('\n')[line] ?? '' }),
		};

		const range = resolvePathToRange('filter.savedQuery', doc as never);

		expect(range.start.line).toBe(5);
		expect(range.start.character).toBe(2);
		expect(range.end.line).toBe(5);
	});

	it('resolves ["quoted.key"] notation to the field key line, not the parent', async () => {
		mock.module('vscode', () => baseVscodeMock());

		const { resolvePathToRange } = await import(`../validation/diagnostics.js?t=${Date.now()}-2`);

		const text = [
			'tasks:',
			'  - title: My Task',
			'    customFields:',
			'      System.Title: |',
			'        Line one',
		].join('\n');
		const doc = {
			getText: () => text,
			lineAt: (line: number) => ({ text: text.split('\n')[line] ?? '' }),
		};

		const range = resolvePathToRange('tasks[0].customFields["System.Title"]', doc as never);

		expect(range.start.line).toBe(3);
	});
});
