import type { AzureDevOpsProfileMeta } from './profile-store.js';

export function sortProfiles(profiles: AzureDevOpsProfileMeta[]): AzureDevOpsProfileMeta[] {
	return [...profiles].sort((a, b) => {
		const defaultOrder = Number(b.isDefault) - Number(a.isDefault);
		if (defaultOrder !== 0) return defaultOrder;
		return a.name.localeCompare(b.name);
	});
}

export function profileDetail(profile: Pick<AzureDevOpsProfileMeta, 'organizationUrl' | 'project' | 'team'>): string {
	return `${profile.organizationUrl} · ${profile.project} · ${profile.team}`;
}

export function resolveDefaultProfile(
	profiles: AzureDevOpsProfileMeta[],
	defaultProfile: string | undefined,
): AzureDevOpsProfileMeta | undefined {
	if (!defaultProfile) return undefined;
	return profiles.find(p => p.name === defaultProfile);
}
