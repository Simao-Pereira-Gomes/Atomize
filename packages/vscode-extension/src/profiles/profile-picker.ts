import * as vscode from 'vscode';
import type { CredentialResolver } from './credential-resolver.js';
import { resolveDefaultProfile, sortProfiles } from './profile-helpers.js';
import { manageProfiles } from './profile-management.js';
import type { AzureDevOpsProfileMeta, ProfileStore } from './profile-store.js';

export interface PickProfileOptions {
	title: string;
	allowOffline: boolean;
	defaultProfile: string | undefined;
}

type ProfileItem = vscode.QuickPickItem & { profileName: string | undefined };

function buildProfileItems(profiles: AzureDevOpsProfileMeta[], allowOffline: boolean): ProfileItem[] {
	const items: ProfileItem[] = sortProfiles(profiles).map(p => ({
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
	store: ProfileStore,
	credentialResolver: CredentialResolver,
	opts: PickProfileOptions,
): Promise<string | undefined | null> {
	while (true) {
		const profiles = store.list();

		if (profiles.length === 0) {
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
				await manageProfiles(store, credentialResolver);
			} else {
				type ZeroItem = vscode.QuickPickItem & { action: 'add' };
				const picked = await vscode.window.showQuickPick<ZeroItem>(
					[{ label: 'Add profile...', action: 'add' }],
					{ title: opts.title, placeHolder: `No Azure DevOps profiles configured — required for ${opts.title.replace('Atomize: ', '')}` },
				);
				if (!picked) return null;
				await manageProfiles(store, credentialResolver);
			}
		} else {
			const items = buildProfileItems(profiles, opts.allowOffline);
			const defaultProfile = resolveDefaultProfile(profiles, opts.defaultProfile);
			const activeItem = defaultProfile ? items.find(i => i.profileName === defaultProfile.name) : undefined;
			const picked = await showProfileQuickPick(items, opts.title, activeItem);
			if (!picked) return null;
			return picked.profileName ?? undefined;
		}
	}
}
