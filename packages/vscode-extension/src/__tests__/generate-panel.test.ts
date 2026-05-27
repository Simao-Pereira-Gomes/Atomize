import { describe, expect, it } from 'bun:test';
import type { GenerateReport } from '../generate/generate-html.js';
import { parseNdjsonLines } from '../generate/generate-ndjson.js';

function makeReport(overrides?: Partial<GenerateReport>): GenerateReport {
	return {
		templateName: 'default',
		storiesProcessed: 2,
		storiesSuccess: 2,
		storiesFailed: 0,
		tasksCalculated: 4,
		tasksCreated: 4,
		tasksSkipped: 0,
		dryRun: false,
		results: [],
		errors: [],
		warnings: [],
		executionTime: 1000,
		...overrides,
	};
}

describe('parseNdjsonLines', () => {
	it('ignores lines with unrecognised event types', () => {
		const events: unknown[] = [];
		const lines = [
			JSON.stringify({ event: 'start', data: {} }),
			JSON.stringify({ event: 'unknown', data: { storiesCompleted: 1, totalStories: 1, tasksCreated: 1 } }),
			JSON.stringify({ event: 'progress', data: { storiesCompleted: 1, totalStories: 1, tasksCreated: 1 } }),
		];
		parseNdjsonLines(lines, e => events.push(e));
		expect(events).toHaveLength(1);
	});

	it('skips malformed non-JSON lines without throwing', () => {
		const report = makeReport();
		const lines = [
			'not json at all',
			'{broken',
			JSON.stringify({ event: 'report', data: report }),
		];
		expect(parseNdjsonLines(lines, () => undefined)).toEqual(report);
	});

	it('returns null when no report event line is present', () => {
		const lines = [
			JSON.stringify({ event: 'progress', data: { storiesCompleted: 1, totalStories: 2, tasksCreated: 0 } }),
		];
		expect(parseNdjsonLines(lines, () => undefined)).toBeNull();
	});

	it('returns the GenerateReport from the report event line', () => {
		const report = makeReport({ tasksCreated: 7 });
		const lines = [
			JSON.stringify({ event: 'progress', data: { storiesCompleted: 1, totalStories: 2, tasksCreated: 3 } }),
			JSON.stringify({ event: 'report', data: report }),
		];
		const result = parseNdjsonLines(lines, () => undefined);
		expect(result).toEqual(report);
	});

	it('calls onProgress for each progress event line', () => {
		const events: unknown[] = [];
		const lines = [
			JSON.stringify({ event: 'progress', data: { storiesCompleted: 1, totalStories: 3, tasksCreated: 2 } }),
			JSON.stringify({ event: 'progress', data: { storiesCompleted: 2, totalStories: 3, tasksCreated: 5 } }),
		];
		parseNdjsonLines(lines, e => events.push(e));
		expect(events).toEqual([
			{ storiesCompleted: 1, totalStories: 3, tasksCreated: 2 },
			{ storiesCompleted: 2, totalStories: 3, tasksCreated: 5 },
		]);
	});
});
