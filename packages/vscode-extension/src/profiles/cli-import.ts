import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { AzureDevOpsProfileFields } from './profile-store.js';

/**
 * Read-only, defensive, one-time read of the CLI's connections file for the
 * "Import from CLI" action (ADR-0040). Never written to, never treated as an
 * ongoing sync source, and never lets a parse/schema surprise become a hard
 * error — a missing or malformed file just means "no CLI profiles found."
 */
export async function readCliProfiles(): Promise<AzureDevOpsProfileFields[]> {
	const path = join(homedir(), '.atomize', 'connections.json');

	let raw: string;
	try {
		raw = await readFile(path, 'utf-8');
	} catch {
		return [];
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}

	if (typeof parsed !== 'object' || parsed === null || !('profiles' in parsed)) return [];
	const profiles = (parsed as { profiles: unknown }).profiles;
	if (!Array.isArray(profiles)) return [];

	return profiles.filter((p): p is AzureDevOpsProfileFields => {
		if (!p || typeof p !== 'object') return false;
		const obj = p as Record<string, unknown>;
		return obj.platform === 'azure-devops'
			&& typeof obj.name === 'string'
			&& typeof obj.organizationUrl === 'string'
			&& typeof obj.project === 'string'
			&& typeof obj.team === 'string';
	});
}
