import type { AITemplateLoopResult } from '@sppg2001/atomize-core/services/template/ai-template-loop';
import { stringify } from 'yaml';

/** First line of every AI draft: the Durable Atomize YAML Opt-In, so schema support starts at once. */
export const ATOMIZE_YAML_MODELINE = '# atomize-yaml';

/**
 * The text of the untitled Atomize YAML File an AI draft opens as. A draft that is still invalid
 * after repairs keeps its content and lists the remaining problems as comments above it.
 */
export function draftDocumentContent(result: AITemplateLoopResult): string {
	if (result.ok) return `${ATOMIZE_YAML_MODELINE}\n${stringify(result.template)}`;

	const problems = [
		'# Copilot\'s draft still has problems Atomize could not fix. Correct them, then delete these comments:',
		...result.errors.map(error => `#  - ${error.replace(/\r?\n/g, ' ')}`),
	].join('\n');
	const body = result.template ? stringify(result.template) : withoutFences(result.rawOutput);
	return `${ATOMIZE_YAML_MODELINE}\n${problems}\n${body.endsWith('\n') ? body : `${body}\n`}`;
}

function withoutFences(output: string): string {
	return output.replace(/^```ya?ml\n?/i, '').replace(/\n?```\s*$/, '').trim();
}
