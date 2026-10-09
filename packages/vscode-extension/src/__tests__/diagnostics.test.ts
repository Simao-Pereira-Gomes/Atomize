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

	it('resolves a task field to the line inside the indexed task, not an earlier task', async () => {
		mock.module('vscode', () => baseVscodeMock());

		const { resolvePathToRange } = await import(`../validation/diagnostics.js?t=${Date.now()}-5`);

		const text = [
			'name: Repeat',
			'tasks:',
			'  - id: design',
			'    title: Design',
			'  - id: review',
			'    title: Review',
			'    repeat: 25',
			'    dependsOn: [design]',
			'  - id: merge',
			'    title: Merge',
			'    repeat: 30',
			'    dependsOn: [review]',
		].join('\n');
		const doc = {
			getText: () => text,
			lineAt: (line: number) => ({ text: text.split('\n')[line] ?? '' }),
		};

		expect(resolvePathToRange('tasks.1.repeat', doc as never).start.line).toBe(6);
		expect(resolvePathToRange('tasks.2.repeat', doc as never).start.line).toBe(10);
		expect(resolvePathToRange('tasks.2.dependsOn', doc as never).start.line).toBe(11);
		expect(resolvePathToRange('tasks[1].dependsOn', doc as never).start.line).toBe(7);
	});

	it('falls back to the indexed task line when the task lacks the field', async () => {
		mock.module('vscode', () => baseVscodeMock());

		const { resolvePathToRange } = await import(`../validation/diagnostics.js?t=${Date.now()}-6`);

		const text = ['tasks:', '  - title: A', '    repeat: 2', '  - title: B', 'validation:', '  repeat: 3'].join('\n');
		const doc = {
			getText: () => text,
			lineAt: (line: number) => ({ text: text.split('\n')[line] ?? '' }),
		};

		expect(resolvePathToRange('tasks.1.repeat', doc as never).start.line).toBe(3);
	});
});

describe('makeDiagnostic', () => {
	const text = ['estimation:', '  minimumTaskPoints: 0.5'].join('\n');
	const doc = {
		getText: () => text,
		lineAt: (line: number) => ({ text: text.split('\n')[line] ?? '' }),
	};

	it('marks minimumTaskPoints diagnostics as deprecated', async () => {
		mock.module('vscode', () => baseVscodeMock());
		const { makeDiagnostic } = await import(`../validation/diagnostics.js?t=${Date.now()}-3`);

		for (const code of ['DEPRECATED_MINIMUM_TASK_POINTS', 'DUPLICATE_MINIMUM_TASK_ESTIMATE']) {
			const d = makeDiagnostic('estimation.minimumTaskPoints', 'msg', 1, doc as never, code);
			expect(d.tags).toEqual([2]);
			expect(d.range.start.line).toBe(1);
		}
	});

	it('does not tag other warnings', async () => {
		mock.module('vscode', () => baseVscodeMock());
		const { makeDiagnostic } = await import(`../validation/diagnostics.js?t=${Date.now()}-4`);

		const d = makeDiagnostic('filter.savedQuery', 'msg', 1, doc as never, 'SAVED_QUERY_WITH_STRUCTURED_FILTER');
		expect(d.tags).toBeUndefined();
	});
});
