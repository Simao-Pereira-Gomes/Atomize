import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const schema = JSON.parse(readFileSync(join(import.meta.dir, '..', '..', 'schemas', 'atomize-ai-config.schema.json'), 'utf8'));
const patterns: RegExp[] = schema.properties.referenceDocuments.items.anyOf.map((option: { pattern: string }) => new RegExp(option.pattern));
const accepted = (entry: string) => patterns.some(pattern => pattern.test(entry));

describe('.atomize/ai.yaml schema', () => {
	it('accepts local Markdown or text files and wiki pages', () => {
		for (const entry of ['file:docs/how-we-work.md', 'file:NOTES.TXT', 'wiki:Team.wiki/Process/How we work']) {
			expect(accepted(entry)).toBe(true);
		}
	});

	it('rejects other file types, bare paths, and wiki references without a page', () => {
		for (const entry of ['file:config.json', 'docs/how-we-work.md', 'wiki:Team.wiki', 'https://example.com/process']) {
			expect(accepted(entry)).toBe(false);
		}
	});

	it('allows only referenceDocuments at the top level', () => {
		expect(schema.additionalProperties).toBe(false);
		expect(Object.keys(schema.properties)).toEqual(['referenceDocuments']);
	});
});
