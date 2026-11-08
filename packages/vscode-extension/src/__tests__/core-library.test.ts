import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';

describe('createTemplateLibrary', () => {
	it('builds the Template Library from the bundled package root', async () => {
		const source = await readFile(new URL('../core-library.ts', import.meta.url), 'utf8');

		expect(source).toContain('new TemplateLibrary({ packageRoot: __dirname, invocationCwd })');
	});
});
