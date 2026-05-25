import { describe, expect, it } from 'bun:test';
import {
	fixMissingTaskId,
	fixSavedQueryWithStructuredFilter,
	type PlainRange,
} from '../validation-code-actions.js';

function range(line: number, character = 0): PlainRange {
	return { start: { line, character }, end: { line, character } };
}

// ─── fixMissingTaskId ─────────────────────────────────────────────────────────

describe('fixMissingTaskId', () => {
	it('inserts id before the first key of the matching task', () => {
		const doc = [
			'version: "1.0"',  // line 0
			'filter:',          // line 1
			'  workItemTypes:', // line 2
			'    - Story',      // line 3
			'tasks:',           // line 4
			'  - title: Write unit tests', // line 5  ← task 0 list item
			'    dependsOn:',   // line 6
			'      - other-task', // line 7
		].join('\n');

		// diagnostic range points to the `  - ` line (line 5)
		const edits = fixMissingTaskId(doc, range(5, 2), undefined);

		expect(edits).toHaveLength(1);
		const edit = edits?.at(0);
		// `title:` is at line 5, character 4 (after `  - `)
		expect(edit?.startLine).toBe(5);
		expect(edit?.startCharacter).toBe(4);
		expect(edit?.endLine).toBe(5);
		expect(edit?.endCharacter).toBe(4);
		expect(edit?.newText).toBe('id: write-unit-tests\n    ');
	});

	it('targets the correct task when the second task needs the fix', () => {
		const doc = [
			'tasks:',                  // line 0
			'  - title: First task',   // line 1  ← task 0
			'    id: first-task',      // line 2
			'  - title: Second task with a very long title indeed', // line 3 ← task 1
			'    dependsOn:',          // line 4
			'      - first-task',      // line 5
		].join('\n');

		// diagnostic range points to the task-1 list item (line 3)
		const edits = fixMissingTaskId(doc, range(3, 2), undefined);

		expect(edits).toHaveLength(1);
		expect(edits?.at(0)?.newText).toMatch(/^id: second-task-with-a-very-lo/);
	});

	it('truncates slug to 30 characters', () => {
		const doc = [
			'tasks:',             // line 0
			'  - title: This is a very long task title that exceeds thirty characters', // line 1
			'    dependsOn:',     // line 2
			'      - other-task', // line 3
		].join('\n');

		const edits = fixMissingTaskId(doc, range(1, 2), undefined);

		const edit = edits?.at(0);
		expect(edit?.newText.startsWith('id: ')).toBe(true);
		const slug = (edit?.newText.split('\n').at(0) ?? '').replace('id: ', '');
		expect(slug.length).toBeLessThanOrEqual(30);
	});

	it('returns null when no task starts on the diagnostic line', () => {
		const doc = [
			'tasks:',           // line 0
			'  - title: My Task', // line 1
		].join('\n');

		// Line 0 is `tasks:`, not a task item
		expect(fixMissingTaskId(doc, range(0), undefined)).toBeNull();
		// Line 99 is beyond the document
		expect(fixMissingTaskId(doc, range(99), undefined)).toBeNull();
	});

	it('returns null when the task already has an id', () => {
		const doc = [
			'tasks:',             // line 0
			'  - id: existing-id', // line 1  ← task 0
			'    title: My Task', // line 2
			'    dependsOn:',     // line 3
			'      - other-task', // line 4
		].join('\n');

		expect(fixMissingTaskId(doc, range(1, 2), undefined)).toBeNull();
	});

	it('returns null when the task has no title field', () => {
		const doc = [
			'tasks:',           // line 0
			'  - dependsOn:',   // line 1  ← task 0
			'      - other-task',
		].join('\n');

		expect(fixMissingTaskId(doc, range(1, 2), undefined)).toBeNull();
	});
});

// ─── fixSavedQueryWithStructuredFilter ────────────────────────────────────────

describe('fixSavedQueryWithStructuredFilter', () => {
	const DUMMY = range(0);

	it('returns deletions for block-style conflicting fields', () => {
		const doc = [
			'version: "1.0"',      // line 0
			'filter:',              // line 1
			'  savedQuery:',        // line 2
			'    id: "Sprint 42"',  // line 3
			'  workItemTypes:',     // line 4
			'    - Story',          // line 5
			'  states:',            // line 6
			'    - Active',         // line 7
			'tasks:',               // line 8
			'  - title: My Task',   // line 9
		].join('\n');

		const edits = fixSavedQueryWithStructuredFilter(doc, DUMMY, undefined);

		expect(edits).toHaveLength(2);
		// workItemTypes (line 4) + value (line 5) → deleted up to line 6
		expect(edits?.at(0)).toEqual({ startLine: 4, startCharacter: 0, endLine: 6, endCharacter: 0, newText: '' });
		// states (line 6) + value (line 7) → deleted up to line 8
		expect(edits?.at(1)).toEqual({ startLine: 6, startCharacter: 0, endLine: 8, endCharacter: 0, newText: '' });
	});

	it('returns deletions for inline (flow) list values', () => {
		const doc = [
			'filter:',                      // line 0
			'  savedQuery:',                // line 1
			'    id: "Sprint 42"',          // line 2
			'  workItemTypes: [Story, Bug]', // line 3
			'  states: [Active]',           // line 4
			'tasks:',                       // line 5
			'  - title: My Task',           // line 6
		].join('\n');

		const edits = fixSavedQueryWithStructuredFilter(doc, DUMMY, undefined);

		expect(edits).toHaveLength(2);
		// workItemTypes at line 3, block ends at line 4 (states starts there, same indent)
		expect(edits?.at(0)).toEqual({ startLine: 3, startCharacter: 0, endLine: 4, endCharacter: 0, newText: '' });
		// states at line 4, block ends at line 5 (tasks starts there, lower indent)
		expect(edits?.at(1)).toEqual({ startLine: 4, startCharacter: 0, endLine: 5, endCharacter: 0, newText: '' });
	});

	it('returns null when no conflicting fields are present', () => {
		const doc = [
			'filter:',
			'  savedQuery:',
			'    id: "Sprint 42"',
			'tasks:',
			'  - title: My Task',
		].join('\n');

		expect(fixSavedQueryWithStructuredFilter(doc, DUMMY, undefined)).toBeNull();
	});

	it('returns null when document has no filter block', () => {
		const doc = [
			'tasks:',
			'  - title: My Task',
		].join('\n');

		expect(fixSavedQueryWithStructuredFilter(doc, DUMMY, undefined)).toBeNull();
	});

	it('removes all recognized conflicting fields', () => {
		const doc = [
			'filter:',             // line 0
			'  savedQuery:',       // line 1
			'    id: "Sprint 42"', // line 2
			'  workItemTypes:',    // line 3
			'    - Story',         // line 4
			'  states:',           // line 5
			'    - Active',        // line 6
			'  statesExclude:',    // line 7
			'    - Closed',        // line 8
			'  tags:',             // line 9
			'    include:',        // line 10
			'      - backend',     // line 11
			'  priority: 2',       // line 12
			'tasks:',              // line 13
			'  - title: My Task',  // line 14
		].join('\n');

		const edits = fixSavedQueryWithStructuredFilter(doc, DUMMY, undefined);

		// workItemTypes, states, statesExclude, tags, priority all removed
		expect(edits).toHaveLength(5);
		expect(edits?.every(e => e.newText === '')).toBe(true);
	});
});
