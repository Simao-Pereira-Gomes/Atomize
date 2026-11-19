// Measures the extension's activation cost in a real VS Code with redhat.vscode-yaml installed,
// comparing a baseline git ref against the working tree.
//
// macOS only as written: it defaults to the VS Code install under /Applications and passes
// --use-mock-keychain, an Electron flag for the macOS Keychain. On other platforms, set
// VSCODE_EXECUTABLE and YAML_EXTENSION_DIR, and expect to adjust the launch flags. Not run in CI.
//
//   bun scripts/measure-activation.mjs [--baseline <ref>] [--runs <n>] [--settle <ms>]
//
// Each variant is built, then wrapped by a measuring `main` that records how long the bundle takes
// to load, how long activate() takes to return, and how long until its promise resolves (what
// VS Code's Running Extensions view reports). Every run is a fresh VS Code with its own user data
// and extensions folder, holding only the YAML extension copied from ~/.vscode/extensions.
//
// Env: VSCODE_EXECUTABLE (default: the installed VS Code), YAML_EXTENSION_DIR (default: newest
// redhat.vscode-yaml-* in ~/.vscode/extensions).
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { runTests } from '@vscode/test-electron';

const { values: args } = parseArgs({
	options: {
		baseline: { type: 'string', default: 'HEAD' },
		runs: { type: 'string', default: '3' },
		settle: { type: 'string', default: '8000' },
	},
});
const RUNS = Number(args.runs);
const SETTLE_MS = Number(args.settle);

const packageDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: packageDir, encoding: 'utf8' }).trim();
const packageRel = packageDir.slice(repoRoot.length + 1) || '.';

const vscodeExecutable = process.env.VSCODE_EXECUTABLE ?? '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
if (!existsSync(vscodeExecutable)) fail(`VS Code not found at ${vscodeExecutable}; set VSCODE_EXECUTABLE.`);
const yamlExtensionDir = process.env.YAML_EXTENSION_DIR ?? findYamlExtension();

/** Workspaces to open. `openFile` is opened after startup settles, to trigger onLanguage activation. */
const SCENARIOS = [
	{ name: 'no YAML files', files: { 'README.md': '# Not an Atomize project\n' } },
	{
		name: 'unrelated YAML, opened after startup',
		files: { 'config.yaml': 'server:\n  port: 8080\n' },
		openFile: 'config.yaml',
	},
	{
		name: 'Atomize project',
		files: { 'templates/story.atomize.yaml': readFileSync(join(packageDir, 'e2e/fixtures/workspace/templates/valid.atomize.yaml'), 'utf8') },
	},
];

const scratch = mkdtempSync(join(tmpdir(), 'atomize-activation-'));
try {
	const variants = [
		{ name: `baseline (${args.baseline})`, dir: buildBaseline(args.baseline) },
		{ name: 'working tree', dir: buildWorkingTree() },
	];
	const runner = writeRunner();
	const results = [];
	for (const scenario of SCENARIOS) {
		for (const variant of variants) {
			const staged = stageExtension(variant.dir);
			const samples = [];
			for (let i = 0; i < RUNS; i++) {
				process.stdout.write(`\r${scenario.name} · ${variant.name} · run ${i + 1}/${RUNS}   `);
				samples.push(await measureOnce(staged, scenario, runner));
			}
			results.push({ scenario: scenario.name, variant: variant.name, samples });
		}
	}
	process.stdout.write('\n\n');
	report(results);
} finally {
	try {
		execFileSync('git', ['worktree', 'remove', '--force', join(scratch, 'baseline')], { cwd: repoRoot, stdio: 'ignore' });
	} catch {}
	rmSync(scratch, { recursive: true, force: true });
}

function buildBaseline(ref) {
	const worktree = join(scratch, 'baseline');
	console.log(`Building baseline ${ref} in a temporary worktree…`);
	execFileSync('git', ['worktree', 'add', '--detach', worktree, ref], { cwd: repoRoot, stdio: 'ignore' });
	execFileSync('bun', ['install', '--frozen-lockfile'], { cwd: worktree, stdio: 'ignore' });
	const dir = join(worktree, packageRel);
	execFileSync('bun', ['esbuild.mjs'], { cwd: dir, stdio: 'ignore' });
	return dir;
}

function buildWorkingTree() {
	console.log('Building the working tree…');
	execFileSync('bun', ['esbuild.mjs'], { cwd: packageDir, stdio: 'ignore' });
	return packageDir;
}

/** A copy of the built extension whose `main` is a measuring wrapper around the real bundle. */
function stageExtension(sourceDir) {
	const staged = mkdtempSync(join(scratch, 'ext-'));
	const skip = new Set(['node_modules', '.vscode-test', 'src', 'e2e', 'webview', 'scripts']);
	for (const entry of readdirSync(sourceDir)) {
		if (!skip.has(entry)) cpSync(join(sourceDir, entry), join(staged, entry), { recursive: true });
	}
	const manifest = JSON.parse(readFileSync(join(staged, 'package.json'), 'utf8'));
	const realMain = `./${manifest.main.replace(/^\.\//, '').replace(/^dist\//, '')}`;
	manifest.main = './dist/measure-main.js';
	writeFileSync(join(staged, 'package.json'), JSON.stringify(manifest, null, '\t'));
	writeFileSync(join(staged, 'dist/measure-main.js'), `
const { writeFileSync } = require('node:fs');
const vscode = require('vscode');
const loadStart = performance.now();
const real = require(${JSON.stringify(realMain)});
const loadMs = performance.now() - loadStart;
exports.activate = function (ctx) {
	const start = performance.now();
	const yamlActiveBefore = vscode.extensions.getExtension('redhat.vscode-yaml')?.isActive ?? false;
	const result = real.activate(ctx);
	const callMs = performance.now() - start;
	const record = () => writeFileSync(process.env.ATOMIZE_MEASURE_OUT, JSON.stringify({
		loadMs, callMs, resolvedMs: performance.now() - start, yamlActiveBefore,
	}));
	Promise.resolve(result).then(record, record);
	return result;
};
exports.deactivate = (...a) => real.deactivate?.(...a);
`);
	return staged;
}

/** Runs inside the extension host: lets startup settle, optionally opens a file, then reports. */
function writeRunner() {
	const file = join(scratch, 'runner.cjs');
	writeFileSync(file, `
const vscode = require('vscode');
const { existsSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
exports.run = async function () {
	const env = process.env;
	if (!vscode.extensions.getExtension('redhat.vscode-yaml')) throw new Error('redhat.vscode-yaml is not installed in the test host');
	await sleep(Number(env.SETTLE_MS));
	const activeAtStartup = vscode.extensions.getExtension('atomize.atomize').isActive;
	if (env.OPEN_FILE) {
		const folder = vscode.workspace.workspaceFolders[0].uri;
		await vscode.window.showTextDocument(vscode.Uri.joinPath(folder, env.OPEN_FILE));
		for (let i = 0; i < 150 && !existsSync(env.ATOMIZE_MEASURE_OUT); i++) await sleep(100);
	} else if (activeAtStartup) {
		for (let i = 0; i < 150 && !existsSync(env.ATOMIZE_MEASURE_OUT); i++) await sleep(100);
	}
	writeFileSync(env.RUNNER_OUT, JSON.stringify({ activeAtStartup }));
};
`);
	return file;
}

async function measureOnce(extensionDir, scenario, runner) {
	const run = mkdtempSync(join(scratch, 'run-'));
	const workspace = join(run, 'workspace');
	for (const [rel, content] of Object.entries(scenario.files)) {
		mkdirSync(dirname(join(workspace, rel)), { recursive: true });
		writeFileSync(join(workspace, rel), content);
	}
	const extensionsDir = join(run, 'extensions');
	const yamlName = basename(yamlExtensionDir);
	cpSync(yamlExtensionDir, join(extensionsDir, yamlName), { recursive: true });
	const yamlVersion = JSON.parse(readFileSync(join(yamlExtensionDir, 'package.json'), 'utf8')).version;
	writeFileSync(join(extensionsDir, 'extensions.json'), JSON.stringify([{
		identifier: { id: 'redhat.vscode-yaml' },
		version: yamlVersion,
		location: { $mid: 1, path: join(extensionsDir, yamlName), scheme: 'file' },
		relativeLocation: yamlName,
	}]));

	const measureOut = join(run, 'activation.json');
	const runnerOut = join(run, 'runner.json');
	await runTests({
		vscodeExecutablePath: vscodeExecutable,
		extensionDevelopmentPath: extensionDir,
		extensionTestsPath: runner,
		launchArgs: [
			workspace,
			'--disable-workspace-trust',
			'--skip-welcome',
			'--skip-release-notes',
			// A fresh user-data dir has no "Code Safe Storage" Keychain entry, so the installed VS Code
			// would fail (or prompt) on macOS; a mock keychain keeps each run isolated from the real one.
			'--use-mock-keychain',
			`--user-data-dir=${join(run, 'u')}`,
			`--extensions-dir=${extensionsDir}`,
		],
		// No HOME override: this env reaches the whole VS Code process, which reads argv.json and the
		// Keychain from HOME, so a fake HOME breaks startup.
		extensionTestsEnv: {
			ATOMIZE_TELEMETRY: 'off',
			ATOMIZE_MEASURE_OUT: measureOut,
			RUNNER_OUT: runnerOut,
			SETTLE_MS: String(SETTLE_MS),
			OPEN_FILE: scenario.openFile ?? '',
		},
	}).catch(() => {});
	const runnerResult = existsSync(runnerOut) ? JSON.parse(readFileSync(runnerOut, 'utf8')) : undefined;
	if (!runnerResult) fail(`The VS Code run for "${scenario.name}" did not report back.`);
	const activation = existsSync(measureOut) ? JSON.parse(readFileSync(measureOut, 'utf8')) : undefined;
	return { ...runnerResult, activation };
}

function report(results) {
	const median = values => {
		const sorted = [...values].sort((a, b) => a - b);
		return sorted[Math.floor(sorted.length / 2)];
	};
	const ms = n => (n === undefined ? '—' : `${n.toFixed(1)} ms`);
	const rows = results.map(({ scenario, variant, samples }) => {
		const activated = samples.filter(s => s.activation);
		const pick = key => (activated.length ? median(activated.map(s => s.activation[key])) : undefined);
		return {
			Scenario: scenario,
			Variant: variant,
			'Active after startup': `${samples.filter(s => s.activeAtStartup).length}/${samples.length}`,
			'Activated at all': `${activated.length}/${samples.length}`,
			'Bundle load': ms(pick('loadMs')),
			'activate() returns': ms(pick('callMs')),
			'activate() resolves': ms(pick('resolvedMs')),
		};
	});
	console.log(`Medians over ${RUNS} run(s) each, VS Code at ${vscodeExecutable}, YAML extension ${basename(yamlExtensionDir)}.`);
	console.table(rows);
}

function findYamlExtension() {
	const root = join(homedir(), '.vscode', 'extensions');
	const match = existsSync(root) ? readdirSync(root).filter(d => d.startsWith('redhat.vscode-yaml-')).sort().pop() : undefined;
	if (!match) fail('redhat.vscode-yaml not found in ~/.vscode/extensions; set YAML_EXTENSION_DIR.');
	return join(root, match);
}

function fail(message) {
	console.error(message);
	process.exit(1);
}
