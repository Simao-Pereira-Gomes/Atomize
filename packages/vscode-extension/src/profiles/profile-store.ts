import { randomUUID } from 'node:crypto';
import type * as vscode from 'vscode';

const PROFILES_KEY = 'atomize.profiles';

export interface AzureDevOpsProfileMeta {
	id: string;
	name: string;
	organizationUrl: string;
	project: string;
	team: string;
	isDefault: boolean;
	createdAt: string;
	updatedAt: string;
}

export interface AzureDevOpsProfileFields {
	name: string;
	organizationUrl: string;
	project: string;
	team: string;
}

function secretKey(id: string): string {
	return `atomize.profileToken.${id}`;
}

/**
 * Owns Connection Profile storage entirely within the extension (ADR-0040):
 * non-secret fields in globalState, tokens in SecretStorage, keyed by a
 * generated id rather than name so renames never orphan a secret.
 */
export class ProfileStore {
	constructor(private readonly ctx: vscode.ExtensionContext) {}

	list(): AzureDevOpsProfileMeta[] {
		return this.ctx.globalState.get<AzureDevOpsProfileMeta[]>(PROFILES_KEY, []);
	}

	get(id: string): AzureDevOpsProfileMeta | undefined {
		return this.list().find(p => p.id === id);
	}

	getByName(name: string): AzureDevOpsProfileMeta | undefined {
		return this.list().find(p => p.name === name);
	}

	getDefault(): AzureDevOpsProfileMeta | undefined {
		return this.list().find(p => p.isDefault);
	}

	async add(fields: AzureDevOpsProfileFields, token: string): Promise<AzureDevOpsProfileMeta> {
		const profiles = this.list();
		if (profiles.some(p => p.name === fields.name)) {
			throw new Error(`Profile "${fields.name}" already exists.`);
		}
		const now = new Date().toISOString();
		const profile: AzureDevOpsProfileMeta = {
			id: randomUUID(),
			name: fields.name,
			organizationUrl: fields.organizationUrl,
			project: fields.project,
			team: fields.team,
			isDefault: profiles.length === 0,
			createdAt: now,
			updatedAt: now,
		};
		await this.ctx.secrets.store(secretKey(profile.id), token);
		await this.ctx.globalState.update(PROFILES_KEY, [...profiles, profile]);
		return profile;
	}

	async remove(id: string): Promise<void> {
		const profiles = this.list();
		const removed = profiles.find(p => p.id === id);
		if (!removed) return;

		let remaining = profiles.filter(p => p.id !== id);
		const first = remaining[0];
		if (removed.isDefault && first && !remaining.some(p => p.isDefault)) {
			remaining = remaining.map((p, i) => i === 0 ? { ...p, isDefault: true } : p);
		}

		await this.ctx.secrets.delete(secretKey(id));
		await this.ctx.globalState.update(PROFILES_KEY, remaining);
	}

	async setDefault(id: string): Promise<void> {
		const profiles = this.list().map(p => ({ ...p, isDefault: p.id === id }));
		await this.ctx.globalState.update(PROFILES_KEY, profiles);
	}

	getToken(id: string): Thenable<string | undefined> {
		return this.ctx.secrets.get(secretKey(id));
	}

	async setToken(id: string, token: string): Promise<void> {
		await this.ctx.secrets.store(secretKey(id), token);
		await this._touch(id);
	}

	private async _touch(id: string): Promise<void> {
		const profiles = this.list().map(p => p.id === id ? { ...p, updatedAt: new Date().toISOString() } : p);
		await this.ctx.globalState.update(PROFILES_KEY, profiles);
	}
}
