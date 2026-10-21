import { requireProjectMetadataReader } from '@sppg2001/atomize-core/platforms/capabilities';
import type { ADoFieldSchema } from '@sppg2001/atomize-core/platforms/interfaces/field-schema.interface';
import * as vscode from 'vscode';
import { getDefaultProfile } from '../config/atomize-configuration.js';
import type { CredentialResolver } from '../profiles/credential-resolver.js';
import { pickProfile } from '../profiles/profile-picker.js';
import type { ProfileStore } from '../profiles/profile-store.js';

type FieldItem = vscode.QuickPickItem & { referenceName: string };

async function fetchOrNull<T>(load: () => Promise<T>): Promise<T | null> {
	try {
		return await load();
	} catch {
		return null;
	}
}

function buildFieldItems(fields: ADoFieldSchema[]): FieldItem[] {
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
	store: ProfileStore;
	credentialResolver: CredentialResolver;
}

export function registerBrowseFieldsCommand(deps: BrowseFieldsCommandDeps): vscode.Disposable {
	return vscode.commands.registerCommand('atomize.browseFields', async () => {
		const defaultProfile = getDefaultProfile(vscode.window.activeTextEditor?.document.uri);
		const profile = await pickProfile(deps.store, deps.credentialResolver, { title: 'Atomize: Browse Fields', allowOffline: false, defaultProfile });
		if (!profile) return;

		const connection = await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: 'Fetching work item types…', cancellable: false },
			async () => {
				const reader = await fetchOrNull(async () => requireProjectMetadataReader(await deps.credentialResolver.resolveByName(profile)));
				const types = reader && await fetchOrNull(() => reader.getWorkItemTypes());
				return reader && types ? { reader, types } : null;
			},
		);
		if (!connection) {
			void vscode.window.showErrorMessage('Could not fetch work item types. Check your connection profile.');
			return;
		}

		const typePick = await vscode.window.showQuickPick(
			[
				{ label: 'All work item types', description: 'List every field in the project', type: undefined },
				...[...connection.types].sort((a, b) => a.localeCompare(b)).map(type => ({ label: type, type })),
			],
			{ title: 'Atomize: Browse Fields', placeHolder: 'Filter fields by work item type' },
		);
		if (!typePick) return;
		const typeFilter = typePick.type;

		const fields = await vscode.window.withProgress(
			{ location: vscode.ProgressLocation.Notification, title: 'Fetching fields…', cancellable: false },
			() => fetchOrNull(() => connection.reader.getFieldSchemas(typeFilter)),
		);

		if (fields === null) {
			void vscode.window.showErrorMessage('Could not fetch fields. Check your connection profile.');
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
