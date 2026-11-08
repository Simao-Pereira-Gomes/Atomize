import * as vscode from 'vscode';
import { assert, codeOf, diagnosticsFor, fire, open, runAll, test, waitFor, workspaceFile } from './harness';

/**
 * Runs inside a real VS Code extension host against the built extension (dist/extension.js), with
 * a fixture workspace that has a project Catalog and a fixture HOME with a personal Catalog.
 *
 * Covers what the architecture and performance work could break in the shipped bundle: the
 * bundled built-in Catalog and Template composition (#310, #311, the bundle shrink), Offline
 * Validation diagnostics (#317, #318), and the Mock and Live Preview commands (#313, #315).
 */

test('the extension activates', async () => {
	const extension = vscode.extensions.getExtension('atomize.atomize');
	assert.ok(extension, 'atomize.atomize is installed in the test host');
	await extension.activate();
	assert.equal(extension.isActive, true);
});

test('an .atomize.yaml file is served as YAML, so YAML tooling and the schema apply', async () => {
	const uri = workspaceFile('templates', 'valid.atomize.yaml');
	await open(uri);
	// Changing a document's language replaces the TextDocument, so look it up again each time.
	const current = () => vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
	await waitFor('the yaml language', () => current()?.languageId === 'yaml' || undefined);
});

test('a valid Template gets no diagnostics', async () => {
	const uri = workspaceFile('templates', 'valid.atomize.yaml');
	await open(uri);
	assert.deepEqual(await diagnosticsFor(uri, false), []);
});

test('an invalid Template gets error diagnostics with their codes', async () => {
	const uri = workspaceFile('templates', 'invalid.atomize.yaml');
	await open(uri);
	const diagnostics = await diagnosticsFor(uri, true);

	const errors = diagnostics.filter(diagnostic => diagnostic.severity === vscode.DiagnosticSeverity.Error);
	assert.ok(errors.length >= 2, `expected at least two errors, got ${diagnostics.map(d => d.message).join(' | ')}`);
	assert.ok(errors.some(error => codeOf(error) === 'too_small'), 'the empty title is reported');
	assert.ok(errors.some(error => codeOf(error) === 'too_big'), 'the 120% task is reported');
});

test('Offline Validation warns about custom fields and a saved query it could not check', async () => {
	const uri = workspaceFile('templates', 'customfields.atomize.yaml');
	await open(uri);
	const diagnostics = await diagnosticsFor(uri, true);

	const warnings = diagnostics.filter(diagnostic => diagnostic.severity === vscode.DiagnosticSeverity.Warning);
	assert.equal(diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length, 0);
	assert.ok(warnings.some(warning => /custom field/i.test(warning.message)), warnings.map(w => w.message).join(' | '));
	assert.ok(warnings.some(warning => /saved query/i.test(warning.message)), warnings.map(w => w.message).join(' | '));
});

test('a Template extending a built-in Catalog Template gets no diagnostics', async () => {
	const uri = workspaceFile('templates', 'composed-builtin.atomize.yaml');
	await open(uri);
	assert.deepEqual((await diagnosticsFor(uri, false)).map(d => d.message), []);
});

test('an extends that cannot be resolved is an error on the extends line, not just a notification', async () => {
	const uri = workspaceFile('templates', 'broken-extends.atomize.yaml');
	await open(uri);
	const [diagnostic] = await diagnosticsFor(uri, true);

	assert.ok(diagnostic, 'a diagnostic is reported');
	assert.equal(diagnostic.severity, vscode.DiagnosticSeverity.Error);
	assert.equal(codeOf(diagnostic), 'TEMPLATE_COMPOSITION_FAILED');
	assert.equal(diagnostic.range.start.line, 2, 'it underlines the extends line');
	assert.match(diagnostic.message, /template:does-not-exist/);
});

async function resolvedText(file: string): Promise<string> {
	fire('atomize.showResolvedTemplate', workspaceFile('templates', file));
	const editor = await waitFor('the Resolved Template view', () =>
		vscode.window.visibleTextEditors.find(candidate => candidate.document.uri.scheme === 'atomize-resolved'),
	);
	return editor.document.getText();
}

test('the Resolved Template view composes built-in and project Catalog items, so the bundled Catalog ships', async () => {
	const text = await resolvedText('composed-builtin.atomize.yaml');

	for (const id of ['design', 'implement', 'verify', 'proj-docs']) {
		assert.match(text, new RegExp(`id: ${id}\\b`), `resolved Template has task ${id}`);
	}
	assert.doesNotMatch(text, /^extends:/m);
});

test('the Resolved Template view composes personal Catalog items from HOME', async () => {
	const text = await resolvedText('composed-personal.atomize.yaml');

	assert.match(text, /title: Build it/);
	assert.match(text, /title: Plan \$\{story\.title\}/);
	assert.match(text, /id: proj-docs/);
});

function openedWebviewTitles(): string[] {
	return vscode.window.tabGroups.all
		.flatMap(group => group.tabs)
		.filter(tab => tab.input instanceof vscode.TabInputWebview)
		.map(tab => tab.label);
}

test('Mock Preview opens its panel for a Template', async () => {
	const uri = workspaceFile('templates', 'valid.atomize.yaml');
	await open(uri);
	fire('atomize.preview', uri);
	await waitFor('a Mock Preview panel', () => openedWebviewTitles().length > 0 || undefined);
});

test('showing a Mixin as a Resolved Template is refused rather than failing', async () => {
	fire('atomize.showResolvedTemplate', workspaceFile('.atomize', 'catalog', 'mixins', 'proj-docs.atomize.yaml'));
	await new Promise(resolve => setTimeout(resolve, 1_500));
	assert.equal(vscode.window.visibleTextEditors.some(editor => editor.document.uri.scheme === 'atomize-resolved'), false);
});

export async function run(): Promise<void> {
	await runAll();
}
