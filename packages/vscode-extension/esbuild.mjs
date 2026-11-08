import { execFileSync } from 'node:child_process';
import { cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const dir = dirname(fileURLToPath(import.meta.url));

// azure-devops-node-api's WebApi.js require()s every REST client (Git, Build, Release, Test…) at
// module load, and CommonJS can't be tree-shaken, so ~800 KB of clients Atomize never calls would
// land in the bundle. Only the clients listed here are kept; any other is replaced by a module that
// throws on use, so calling a new WebApi.get*Api() fails loudly until it's added to this list.
const USED_AZURE_DEVOPS_CLIENTS = new Set(['./CoreApi', './LocationsApi', './WikiApi', './WorkApi', './WorkItemTrackingApi']);

/** Swap dependency code Atomize never runs for stub modules, before esbuild bundles it. */
function stubUnusedDependencyCode() {
	return {
		name: 'stub-unused-dependency-code',
		setup(b) {
			b.onResolve({ filter: /^\.\/[A-Za-z]+Api$/ }, (args) =>
				/azure-devops-node-api[\\/]WebApi\.js$/.test(args.importer) && !USED_AZURE_DEVOPS_CLIENTS.has(args.path)
					? { path: args.path, namespace: 'unused-azure-devops-client' }
					: undefined,
			);
			b.onLoad({ filter: /.*/, namespace: 'unused-azure-devops-client' }, (args) => ({
				contents: `module.exports = new Proxy({}, { get(_, key) {
					if (typeof key === 'string' && key.endsWith('Api')) throw new Error(${JSON.stringify(
						`azure-devops-node-api client ${args.path} is stubbed out of the bundle; add it to USED_AZURE_DEVOPS_CLIENTS in esbuild.mjs`,
					)});
				} });`,
				loader: 'js',
			}));

			// zod re-exports every locale's error messages as z.locales (~260 KB); Atomize only uses the
			// English default, which zod imports separately from ../locales/en.js and so is unaffected.
			b.onResolve({ filter: /^\.\.\/locales\/index\.js$/ }, (args) =>
				/[\\/]zod[\\/]v4[\\/]/.test(args.importer) ? { path: 'zod-locales', namespace: 'unused-zod-locales' } : undefined,
			);
			b.onLoad({ filter: /.*/, namespace: 'unused-zod-locales' }, () => ({ contents: 'export {};', loader: 'js' }));
		},
	};
}

cpSync(join(dir, '../atomize-schema-reference/schema/atomize-template.schema.json'),
	join(dir, 'schemas/atomize-template.schema.json'));

execFileSync(
	join(dir, 'node_modules/.bin/tailwindcss'),
	['-i', 'src/webview/styles.css', '-o', 'src/webview/styles.generated.css', '--minify'],
	{ stdio: 'inherit', cwd: dir },
);

await build({
	entryPoints: ['src/extension.ts'],
	bundle: true,
	outfile: 'dist/extension.js',
	format: 'cjs',
	platform: 'node',
	target: 'node18',
	external: ['vscode', 'node:*'],
	sourcemap: true,
	minify: true,
	loader: { '.css': 'text' },
	// atomize-core's TemplateCatalog has an import.meta.url fallback path that's
	// unreachable here (src/core-library.ts always supplies an explicit
	// packageRoot) — silence the otherwise-correct warning about it.
	logOverride: { 'empty-import-meta': 'silent' },
	plugins: [stubUnusedDependencyCode()],
});

// atomize-core's TemplateCatalog locates its builtin templates relative to its
// own package root via import.meta.url, which esbuild empties out under CJS
// bundling — see src/core-library.ts, which points TemplateCatalog at this
// copy instead via an explicit packageRoot.
cpSync(join(dir, '../atomize-core/catalog'), join(dir, 'dist/catalog'), { recursive: true });
