import { validateOrganizationUrl } from '@sppg2001/atomize-core';
import * as vscode from 'vscode';
import { readCliProfiles } from './cli-import.js';
import type { CredentialResolver } from './credential-resolver.js';
import { profileDetail, sortProfiles } from './profile-helpers.js';
import type { AzureDevOpsProfileFields, AzureDevOpsProfileMeta, ProfileStore } from './profile-store.js';

function getErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

interface AddProfileInput extends AzureDevOpsProfileFields {
	pat: string;
}

type ProfileItem = vscode.QuickPickItem & {
	kind?: vscode.QuickPickItemKind;
	profile?: AzureDevOpsProfileMeta;
	action?: 'add' | 'import';
};

type ActionItem = vscode.QuickPickItem & {
	action: 'back' | 'setDefault' | 'test' | 'rotate' | 'remove';
};

async function makeProfileItems(store: ProfileStore): Promise<ProfileItem[]> {
	const profiles = store.list();
	const items: ProfileItem[] = sortProfiles(profiles).map(profile => ({
		label: profile.name,
		description: profile.isDefault ? 'default' : '',
		detail: profileDetail(profile),
		profile,
	}));

	const trailing: ProfileItem[] = [];
	if (items.length === 0 && (await readCliProfiles()).length > 0) {
		trailing.push({ label: 'Import from CLI...', action: 'import' });
	}
	trailing.push({ label: 'Add profile...', action: 'add' });

	if (items.length === 0) return trailing;
	return [...items, { kind: vscode.QuickPickItemKind.Separator, label: '' }, ...trailing];
}

function makeActionItems(profile: AzureDevOpsProfileMeta): ActionItem[] {
	const items: ActionItem[] = [{ label: 'Back', action: 'back' }];
	if (!profile.isDefault) items.push({ label: 'Set as default', action: 'setDefault' });
	items.push({ label: 'Test', action: 'test' });
	items.push({ label: 'Rotate', action: 'rotate' });
	items.push({ label: 'Remove', action: 'remove' });
	return items;
}

async function inputRequired(prompt: string, value?: string, password = false, validate?: (input: string) => string | undefined): Promise<string | undefined> {
	return vscode.window.showInputBox({
		prompt,
		value,
		ignoreFocusOut: true,
		password,
		validateInput: (input): string | undefined => {
			if (!input.trim()) return 'Required';
			return validate?.(input.trim());
		},
	}).then(input => input === undefined ? undefined : input.trim());
}

async function collectAddInput(): Promise<AddProfileInput | undefined> {
	const name = await inputRequired('Profile name');
	if (name === undefined) return undefined;
	const organizationUrl = await inputRequired('Azure DevOps organization URL', undefined, false, validateOrganizationUrl);
	if (organizationUrl === undefined) return undefined;
	const project = await inputRequired('Azure DevOps project');
	if (project === undefined) return undefined;
	const team = await inputRequired('Azure DevOps team');
	if (team === undefined) return undefined;
	const pat = await inputRequired('Personal Access Token', undefined, true);
	if (pat === undefined) return undefined;
	return { name, organizationUrl, project, team, pat };
}

async function collectPat(prompt = 'Personal Access Token'): Promise<string | undefined> {
	return inputRequired(prompt, undefined, true);
}

async function runWithProgress<T>(title: string, task: () => Promise<T>): Promise<T> {
	return vscode.window.withProgress(
		{ location: vscode.ProgressLocation.Notification, title, cancellable: false },
		task,
	);
}

function showOperationFailure(operation: string, error: unknown): void {
	void vscode.window.showErrorMessage(`${operation} failed. ${getErrorMessage(error)}`);
}

async function addProfile(store: ProfileStore): Promise<void> {
	const input = await collectAddInput();
	if (!input) return;
	try {
		await runWithProgress('Adding Atomize profile...', () => store.add(input, input.pat));
		void vscode.window.showInformationMessage(`Profile "${input.name}" added.`);
	} catch (error) {
		showOperationFailure('Add profile', error);
	}
}

async function importFromCli(store: ProfileStore): Promise<void> {
	const cliProfiles = await readCliProfiles();
	if (cliProfiles.length === 0) {
		void vscode.window.showInformationMessage('No Atomize CLI profiles found to import.');
		return;
	}

	const picked = await vscode.window.showQuickPick(
		cliProfiles.map(p => ({ label: p.name, detail: profileDetail(p), profile: p })),
		{ title: 'Atomize: Import from CLI', canPickMany: true, placeHolder: 'Select profiles to import — you\'ll paste each token once' },
	);
	if (!picked || picked.length === 0) return;

	for (const item of picked) {
		if (store.getByName(item.profile.name)) continue;
		const pat = await collectPat(`Personal Access Token for "${item.profile.name}"`);
		if (pat === undefined) continue;
		try {
			await store.add(item.profile, pat);
		} catch (error) {
			showOperationFailure(`Import "${item.profile.name}"`, error);
		}
	}
	void vscode.window.showInformationMessage('Import from CLI complete.');
}

async function setDefault(store: ProfileStore, profile: AzureDevOpsProfileMeta): Promise<void> {
	await runWithProgress(`Setting "${profile.name}" as default...`, () => store.setDefault(profile.id));
	void vscode.window.showInformationMessage(`Profile "${profile.name}" is now the default.`);
}

async function testProfile(credentialResolver: CredentialResolver, profile: AzureDevOpsProfileMeta): Promise<void> {
	try {
		await runWithProgress(`Testing "${profile.name}"...`, () => credentialResolver.resolveByName(profile.name));
		void vscode.window.showInformationMessage(`Profile "${profile.name}" test succeeded.`);
	} catch (error) {
		showOperationFailure('Test profile', error);
	}
}

async function rotateProfile(store: ProfileStore, profile: AzureDevOpsProfileMeta): Promise<void> {
	const pat = await collectPat('New Personal Access Token');
	if (pat === undefined) return;
	try {
		await runWithProgress(`Rotating "${profile.name}"...`, () => store.setToken(profile.id, pat));
		void vscode.window.showInformationMessage(`Profile "${profile.name}" token rotated.`);
	} catch (error) {
		showOperationFailure('Rotate profile', error);
	}
}

async function removeProfile(store: ProfileStore, profile: AzureDevOpsProfileMeta): Promise<void> {
	const selection = await vscode.window.showWarningMessage(
		`Remove profile "${profile.name}"? The saved token will be deleted and cannot be recovered by Atomize.`,
		{ modal: true },
		'Remove',
	);
	if (selection !== 'Remove') return;
	await runWithProgress(`Removing "${profile.name}"...`, () => store.remove(profile.id));
	void vscode.window.showInformationMessage(`Profile "${profile.name}" removed.`);
}

async function runAction(
	store: ProfileStore,
	credentialResolver: CredentialResolver,
	profile: AzureDevOpsProfileMeta,
	action: ActionItem['action'],
): Promise<'back' | 'refresh'> {
	if (action === 'back') return 'back';
	if (action === 'setDefault') await setDefault(store, profile);
	if (action === 'test') await testProfile(credentialResolver, profile);
	if (action === 'rotate') await rotateProfile(store, profile);
	if (action === 'remove') await removeProfile(store, profile);
	return 'refresh';
}

export async function manageProfiles(store: ProfileStore, credentialResolver: CredentialResolver): Promise<void> {
	while (true) {
		const items = await makeProfileItems(store);
		const picked = await vscode.window.showQuickPick<ProfileItem>(items, {
			title: 'Atomize: Manage Profiles',
			placeHolder: store.list().length === 0
				? 'No Azure DevOps profiles configured'
				: 'Select an Azure DevOps profile',
		});
		if (!picked) return;

		if (picked.action === 'add') {
			await addProfile(store);
			continue;
		}
		if (picked.action === 'import') {
			await importFromCli(store);
			continue;
		}
		if (!picked.profile) continue;

		const action = await vscode.window.showQuickPick<ActionItem>(
			makeActionItems(picked.profile),
			{ title: `Manage Profile: ${picked.profile.name}`, placeHolder: profileDetail(picked.profile) },
		);
		if (!action) return;
		await runAction(store, credentialResolver, picked.profile, action.action);
	}
}
