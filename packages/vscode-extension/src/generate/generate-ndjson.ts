import { CLI_EXIT_CODES } from '../cli/cli-provider.js';
import type { GenerateReport } from './generate-html.js';

export type SpawnResult = { report: GenerateReport } | { error: 'auth' | 'cli'; stderr: string };

export interface NdjsonProgressData {
	completedStories: number;
	totalStories: number;
	tasksCreated: number;
}

function isGenerateReport(value: unknown): value is GenerateReport {
	if (typeof value !== 'object' || value === null) return false;
	const obj = value as Record<string, unknown>;
	return typeof obj.templateName === 'string'
		&& typeof obj.storiesProcessed === 'number'
		&& typeof obj.storiesSuccess === 'number'
		&& typeof obj.storiesFailed === 'number'
		&& typeof obj.tasksCalculated === 'number'
		&& typeof obj.tasksCreated === 'number'
		&& Array.isArray(obj.results)
		&& Array.isArray(obj.errors)
		&& Array.isArray(obj.warnings);
}

function reportFromObject(obj: Record<string, unknown>): GenerateReport | null {
	if (obj.event === 'report' && typeof obj.data === 'object' && obj.data !== null) {
		return obj.data as GenerateReport;
	}
	if (isGenerateReport(obj)) return obj;
	return null;
}

function parseJsonObject(line: string): Record<string, unknown> | null {
	const trimmed = line.trim();
	if (!trimmed) return null;
	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return null;
	}
	return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : null;
}

function parseJoinedReport(lines: string[]): GenerateReport | null {
	const text = lines.join('\n').trim();
	if (!text) return null;
	const obj = parseJsonObject(text);
	return obj ? reportFromObject(obj) : null;
}

export function parseNdjsonLines(
	lines: string[],
	onProgress: (data: NdjsonProgressData) => void,
): GenerateReport | null {
	let report: GenerateReport | null = null;
	const unparsedLines: string[] = [];

	for (const line of lines) {
		const obj = parseJsonObject(line);
		if (!obj) {
			if (line.trim()) unparsedLines.push(line);
			continue;
		}
		if (obj.event === 'progress' && typeof obj.data === 'object' && obj.data !== null) {
			onProgress(obj.data as NdjsonProgressData);
		} else {
			const parsedReport = reportFromObject(obj);
			if (parsedReport) {
				report = parsedReport;
			} else {
				unparsedLines.push(line);
			}
		}
	}
	return report ?? parseJoinedReport(unparsedLines);
}

export function recoverReportFromProgress(
	lines: string[],
	dryReport: GenerateReport,
	stderr: string,
): GenerateReport | null {
	const createdByStory = new Map<string, GenerateReport['results'][number]['tasksCreated']>();
	const errorsByStory = new Map<string, string>();

	for (const line of lines) {
		const obj = parseJsonObject(line);
		if (!obj || obj.event !== 'progress' || typeof obj.data !== 'object' || obj.data === null) continue;
		const data = obj.data as Record<string, unknown>;
		const story = typeof data.story === 'object' && data.story !== null ? data.story as Record<string, unknown> : undefined;
		const storyId = typeof story?.id === 'string' ? story.id : undefined;
		if (!storyId) continue;

		if (data.type === 'task_created' && typeof data.task === 'object' && data.task !== null) {
			const task = data.task as Record<string, unknown>;
			const id = typeof task.id === 'string' || typeof task.id === 'number' ? String(task.id) : undefined;
			const title = typeof task.title === 'string' ? task.title : undefined;
			if (!id || !title) continue;
			const url = typeof task.url === 'string' ? task.url : undefined;
			const tasks = createdByStory.get(storyId) ?? [];
			tasks.push({ id, title, url });
			createdByStory.set(storyId, tasks);
		} else if (data.type === 'story_error') {
			errorsByStory.set(storyId, typeof data.error === 'string' ? data.error : 'Unknown task creation error');
		}
	}

	const tasksCreated = Array.from(createdByStory.values()).reduce((sum, tasks) => sum + tasks.length, 0);
	if (tasksCreated === 0 && errorsByStory.size === 0) return null;

	const results = dryReport.results.map(result => {
		const storyId = String(result.story.id);
		const created = createdByStory.get(storyId) ?? [];
		const error = errorsByStory.get(storyId);
		return {
			...result,
			tasksCreated: created,
			success: !error && created.length > 0,
			error,
		};
	});
	const errors = Array.from(errorsByStory.entries()).map(([storyId, error]) => ({ storyId, error }));
	const storiesFailed = results.filter(result => !result.success).length;
	const storiesSuccess = results.length - storiesFailed;
	const cleanStderr = filterNodeWarnings(stderr);
	const warnings = [
		...dryReport.warnings,
		`Recovered execution result from progress events because the CLI did not emit a final report.${cleanStderr ? ` CLI stderr: ${cleanStderr}` : ''}`,
	];

	return {
		...dryReport,
		storiesSuccess,
		storiesFailed,
		tasksCreated,
		dryRun: false,
		results,
		errors,
		warnings,
		executionTime: 0,
	};
}

function filterNodeWarnings(raw: string): string {
	return raw.split('\n').filter(l => !/^\(node:\d+\)/.test(l) && !/^\(Use `node /.test(l)).join('\n').trim();
}

/**
 * Pure resolution logic for the spawnJsonStream close handler, exported for testing.
 *
 * The CLI exits with code 1 when storiesFailed > 0 but still writes a valid
 * report line to stdout. Treating any non-zero exit as fatal hides partial
 * success runs, so parse the stream before returning a CLI error.
 */
export function resolveStreamResult(
	code: number | null,
	lines: string[],
	stderr: string,
): SpawnResult {
	if (code === CLI_EXIT_CODES.AuthFailure) {
		return { error: 'auth', stderr: filterNodeWarnings(stderr) };
	}
	const report = parseNdjsonLines(lines, () => undefined);
	if (report) return { report };
	const clean = filterNodeWarnings(stderr);
	return {
		error: 'cli',
		stderr: clean || (code !== 0 ? 'CLI error during task creation.' : 'No report received from CLI stream.'),
	};
}

export interface StreamResultCoordinator {
	addLine(line: string): void;
	markProcessClosed(code: number | null): void;
	markStdoutClosed(): void;
}

export function createStreamResultCoordinator(
	resolve: (result: SpawnResult) => void,
	readStderr: () => string,
	recoverReport?: (lines: string[], stderr: string) => GenerateReport | null,
): StreamResultCoordinator {
	const lines: string[] = [];
	let processClosed = false;
	let stdoutClosed = false;
	let exitCode: number | null = null;
	let resolved = false;

	const maybeResolve = (): void => {
		if (resolved || !processClosed || !stdoutClosed) return;
		resolved = true;
		const stderr = readStderr();
		const result = resolveStreamResult(exitCode, lines, stderr);
		if ('error' in result && result.error === 'cli' && recoverReport) {
			const recovered = recoverReport(lines, stderr);
			if (recovered) {
				resolve({ report: recovered });
				return;
			}
		}
		resolve(result);
	};

	return {
		addLine(line: string): void {
			lines.push(line);
		},
		markProcessClosed(code: number | null): void {
			processClosed = true;
			exitCode = code;
			maybeResolve();
		},
		markStdoutClosed(): void {
			stdoutClosed = true;
			maybeResolve();
		},
	};
}
