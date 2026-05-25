import { spawn } from 'node:child_process';
import * as vscode from 'vscode';
import { getConfiguredCliPath } from './cli-lifecycle.js';
import { buildQueriesListArgs, probeCli } from './cli-provider.js';
import { extendedEnv } from './env-utils.js';
import { pickProfile } from './profile-picker.js';

interface QueryJson {
	id: string;
	name: string;
	path: string;
	isPublic: boolean;
}

type QueryItem = vscode.QuickPickItem & { path: string };

function parseQueriesJson(stdout: string): QueryJson[] | null {
	try {
		const parsed = JSON.parse(stdout);
		return Array.isArray(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function fetchQueries(cliPath: string, profile: string): Promise<QueryJson[] | null> {
	return new Promise(resolve => {
		const proc = spawn(cliPath, buildQueriesListArgs(profile), { shell: false, env: extendedEnv() });
		let stdout = '';
		proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
		proc.on('close', () => { resolve(parseQueriesJson(stdout)); });
		proc.on('error', () => resolve(null));
	});
}

function buildQueryItems(queries: QueryJson[]): QueryItem[] {
	return queries.map(q => ({
		label: q.path,
		description: q.isPublic ? 'shared' : 'private',
		path: q.path,
	}));
}

export interface BrowseQueriesCommandDeps {
	showCliUnavailable: (cliPath: string, message: string) => Promise<void>;
}

export function registerBrowseQueriesCommand(deps: BrowseQueriesCommandDeps): vscode.Disposable {
	return vscode.commands.registerCommand('atomize.browseQueries', async () => {
		const cliPath = getConfiguredCliPath();
		const probe = await probeCli(cliPath);
		if (!probe.available) {
			await deps.showCliUnavailable(cliPath, 'Atomize CLI not found. Install it to browse queries.');
			return;
		}

		const defaultProfile = vscode.workspace.getConfiguration('atomize').get<string>('defaultProfile') || undefined;
		const profile = await pickProfile(cliPath, { title: 'Atomize: Browse Queries', allowOffline: false, defaultProfile });
		if (!profile) return;

		const queries = await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: 'Fetching queries…', cancellable: false },
			() => fetchQueries(cliPath, profile),
		);

		if (queries === null) {
			void vscode.window.showErrorMessage('Could not fetch queries. Check the CLI and your connection profile.');
			return;
		}

		if (queries.length === 0) {
			void vscode.window.showInformationMessage('No saved queries found in this project.');
			return;
		}

		const picked = await vscode.window.showQuickPick(buildQueryItems(queries), {
			title: 'Atomize: Browse Queries',
			matchOnDescription: true,
			placeHolder: 'Select a query to copy its path',
		});
		if (!picked) return;

		await vscode.env.clipboard.writeText(picked.path);
		void vscode.window.showInformationMessage(`Copied "${picked.path}" to clipboard.`);
	});
}
