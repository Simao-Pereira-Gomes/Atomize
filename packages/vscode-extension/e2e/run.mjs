// Runs the e2e suite in a real VS Code against the built extension: `bun run build` first.
// VSCODE_TEST_VERSION picks the VS Code build (default: the minimum the extension supports).
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';
import { build } from 'esbuild';

const e2e = dirname(fileURLToPath(import.meta.url));
const extensionDevelopmentPath = join(e2e, '..');

if (!existsSync(join(extensionDevelopmentPath, 'dist', 'extension.js'))) {
	console.error('dist/extension.js is missing: run `bun run build` before the e2e suite.');
	process.exit(1);
}

const extensionTestsPath = join(e2e, '.out', 'suite.cjs');
await build({
	entryPoints: [join(e2e, 'suite', 'index.ts')],
	outfile: extensionTestsPath,
	bundle: true,
	platform: 'node',
	format: 'cjs',
	external: ['vscode'],
	logLevel: 'warning',
});

// Fresh copies, so a run never sees another run's (or the developer's) Catalog or settings.
const sandbox = mkdtempSync(join(tmpdir(), 'atomize-vscode-e2e-'));
cpSync(join(e2e, 'fixtures'), sandbox, { recursive: true });
const workspace = join(sandbox, 'workspace');
const home = join(sandbox, 'home');

try {
	await runTests({
		version: process.env.VSCODE_TEST_VERSION ?? '1.90.0',
		extensionDevelopmentPath,
		extensionTestsPath,
		launchArgs: [
			workspace,
			'--disable-extensions',
			'--disable-workspace-trust',
			'--skip-welcome',
			'--skip-release-notes',
			`--user-data-dir=${join(sandbox, 'user-data')}`,
			`--extensions-dir=${join(sandbox, 'extensions')}`,
		],
		extensionTestsEnv: { HOME: home, USERPROFILE: home, ATOMIZE_TELEMETRY: 'off' },
	});
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
} finally {
	rmSync(sandbox, { recursive: true, force: true });
}
