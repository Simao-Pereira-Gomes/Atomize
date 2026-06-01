import { spawn } from 'node:child_process';
import * as vscode from 'vscode';
import { buildAuthListArgs } from '../cli/cli-provider.js';
import { extendedEnv } from '../cli/env-utils.js';
import { manageProfiles } from './profile-management.js';
import { type AdoProfileJson, parseAdoProfilesJson, resolveDefaultProfile, sortAdoProfiles } from './profile-management-model.js';

export interface PickProfileOptions {
	title: string;
	allowOffline: boolean;
	defaultProfile: string | undefined;
}

export function fetchAdoProfiles(cliPath: string): Promise<AdoProfileJson[] | null> {
	return new Promise(resolve => {
		const proc = spawn(cliPath, buildAuthListArgs(), { shell: false, env: extendedEnv() });
		let stdout = '';
		proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
		proc.on('close', () => { resolve(parseAdoProfilesJson(stdout) ?? null); });
		proc.on('error', () => resolve(null));
	});
}

type ProfileItem = vscode.QuickPickItem & { profileName: string | undefined };

function buildProfileItems(profiles: AdoProfileJson[], allowOffline: boolean): ProfileItem[] {
	const items: ProfileItem[] = sortAdoProfiles(profiles).map(p => ({
		label: p.name,
		description: p.isDefault ? 'default' : '',
		detail: `${p.organizationUrl} · ${p.project}`,
		profileName: p.name,
	}));
	if (allowOffline) {
		items.push({ kind: vscode.QuickPickItemKind.Separator, label: '', profileName: undefined });
		items.push({ label: 'Offline only', description: 'Skip Azure DevOps connection', profileName: undefined });
	}
	return items;
}

async function showProfileQuickPick(
	items: ProfileItem[],
	title: string,
	activeItem: ProfileItem | undefined,
): Promise<ProfileItem | undefined> {
	const qp = vscode.window.createQuickPick<ProfileItem>();
	qp.title = title;
	qp.placeholder = 'Select a connection profile';
	qp.items = items;
	if (activeItem) qp.activeItems = [activeItem];
	qp.show();
	return new Promise(resolve => {
		qp.onDidAccept(() => { resolve(qp.activeItems[0]); qp.dispose(); });
		qp.onDidHide(() => { resolve(undefined); qp.dispose(); });
	});
}

export async function pickProfile(
	cliPath: string,
	opts: PickProfileOptions,
): Promise<string | undefined | null> {
	let adoProfiles = await fetchAdoProfiles(cliPath);
	if (adoProfiles === null) {
		void vscode.window.showErrorMessage('Could not list Azure DevOps profiles.');
		return null;
	}

	while (true) {
		if (adoProfiles.length === 0) {
			if (opts.allowOffline) {
				type ZeroItem = vscode.QuickPickItem & { action: 'offline' | 'add' };
				const picked = await vscode.window.showQuickPick<ZeroItem>(
					[
						{ label: 'Run offline', action: 'offline' },
						{ label: 'Add profile...', action: 'add' },
					],
					{ title: opts.title, placeHolder: 'No Azure DevOps profiles configured' },
				);
				if (!picked) return null;
				if (picked.action === 'offline') return undefined;
				await manageProfiles(cliPath, async () => true);
			} else {
				type ZeroItem = vscode.QuickPickItem & { action: 'add' | 'cancel' };
				const picked = await vscode.window.showQuickPick<ZeroItem>(
					[{ label: 'Add profile...', action: 'add' }],
					{ title: opts.title, placeHolder: `No Azure DevOps profiles configured — required for ${opts.title.replace('Atomize: ', '')}` },
				);
				if (!picked) return null;
				await manageProfiles(cliPath, async () => true);
			}
			adoProfiles = await fetchAdoProfiles(cliPath);
			if (adoProfiles === null) {
				void vscode.window.showErrorMessage('Could not list Azure DevOps profiles.');
				return null;
			}
		} else {
			const items = buildProfileItems(adoProfiles, opts.allowOffline);
			const defaultAdoProfile = resolveDefaultProfile(adoProfiles, opts.defaultProfile);
			const activeItem = defaultAdoProfile
				? items.find(i => i.profileName === defaultAdoProfile.name)
				: undefined;
			const picked = await showProfileQuickPick(items, opts.title, activeItem);
			if (!picked) return null;
			return picked.profileName ?? undefined;
		}
	}
}
