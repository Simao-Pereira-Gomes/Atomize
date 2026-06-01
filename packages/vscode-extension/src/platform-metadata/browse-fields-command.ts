import * as vscode from 'vscode';
import { buildFieldsListArgs, probeCli, spawnCli } from '../cli/cli-provider.js';
import { getConfiguredCliPath, getDefaultProfile } from '../config/atomize-configuration.js';
import { pickProfile } from '../profiles/profile-picker.js';

interface FieldJson {
	referenceName: string;
	name: string;
	type: string;
	isReadOnly: boolean;
	isPicklist: boolean;
	allowedValues?: string[];
}

type FieldItem = vscode.QuickPickItem & { referenceName: string };

function parseFieldsJson(stdout: string): FieldJson[] | null {
	try {
		const parsed = JSON.parse(stdout);
		return Array.isArray(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

function fetchFields(cliPath: string, profile: string, type?: string): Promise<FieldJson[] | null> {
	return new Promise(resolve => {
		const proc = spawnCli(cliPath, buildFieldsListArgs(profile, type));
		let stdout = '';
		proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
		proc.on('close', () => { resolve(parseFieldsJson(stdout)); });
		proc.on('error', () => resolve(null));
	});
}

function buildFieldItems(fields: FieldJson[]): FieldItem[] {
	return fields.map(f => {
		const descParts = [f.name];
		if (f.isReadOnly) descParts.push('read-only');

		let detail = f.type;
		if (f.allowedValues && f.allowedValues.length > 0) {
			detail += `  ·  ${f.allowedValues.join(', ')}`;
		} else if (f.isPicklist) {
			detail += '  ·  picklist (filter by type to see values)';
		}

		return {
			label: f.referenceName,
			description: descParts.join('  ·  '),
			detail,
			referenceName: f.referenceName,
		};
	});
}

export interface BrowseFieldsCommandDeps {
	showCliUnavailable: (cliPath: string, message: string) => Promise<void>;
}

export function registerBrowseFieldsCommand(deps: BrowseFieldsCommandDeps): vscode.Disposable {
	return vscode.commands.registerCommand('atomize.browseFields', async () => {
		const cliPath = getConfiguredCliPath();
		const probe = await probeCli(cliPath);
		if (!probe.available) {
			await deps.showCliUnavailable(cliPath, 'Atomize CLI not found. Install it to browse fields.');
			return;
		}

		const defaultProfile = getDefaultProfile(vscode.window.activeTextEditor?.document.uri);
		const profile = await pickProfile(cliPath, { title: 'Atomize: Browse Fields', allowOffline: false, defaultProfile });
		if (!profile) return;

		const typeFilter = await vscode.window.showInputBox({
			title: 'Atomize: Browse Fields',
			prompt: 'Filter by work item type, or press Enter to list all fields',
			placeHolder: 'e.g. Task, Bug',
		});
		if (typeFilter === undefined) return;

		const fields = await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: 'Fetching fields…', cancellable: false },
			() => fetchFields(cliPath, profile, typeFilter || undefined),
		);

		if (fields === null) {
			void vscode.window.showErrorMessage('Could not fetch fields. Check the CLI and your connection profile.');
			return;
		}

		if (fields.length === 0) {
			void vscode.window.showInformationMessage(
				typeFilter ? `No fields found for type "${typeFilter}".` : 'No fields found in this project.',
			);
			return;
		}

		const picked = await vscode.window.showQuickPick(buildFieldItems(fields), {
			title: 'Atomize: Browse Fields',
			matchOnDescription: true,
			matchOnDetail: true,
			placeHolder: 'Select a field to copy its reference name',
		});
		if (!picked) return;

		await vscode.env.clipboard.writeText(picked.referenceName);
		void vscode.window.showInformationMessage(`Copied "${picked.referenceName}" to clipboard.`);
	});
}
