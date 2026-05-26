import { describe, expect, it, mock } from 'bun:test';
import { parseValidationOutput } from '../validation-output.js';

describe('parseValidationOutput', () => {
	it('parses JSON validation output prefixed by spinner control bytes', () => {
		const result = parseValidationOutput(
			'\u001b[?25l\u001b[90m│\u001b[39m\n\u001b[32m◇\u001b[39m  Project reference validation failed\n\u001b[?25h{"valid":true,"errors":[],"warnings":[{"path":"template","message":"Could not validate project references against ADO"}],"mode":"lenient"}',
		);

		expect(result?.valid).toBe(true);
		expect(result?.warnings[0]?.path).toBe('template');
	});

	it('returns undefined when no JSON object is present', () => {
		expect(parseValidationOutput('Project reference validation failed')).toBeUndefined();
	});
});

describe('resolvePathToRange', () => {
	it('ignores comments and values that mention the target path before the real key', async () => {
		mock.module('vscode', () => ({
			Range: class Range {
				start: { line: number; character: number };
				end: { line: number; character: number };

				constructor(
					startLine: number,
					startCharacter: number,
					endLine: number,
					endCharacter: number,
				) {
					this.start = { line: startLine, character: startCharacter };
					this.end = { line: endLine, character: endCharacter };
				}
			},
		}));

		const { resolvePathToRange } = await import('../diagnostics.js');
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
		mock.module('vscode', () => ({
			Range: class Range {
				start: { line: number; character: number };
				end: { line: number; character: number };
				constructor(sl: number, sc: number, el: number, ec: number) {
					this.start = { line: sl, character: sc };
					this.end = { line: el, character: ec };
				}
			},
		}));

		const { resolvePathToRange } = await import('../diagnostics.js');
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
