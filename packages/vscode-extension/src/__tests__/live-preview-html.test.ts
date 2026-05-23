import { describe, expect, it } from 'bun:test';
import type { AtomizationReport } from '../live-preview-html.js';
import { renderLivePreviewError, renderLivePreviewResults } from '../live-preview-html.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

function makeReport(overrides?: {
	success?: boolean;
	error?: string;
	tasksCalculated?: Array<{ title: string; estimation?: number; estimationPercent?: number; tags?: string[] }>;
}): AtomizationReport {
	return {
		storiesFailed: 0,
		results: [{
			story: {
				id: 'AB#4821',
				title: 'As a user, I can reset my password via email link',
				url: 'https://dev.azure.com/org/proj/_workitems/edit/4821',
				estimation: 8,
			},
			tasksCalculated: overrides?.tasksCalculated ?? [{
				title: 'Add password reset endpoint',
				estimation: 2,
				estimationPercent: 25,
				tags: ['backend'],
			}],
			tasksSkipped: [],
			success: overrides?.success ?? true,
			error: overrides?.error,
			estimationSummary: {
				storyEstimation: 8,
				totalTaskEstimation: 2,
				percentageUsed: 25,
			},
		}],
	};
}

// ─── renderLivePreviewResults ─────────────────────────────────────────────────

describe('renderLivePreviewResults', () => {
	it('contains a DRY RUN pill in the header', () => {
		const html = renderLivePreviewResults(makeReport(), 'default', 'templates/auth.atomize.yaml');
		expect(html).toContain('DRY RUN');
	});

	it('shows the story title as the primary heading', () => {
		const html = renderLivePreviewResults(makeReport(), 'default', 'templates/auth.atomize.yaml');
		expect(html).toContain('As a user, I can reset my password via email link');
	});

	it('shows the template filename in monospace', () => {
		const html = renderLivePreviewResults(makeReport(), 'default', 'templates/auth.atomize.yaml');
		expect(html).toContain('vscode-editor-font-family');
		expect(html).toContain('auth.atomize.yaml');
	});

	it('includes Standard / Compact mode toggle', () => {
		const html = renderLivePreviewResults(makeReport(), 'default', 'templates/auth.atomize.yaml');
		expect(html).toContain('Standard');
		expect(html).toContain('Compact');
	});

	it('shows generated task titles', () => {
		const html = renderLivePreviewResults(makeReport(), 'default', 'templates/auth.atomize.yaml');
		expect(html).toContain('Add password reset endpoint');
	});

	it('uses table layout in compact mode', () => {
		const html = renderLivePreviewResults(makeReport(), 'compact', 'templates/auth.atomize.yaml');
		expect(html).toContain('<table');
	});

	it('shows amber skipped state with no Open-template CTA when result failed', () => {
		const html = renderLivePreviewResults(
			makeReport({ success: false, error: 'Story already has child tasks' }),
			'default',
			'templates/auth.atomize.yaml',
		);
		expect(html).toContain('cca700');
		expect(html).not.toContain('Open template');
	});

	it('shows empty state with Open template button when no tasks generated', () => {
		const html = renderLivePreviewResults(
			makeReport({ tasksCalculated: [] }),
			'default',
			'templates/auth.atomize.yaml',
		);
		expect(html).toContain('Open template');
	});
});

// ─── renderLivePreviewError ───────────────────────────────────────────────────

describe('renderLivePreviewError', () => {
	it('shows Manage Profiles button for auth error', () => {
		const html = renderLivePreviewError('auth', '401 Unauthorized', 'templates/auth.atomize.yaml');
		expect(html).toContain('Manage Profiles');
	});

	it('shows Re-run button for not found error', () => {
		const html = renderLivePreviewError('notfound', 'Story #9999 not found', 'templates/auth.atomize.yaml');
		expect(html).toContain('Re-run');
	});

	it('shows plain Live Preview heading for error states without DRY RUN pill', () => {
		const authHtml = renderLivePreviewError('auth', '401', 'templates/auth.atomize.yaml');
		expect(authHtml).toContain('Live Preview');
		expect(authHtml).not.toContain('DRY RUN');

		const notfoundHtml = renderLivePreviewError('notfound', 'not found', 'templates/auth.atomize.yaml');
		expect(notfoundHtml).toContain('Live Preview');
		expect(notfoundHtml).not.toContain('DRY RUN');
	});

	it('shows the template filename in error states', () => {
		const html = renderLivePreviewError('notfound', 'not found', 'templates/auth.atomize.yaml');
		expect(html).toContain('auth.atomize.yaml');
	});

	it('uses red icon bubble for auth and notfound errors', () => {
		const html = renderLivePreviewError('auth', 'error', 'templates/auth.atomize.yaml');
		expect(html).toContain('rgba(241,76,76');
	});
});
