import { execFileSync } from 'node:child_process';
import { cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const dir = dirname(fileURLToPath(import.meta.url));

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
	loader: { '.css': 'text' },
	// atomize-core's TemplateCatalog has an import.meta.url fallback path that's
	// unreachable here (src/core-library.ts always supplies an explicit
	// packageRoot) — silence the otherwise-correct warning about it.
	logOverride: { 'empty-import-meta': 'silent' },
});

// atomize-core's TemplateCatalog locates its builtin templates relative to its
// own package root via import.meta.url, which esbuild empties out under CJS
// bundling — see src/core-library.ts, which points TemplateCatalog at this
// copy instead via an explicit packageRoot.
cpSync(join(dir, '../atomize-core/catalog'), join(dir, 'dist/catalog'), { recursive: true });
