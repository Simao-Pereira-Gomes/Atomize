import type { ValidationResult } from './diagnostics.js';

export function parseValidationOutput(stdout: string): ValidationResult | undefined {
	const text = stdout.trim();
	const firstBrace = text.indexOf('{');
	if (firstBrace < 0) return undefined;

	try {
		return JSON.parse(text.slice(firstBrace)) as ValidationResult;
	} catch {
		return undefined;
	}
}
