import type { CliProbeResult } from './cli-provider.js';

export interface UpdateResult {
	latestVersion?: string;
	updateAvailable: boolean;
}

export interface StatusBarState {
	text: string;
	tooltip: string;
	command: string;
}

export function deriveStatusBarState(probe: CliProbeResult, updateResult?: UpdateResult): StatusBarState {
	if (!probe.available) {
		return {
			text: '$(warning) Atomize: not found',
			tooltip: 'Atomize CLI not found. Click to install.',
			command: 'atomize.showCliUnavailable',
		};
	}

	const version = probe.version ?? 'unknown';

	if (updateResult?.updateAvailable && updateResult.latestVersion) {
		return {
			text: `$(arrow-up) Atomize ${version} → ${updateResult.latestVersion}`,
			tooltip: `Atomize CLI ${version} installed. Version ${updateResult.latestVersion} is available. Click to open settings.`,
			command: 'atomize.openSettings',
		};
	}

	return {
		text: `Atomize ${version}`,
		tooltip: `Atomize CLI ${version}. Click to open settings.`,
		command: 'atomize.openSettings',
	};
}
