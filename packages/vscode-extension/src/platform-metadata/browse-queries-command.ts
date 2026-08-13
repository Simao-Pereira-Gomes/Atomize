import { requireSavedQueryReader } from '@sppg2001/atomize-core/platforms/capabilities';
import type { SavedQueryInfo } from '@sppg2001/atomize-core/platforms/interfaces/platform.interface';
import * as vscode from 'vscode';
import { getDefaultProfile } from '../config/atomize-configuration.js';
import type { CredentialResolver } from '../profiles/credential-resolver.js';
import { pickProfile } from '../profiles/profile-picker.js';
import type { ProfileStore } from '../profiles/profile-store.js';

type QueryItem = vscode.QuickPickItem & { path: string };

async function fetchQueries(credentialResolver: CredentialResolver, profile: string): Promise<SavedQueryInfo[] | null> {
	try {
		const adapter = await credentialResolver.resolveByName(profile);
		const savedQueryReader = requireSavedQueryReader(adapter);
		return await savedQueryReader.listSavedQueries();
	} catch {
		return null;
	}
}

function buildQueryItems(queries: SavedQueryInfo[]): QueryItem[] {
	return queries.map(q => ({
		label: q.path,
		description: q.isPublic ? 'shared' : 'private',
		path: q.path,
	}));
}

export interface BrowseQueriesCommandDeps {
	store: ProfileStore;
	credentialResolver: CredentialResolver;
}

export function registerBrowseQueriesCommand(deps: BrowseQueriesCommandDeps): vscode.Disposable {
	return vscode.commands.registerCommand('atomize.browseQueries', async () => {
		const defaultProfile = getDefaultProfile(vscode.window.activeTextEditor?.document.uri);
		const profile = await pickProfile(deps.store, deps.credentialResolver, { title: 'Atomize: Browse Queries', allowOffline: false, defaultProfile });
		if (!profile) return;

		const queries = await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: 'Fetching queries…', cancellable: false },
			() => fetchQueries(deps.credentialResolver, profile),
		);

		if (queries === null) {
			void vscode.window.showErrorMessage('Could not fetch queries. Check your connection profile.');
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
