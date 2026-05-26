export interface AdoProfileJson {
	name: string;
	platform: 'azure-devops';
	isDefault: boolean;
	organizationUrl: string;
	project: string;
	team: string;
	tokenStorage?: string;
}

export function sortAdoProfiles(profiles: AdoProfileJson[]): AdoProfileJson[] {
	return [...profiles].sort((a, b) => {
		const defaultOrder = Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault));
		if (defaultOrder !== 0) return defaultOrder;
		return a.name.localeCompare(b.name);
	});
}

export function parseAdoProfilesJson(stdout: string): AdoProfileJson[] | undefined {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stdout);
	} catch {
		return undefined;
	}
	if (!Array.isArray(parsed)) return undefined;
	return parsed.filter((p): p is AdoProfileJson => {
		if (!p || typeof p !== 'object') return false;
		const obj = p as Record<string, unknown>;
		return obj.platform === 'azure-devops'
			&& typeof obj.name === 'string'
			&& typeof obj.isDefault === 'boolean'
			&& typeof obj.organizationUrl === 'string'
			&& typeof obj.project === 'string'
			&& typeof obj.team === 'string';
	});
}

export function sanitizeCliError(result: Pick<{ stderr: string; stdout: string }, 'stderr' | 'stdout'>): string | undefined {
	const text = `${result.stderr}\n${result.stdout}`
		.replace(/\r/g, '\n')
		.split('\n')
		.map(line => line.trim())
		.filter(Boolean)
		.join(' ');
	const compact = text.replace(/\s+/g, ' ').slice(0, 240);
	return compact.length > 0 ? compact : undefined;
}

export function supportsNativeRotation(profile: AdoProfileJson): boolean {
	return profile.tokenStorage === 'keychain';
}

export function resolveDefaultProfile(
	profiles: AdoProfileJson[],
	defaultProfile: string | undefined,
): AdoProfileJson | undefined {
	if (!defaultProfile) return undefined;
	return profiles.find(p => p.name === defaultProfile);
}
