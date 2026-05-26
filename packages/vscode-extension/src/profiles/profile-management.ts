import { spawn } from 'node:child_process';
import * as vscode from 'vscode';
import {
	buildAuthAddArgs,
	buildAuthListArgs,
	buildAuthRemoveArgs,
	buildAuthRemoveHelpArgs,
	buildAuthRotateArgs,
	buildAuthRotateHelpArgs,
	buildAuthTestArgs,
	buildAuthUseArgs,
} from '../cli/cli-provider.js';
import { extendedEnv } from '../cli/env-utils.js';
import {
	type AdoProfileJson,
	parseAdoProfilesJson,
	sanitizeCliError,
	sortAdoProfiles,
	supportsNativeRotation,
} from './profile-management-model.js';

interface CliRunResult {
	code: number | null;
	stdout: string;
	stderr: string;
}

interface AddProfileInput {
	name: string;
	organizationUrl: string;
	project: string;
	team: string;
	pat: string;
}

type ProfileItem = vscode.QuickPickItem & {
	kind?: vscode.QuickPickItemKind;
	profile?: AdoProfileJson;
	action?: 'add';
};

type ActionItem = vscode.QuickPickItem & {
	action: 'back' | 'setDefault' | 'test' | 'rotate' | 'remove';
};

function runCli(cliPath: string, args: string[], stdin?: string): Promise<CliRunResult> {
	return new Promise(resolve => {
		const proc = spawn(cliPath, args, { shell: false, env: extendedEnv() });
		let stdout = '';
		let stderr = '';
		proc.stdout.on('data', chunk => { stdout += chunk.toString(); });
		proc.stderr.on('data', chunk => { stderr += chunk.toString(); });
		proc.on('close', code => resolve({ code, stdout, stderr }));
		proc.on('error', error => resolve({ code: null, stdout, stderr: error.message }));
		if (stdin !== undefined) proc.stdin.end(stdin);
		else proc.stdin.end();
	});
}

async function assertManageProfilesCapabilities(cliPath: string): Promise<boolean> {
	const [removeHelp, rotateHelp, listResult] = await Promise.all([
		runCli(cliPath, buildAuthRemoveHelpArgs()),
		runCli(cliPath, buildAuthRotateHelpArgs()),
		runCli(cliPath, buildAuthListArgs()),
	]);

	if (removeHelp.code !== 0
		|| !removeHelp.stdout.includes('--confirm')
		|| !removeHelp.stdout.includes('--new-default')
		|| rotateHelp.code !== 0
		|| !rotateHelp.stdout.includes('--pat-stdin')) {
		void vscode.window.showErrorMessage('Atomize CLI is too old for profile management. Update the CLI and try again.');
		return false;
	}

	if (listResult.code !== 0) {
		const detail = sanitizeCliError(listResult);
		void vscode.window.showErrorMessage(`Could not list Atomize profiles.${detail ? ` ${detail}` : ''}`);
		return false;
	}

	const profiles = parseAdoProfilesJson(listResult.stdout);
	if (!profiles || profiles.some(p => typeof p.tokenStorage !== 'string')) {
		void vscode.window.showErrorMessage('Atomize CLI is too old for profile management. Update the CLI and try again.');
		return false;
	}

	return true;
}

async function fetchAdoProfiles(cliPath: string): Promise<AdoProfileJson[] | undefined> {
	const result = await runCli(cliPath, buildAuthListArgs());
	if (result.code !== 0) return undefined;
	return parseAdoProfilesJson(result.stdout);
}

function profileDetail(profile: AdoProfileJson): string {
	return `${profile.organizationUrl} · ${profile.project} · ${profile.team}`;
}

function makeProfileItems(profiles: AdoProfileJson[]): ProfileItem[] {
	const items: ProfileItem[] = sortAdoProfiles(profiles).map(profile => ({
		label: profile.name,
		description: [
			profile.isDefault ? 'default' : '',
			profile.tokenStorage === 'file' ? 'file storage' : profile.tokenStorage === 'keychain' ? 'keychain' : 'unknown storage',
		].filter(Boolean).join(' · '),
		detail: profileDetail(profile),
		profile,
	}));
	const addItem: ProfileItem = { label: 'Add profile...', action: 'add' };
	if (items.length === 0) return [addItem];
	return [...items, { kind: vscode.QuickPickItemKind.Separator, label: '' }, addItem];
}

function makeActionItems(profile: AdoProfileJson): ActionItem[] {
	const items: ActionItem[] = [{ label: 'Back', action: 'back' }];
	if (!profile.isDefault) items.push({ label: 'Set as default', action: 'setDefault' });
	items.push({ label: 'Test', action: 'test' });
	items.push({
		label: 'Rotate',
		description: supportsNativeRotation(profile) ? undefined : 'CLI only for this storage type',
		action: 'rotate',
	});
	items.push({ label: 'Remove', action: 'remove' });
	return items;
}

async function inputRequired(prompt: string, value?: string, password = false): Promise<string | undefined> {
	return vscode.window.showInputBox({
		prompt,
		value,
		ignoreFocusOut: true,
		password,
		validateInput: input => input.trim() ? undefined : 'Required',
	}).then(input => input === undefined ? undefined : input.trim());
}

async function collectAddInput(): Promise<AddProfileInput | undefined> {
	const name = await inputRequired('Profile name');
	if (name === undefined) return undefined;
	const organizationUrl = await inputRequired('Azure DevOps organization URL');
	if (organizationUrl === undefined) return undefined;
	const project = await inputRequired('Azure DevOps project');
	if (project === undefined) return undefined;
	const team = await inputRequired('Azure DevOps team');
	if (team === undefined) return undefined;
	const pat = await inputRequired('Personal Access Token', undefined, true);
	if (pat === undefined) return undefined;
	return { name, organizationUrl, project, team, pat };
}

async function collectPat(): Promise<string | undefined> {
	return inputRequired('New Personal Access Token', undefined, true);
}

async function runWithProgress(cliPath: string, args: string[], title: string, stdin?: string): Promise<CliRunResult> {
	return vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Notification, title, cancellable: false },
		() => runCli(cliPath, args, stdin),
	);
}

async function runTaskWithProgress<T>(title: string, task: () => Promise<T>): Promise<T> {
	return vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Notification, title, cancellable: false },
		task,
	);
}

async function fetchAdoProfilesOrNotify(cliPath: string): Promise<AdoProfileJson[] | undefined> {
	const profiles = await fetchAdoProfiles(cliPath);
	if (!profiles) void vscode.window.showErrorMessage('Could not list Atomize profiles.');
	return profiles;
}

function showOperationFailure(operation: string, result: CliRunResult): void {
	const detail = sanitizeCliError(result);
	void vscode.window.showErrorMessage(`${operation} failed.${detail ? ` ${detail}` : ''}`);
}

async function addProfile(cliPath: string): Promise<void> {
	const input = await collectAddInput();
	if (!input) return;
	const result = await runWithProgress(cliPath, buildAuthAddArgs(input), 'Adding Atomize profile...', input.pat);
	if (result.code === 0) void vscode.window.showInformationMessage(`Profile "${input.name}" added.`);
	else showOperationFailure('Add profile', result);
}

async function setDefault(cliPath: string, profile: AdoProfileJson): Promise<void> {
	const result = await runWithProgress(cliPath, buildAuthUseArgs(profile.name), `Setting "${profile.name}" as default...`);
	if (result.code === 0) void vscode.window.showInformationMessage(`Profile "${profile.name}" is now the default.`);
	else showOperationFailure('Set default profile', result);
}

async function testProfile(cliPath: string, profile: AdoProfileJson): Promise<void> {
	const result = await runWithProgress(cliPath, buildAuthTestArgs(profile.name), `Testing "${profile.name}"...`);
	if (result.code === 0) void vscode.window.showInformationMessage(`Profile "${profile.name}" test succeeded.`);
	else showOperationFailure('Test profile', result);
}

async function rotateProfile(cliPath: string, profile: AdoProfileJson): Promise<void> {
	if (!supportsNativeRotation(profile)) {
		void vscode.window.showInformationMessage('This profile stores its token in a file. Use the Atomize CLI to rotate it.');
		return;
	}
	const pat = await collectPat();
	if (pat === undefined) return;
	const result = await runWithProgress(cliPath, buildAuthRotateArgs(profile.name), `Rotating "${profile.name}"...`, pat);
	if (result.code === 0) void vscode.window.showInformationMessage(`Profile "${profile.name}" token rotated.`);
	else showOperationFailure('Rotate profile', result);
}

async function removeProfile(cliPath: string, profile: AdoProfileJson): Promise<void> {
	const selection = await vscode.window.showWarningMessage(
		`Remove profile "${profile.name}"? The saved token will be deleted and cannot be recovered by Atomize.`,
		{ modal: true },
		'Remove',
	);
	if (selection !== 'Remove') return;
	const result = await runWithProgress(cliPath, buildAuthRemoveArgs(profile.name), `Removing "${profile.name}"...`);
	if (result.code === 0) void vscode.window.showInformationMessage(`Profile "${profile.name}" removed.`);
	else showOperationFailure('Remove profile', result);
}

async function runAction(cliPath: string, profile: AdoProfileJson, action: ActionItem['action']): Promise<'back' | 'refresh'> {
	if (action === 'back') return 'back';
	if (action === 'setDefault') await setDefault(cliPath, profile);
	if (action === 'test') await testProfile(cliPath, profile);
	if (action === 'rotate') await rotateProfile(cliPath, profile);
	if (action === 'remove') await removeProfile(cliPath, profile);
	return 'refresh';
}

export async function manageProfiles(
	cliPath: string,
	ensureCliAvailable: () => Promise<boolean>,
): Promise<void> {
	const initialProfiles = await runTaskWithProgress('Loading Atomize profiles...', async () => {
		if (!await ensureCliAvailable()) return undefined;
		if (!await assertManageProfilesCapabilities(cliPath)) return undefined;
		return fetchAdoProfilesOrNotify(cliPath);
	});
	if (!initialProfiles) return;

	let profiles: AdoProfileJson[] | undefined = initialProfiles;
	while (true) {
		profiles ??= await runTaskWithProgress('Refreshing Atomize profiles...', () => fetchAdoProfilesOrNotify(cliPath));
		if (!profiles) {
			return;
		}

		const picked = await vscode.window.showQuickPick<ProfileItem>(
			makeProfileItems(profiles),
			{
				title: 'Atomize: Manage Profiles',
				placeHolder: profiles.length === 0
					? 'No Azure DevOps profiles configured'
					: 'Select an Azure DevOps profile',
			},
		);
		if (!picked) return;

		if (picked.action === 'add') {
			await addProfile(cliPath);
			profiles = undefined;
			continue;
		}
		if (!picked.profile) continue;

		const action = await vscode.window.showQuickPick<ActionItem>(
			makeActionItems(picked.profile),
			{
				title: `Manage Profile: ${picked.profile.name}`,
				placeHolder: profileDetail(picked.profile),
			},
		);
		if (!action) return;
		await runAction(cliPath, picked.profile, action.action);
		profiles = undefined;
	}
}
