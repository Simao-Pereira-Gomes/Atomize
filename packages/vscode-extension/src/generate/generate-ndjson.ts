import type { GenerateReport } from './generate-html.js';

export interface NdjsonProgressData {
	storiesCompleted: number;
	totalStories: number;
	tasksCreated: number;
}

export function parseNdjsonLines(
	lines: string[],
	onProgress: (data: NdjsonProgressData) => void,
): GenerateReport | null {
	let report: GenerateReport | null = null;
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			continue;
		}
		if (typeof parsed !== 'object' || parsed === null) continue;
		const obj = parsed as Record<string, unknown>;
		if (obj.event === 'progress' && typeof obj.data === 'object' && obj.data !== null) {
			onProgress(obj.data as NdjsonProgressData);
		} else if (obj.event === 'report' && typeof obj.data === 'object' && obj.data !== null) {
			report = obj.data as GenerateReport;
		}
	}
	return report;
}
