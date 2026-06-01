import { describe, expect, it } from 'bun:test';
import type { GenerateReport } from '../generate/generate-html.js';
import { createStreamResultCoordinator, parseNdjsonLines, recoverReportFromProgress, resolveStreamResult } from '../generate/generate-ndjson.js';

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

function isReportResult(value: unknown): value is { report: GenerateReport } {
	return typeof value === 'object' && value !== null && 'report' in value;
}

describe('resolveStreamResult', () => {
	const reportLine = (overrides?: Partial<GenerateReport>) =>
		JSON.stringify({ event: 'report', data: makeReport(overrides) });

	it('returns the report when exit code is 0 and report line is present', () => {
		const lines = [
			JSON.stringify({ event: 'progress', data: { completedStories: 1, totalStories: 1, tasksCreated: 2 } }),
			reportLine(),
		];
		const result = resolveStreamResult(0, lines, '');
		expect('report' in result).toBe(true);
	});

	it('returns the report when exit code is 1 (storiesFailed > 0) and report line is present', () => {
		// CLI exits 1 when storiesFailed > 0 but still emits the report.
		const report = makeReport({ storiesFailed: 1, storiesSuccess: 1, tasksCreated: 2 });
		const lines = [reportLine({ storiesFailed: 1, storiesSuccess: 1, tasksCreated: 2 })];
		const result = resolveStreamResult(1, lines, '');
		expect('report' in result).toBe(true);
		if ('report' in result) {
			expect(result.report).toEqual(report);
		}
	});

	it('returns auth error when exit code is 3 regardless of NDJSON content', () => {
		const lines = [reportLine()];
		const result = resolveStreamResult(3, lines, 'Authentication failed');
		expect('error' in result && result.error).toBe('auth');
	});

	it('returns cli error with fallback message when exit code is 1 and no report', () => {
		const result = resolveStreamResult(1, [], '');
		expect('error' in result && result.error).toBe('cli');
		if ('error' in result) {
			expect(result.stderr).toBe('CLI error during task creation.');
		}
	});

	it('returns cli error with fallback message when exit code is 0 and no report', () => {
		const result = resolveStreamResult(0, [], '');
		expect('error' in result && result.error).toBe('cli');
		if ('error' in result) {
			expect(result.stderr).toBe('No report received from CLI stream.');
		}
	});

	it('strips node runtime warnings from stderr', () => {
		const stderr = '(node:12345) ExperimentalWarning: something\n(Use `node --trace-warnings` to show)\nReal error';
		const result = resolveStreamResult(1, [], stderr);
		expect('error' in result && result.stderr).toBe('Real error');
	});
});

describe('createStreamResultCoordinator', () => {
	const reportLine = (overrides?: Partial<GenerateReport>) =>
		JSON.stringify({ event: 'report', data: makeReport(overrides) });

	it('waits for stdout close after process close before resolving', () => {
		const results: unknown[] = [];
		const coordinator = createStreamResultCoordinator(result => results.push(result), () => '');

		coordinator.markProcessClosed(0);
		expect(results).toHaveLength(0);

		coordinator.addLine(reportLine({ tasksCreated: 5 }));
		coordinator.markStdoutClosed();

		expect(results).toHaveLength(1);
		expect(isReportResult(results[0])).toBe(true);
		if (isReportResult(results[0])) {
			expect(results[0].report.tasksCreated).toBe(5);
		}
	});

	it('waits for process close after stdout close before resolving', () => {
		const results: unknown[] = [];
		const coordinator = createStreamResultCoordinator(result => results.push(result), () => '');

		coordinator.addLine(reportLine());
		coordinator.markStdoutClosed();
		expect(results).toHaveLength(0);

		coordinator.markProcessClosed(0);
		expect(results).toHaveLength(1);
	});

	it('uses recovered report when no final report line was received', () => {
		const recovered = makeReport({ dryRun: false, tasksCreated: 1 });
		const results: unknown[] = [];
		const coordinator = createStreamResultCoordinator(
			result => results.push(result),
			() => '',
			() => recovered,
		);

		coordinator.addLine(JSON.stringify({ event: 'progress', data: { type: 'task_created' } }));
		coordinator.markStdoutClosed();
		coordinator.markProcessClosed(1);

		expect(results).toEqual([{ report: recovered }]);
	});
});

describe('parseNdjsonLines', () => {
	it('ignores lines with unrecognised event types', () => {
		const events: unknown[] = [];
		const lines = [
			JSON.stringify({ event: 'start', data: {} }),
			JSON.stringify({ event: 'unknown', data: { completedStories: 1, totalStories: 1, tasksCreated: 1 } }),
			JSON.stringify({ event: 'progress', data: { completedStories: 1, totalStories: 1, tasksCreated: 1 } }),
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
			JSON.stringify({ event: 'progress', data: { completedStories: 1, totalStories: 2, tasksCreated: 0 } }),
		];
		expect(parseNdjsonLines(lines, () => undefined)).toBeNull();
	});

	it('returns the GenerateReport from the report event line', () => {
		const report = makeReport({ tasksCreated: 7 });
		const lines = [
			JSON.stringify({ event: 'progress', data: { completedStories: 1, totalStories: 2, tasksCreated: 3 } }),
			JSON.stringify({ event: 'report', data: report }),
		];
		const result = parseNdjsonLines(lines, () => undefined);
		expect(result).toEqual(report);
	});

	it('returns the GenerateReport from a raw report line for legacy streams', () => {
		const report = makeReport({ tasksCreated: 9 });
		const lines = [
			JSON.stringify({ event: 'progress', data: { completedStories: 1, totalStories: 2, tasksCreated: 3 } }),
			JSON.stringify(report),
		];
		const result = parseNdjsonLines(lines, () => undefined);
		expect(result).toEqual(report);
	});

	it('returns the GenerateReport from a multi-line raw report after progress lines', () => {
		const report = makeReport({ tasksCreated: 11 });
		const lines = [
			JSON.stringify({ event: 'progress', data: { completedStories: 1, totalStories: 2, tasksCreated: 3 } }),
			...JSON.stringify(report, null, 2).split('\n'),
		];
		const result = parseNdjsonLines(lines, () => undefined);
		expect(result).toEqual(report);
	});

	it('returns the GenerateReport from a multi-line report envelope after progress lines', () => {
		const report = makeReport({ tasksCreated: 13 });
		const lines = [
			JSON.stringify({ event: 'progress', data: { completedStories: 1, totalStories: 2, tasksCreated: 3 } }),
			...JSON.stringify({ event: 'report', data: report }, null, 2).split('\n'),
		];
		const result = parseNdjsonLines(lines, () => undefined);
		expect(result).toEqual(report);
	});

	it('calls onProgress for each progress event line', () => {
		const events: unknown[] = [];
		const lines = [
			JSON.stringify({ event: 'progress', data: { completedStories: 1, totalStories: 3, tasksCreated: 2 } }),
			JSON.stringify({ event: 'progress', data: { completedStories: 2, totalStories: 3, tasksCreated: 5 } }),
		];
		parseNdjsonLines(lines, e => events.push(e));
		expect(events).toEqual([
			{ completedStories: 1, totalStories: 3, tasksCreated: 2 },
			{ completedStories: 2, totalStories: 3, tasksCreated: 5 },
		]);
	});
});

describe('recoverReportFromProgress', () => {
	it('builds an execution report from task_created progress when final report is absent', () => {
		const dryReport = makeReport({
			dryRun: true,
			tasksCalculated: 2,
			tasksCreated: 0,
			results: [{
				story: { id: '42', title: 'Story 42' },
				tasksCalculated: [{ title: 'A' }, { title: 'B' }],
				tasksCreated: [],
				success: true,
			}],
		});
		const lines = [
			JSON.stringify({
				event: 'progress',
				data: {
					type: 'task_created',
					story: { id: '42', title: 'Story 42' },
					task: { id: '100', title: 'A', url: 'https://example.test/100' },
				},
			}),
			JSON.stringify({
				event: 'progress',
				data: {
					type: 'task_created',
					story: { id: '42', title: 'Story 42' },
					task: { id: '101', title: 'B' },
				},
			}),
		];

		const recovered = recoverReportFromProgress(lines, dryReport, '');

		expect(recovered?.dryRun).toBe(false);
		expect(recovered?.tasksCreated).toBe(2);
		expect(recovered?.storiesSuccess).toBe(1);
		expect(recovered?.storiesFailed).toBe(0);
		expect(recovered?.results[0]?.tasksCreated).toEqual([
			{ id: '100', title: 'A', url: 'https://example.test/100' },
			{ id: '101', title: 'B' },
		]);
		expect(recovered?.warnings[0]).toContain('Recovered execution result');
	});

	it('returns null when there are no creation or error progress events', () => {
		const recovered = recoverReportFromProgress([], makeReport(), '');
		expect(recovered).toBeNull();
	});
});
