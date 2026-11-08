import { describe, expect, it } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionRoot = fileURLToPath(new URL('../..', import.meta.url));
const sourceRoots = [join(extensionRoot, 'src'), join(extensionRoot, '../atomize-core/src')];

async function sourceFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	const nested = await Promise.all(
		entries.map((entry) => {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path);
			return /\.tsx?$/.test(entry.name) ? [path] : [];
		}),
	);
	return nested.flat();
}

describe('bundled azure-devops-node-api clients', () => {
	// esbuild.mjs swaps every REST client not on its keep-list for a stub that throws when used, and
	// no unit test runs the bundle. This catches a new WebApi.get*Api() call before it ships broken.
	it('keeps every client the extension and atomize-core ask WebApi for', async () => {
		const esbuild = await readFile(join(extensionRoot, 'esbuild.mjs'), 'utf8');
		const keepList = esbuild.match(/USED_AZURE_DEVOPS_CLIENTS = new Set\(\[([^\]]*)\]\)/)?.[1];
		expect(keepList).toBeDefined();
		const kept = new Set([...(keepList ?? '').matchAll(/'\.\/(\w+)'/g)].map((match) => match[1]));

		const used = new Set<string>();
		for (const root of sourceRoots) {
			for (const file of await sourceFiles(root)) {
				for (const match of (await readFile(file, 'utf8')).matchAll(/\.get(\w+Api)\(/g)) used.add(match[1] as string);
			}
		}

		expect(used.size).toBeGreaterThan(0);
		expect([...used].filter((client) => !kept.has(client))).toEqual([]);
	});
});
