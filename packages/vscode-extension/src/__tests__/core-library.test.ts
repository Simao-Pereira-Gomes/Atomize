import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';

describe('createTemplateLibrary', () => {
	it('wires the configured Catalog into the source resolver', async () => {
		const source = await readFile(new URL('../core-library.ts', import.meta.url), 'utf8');

		expect(source).toContain('new TemplateSourceResolver(new TemplateLoader(catalog), catalog)');
		expect(source).not.toContain('new TemplateLibrary(\n\t\tundefined');
	});
});
