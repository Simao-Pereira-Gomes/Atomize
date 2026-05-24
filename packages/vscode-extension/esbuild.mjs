import { execFileSync } from 'node:child_process';
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
});
