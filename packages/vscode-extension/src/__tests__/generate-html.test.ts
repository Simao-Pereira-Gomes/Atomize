import { describe, expect, it } from 'bun:test';
import type { GenerateReport } from '../generate/generate-html.js';
import { renderGenerateLiveRunning } from '../generate/generate-html.js';

function makeDryReport(overrides?: Partial<GenerateReport>): GenerateReport {
	return {
		templateName: 'default',
		storiesProcessed: 3,
		storiesSuccess: 3,
		storiesFailed: 0,
		tasksCalculated: 6,
		tasksCreated: 0,
		tasksSkipped: 0,
		dryRun: true,
		results: [],
		errors: [],
		warnings: [],
		executionTime: 500,
		...overrides,
	};
}

describe('renderGenerateLiveRunning', () => {
	it('contains live-stories and live-tasks counter elements', () => {
		const html = renderGenerateLiveRunning(makeDryReport(), 'templates/auth.atomize.yaml', 'work-ado');
		expect(html).toContain('id="live-stories"');
		expect(html).toContain('id="live-tasks"');
	});

	it('contains a progress-fill bar element', () => {
		const html = renderGenerateLiveRunning(makeDryReport(), 'templates/auth.atomize.yaml', 'work-ado');
		expect(html).toContain('id="progress-fill"');
	});

	it('contains a liveProgress message handler in the page script', () => {
		const html = renderGenerateLiveRunning(makeDryReport(), 'templates/auth.atomize.yaml', 'work-ado');
		expect(html).toContain('liveProgress');
	});
});
