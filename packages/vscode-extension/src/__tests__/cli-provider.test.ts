import { describe, expect, it } from 'bun:test';
import {
	buildValidateArgs,
	buildVersionArgs,
	checkForCliUpdate,
	CLI_PACKAGE_NAME,
	DEFAULT_INSTALL_COMMAND,
	DEFAULT_CLI_PATH,
	extractStableSemver,
	hasNewerStableVersion,
	isUpdateCheckEligible,
	normalizeCliPath,
	normalizeInstallCommand,
	UPDATE_CHECK_TTL_MS,
} from '../cli-provider.js';

describe('cli-provider', () => {
	it('uses atomize when no CLI path is configured', () => {
		expect(normalizeCliPath(undefined)).toBe(DEFAULT_CLI_PATH);
		expect(normalizeCliPath('   ')).toBe(DEFAULT_CLI_PATH);
	});

	it('preserves a configured executable path', () => {
		expect(normalizeCliPath('/Users/me/bin/atomize-dev')).toBe('/Users/me/bin/atomize-dev');
	});

	it('keeps validation arguments extension-owned', () => {
		expect(buildValidateArgs('/tmp/template.atomize.yaml')).toEqual([
			'validate',
			'--output',
			'json',
			'/tmp/template.atomize.yaml',
		]);
	});

	it('builds version probe arguments', () => {
		expect(buildVersionArgs()).toEqual(['--version']);
	});

	it('uses the npm install command when no install command is configured', () => {
		expect(normalizeInstallCommand(undefined)).toBe(DEFAULT_INSTALL_COMMAND);
		expect(normalizeInstallCommand('   ')).toBe(DEFAULT_INSTALL_COMMAND);
	});

	it('preserves a configured install command', () => {
		expect(normalizeInstallCommand('bun install -g @sppg2001/atomize')).toBe('bun install -g @sppg2001/atomize');
	});

	it('only checks updates for the default CLI path with stable installed versions', () => {
		expect(isUpdateCheckEligible(DEFAULT_CLI_PATH, true, '1.2.3')).toBe(true);
		expect(isUpdateCheckEligible('/opt/bin/atomize', true, '1.2.3')).toBe(false);
		expect(isUpdateCheckEligible(DEFAULT_CLI_PATH, false, '1.2.3')).toBe(false);
		expect(isUpdateCheckEligible(DEFAULT_CLI_PATH, true, '1.2.3-beta.1')).toBe(false);
	});

	it('extracts stable semver from version output and skips prereleases', () => {
		expect(extractStableSemver('atomize 1.2.3')).toBe('1.2.3');
		expect(extractStableSemver('1.2.3')).toBe('1.2.3');
		expect(extractStableSemver('atomize 1.2.3-beta.1')).toBeUndefined();
		expect(extractStableSemver('not a version')).toBeUndefined();
	});

	it('compares stable semver versions', () => {
		expect(hasNewerStableVersion('1.2.3', '1.2.4')).toBe(true);
		expect(hasNewerStableVersion('1.2.3', '1.3.0')).toBe(true);
		expect(hasNewerStableVersion('1.2.3', '2.0.0')).toBe(true);
		expect(hasNewerStableVersion('1.2.3', '1.2.3')).toBe(false);
		expect(hasNewerStableVersion('1.2.3', '1.2.3-beta.1')).toBe(false);
	});

	it('uses fresh update cache without fetching the registry', async () => {
		let fetchCount = 0;
		const result = await checkForCliUpdate({
			cliPath: DEFAULT_CLI_PATH,
			autoCheckUpdates: true,
			installedVersion: '1.0.0',
			now: 2000,
			cache: { checkedAt: 2000 - UPDATE_CHECK_TTL_MS + 1, ok: true, latestVersion: '1.0.1' },
			fetchLatestVersion: async () => {
				fetchCount += 1;
				return '1.0.1';
			},
		});

		expect(result).toBeUndefined();
		expect(fetchCount).toBe(0);
	});

	it('fetches latest version when update cache is stale', async () => {
		let fetchedPackage: string | undefined;
		const result = await checkForCliUpdate({
			cliPath: DEFAULT_CLI_PATH,
			autoCheckUpdates: true,
			installedVersion: '1.0.0',
			now: 2000,
			cache: { checkedAt: 2000 - UPDATE_CHECK_TTL_MS, ok: true, latestVersion: '1.0.0' },
			fetchLatestVersion: async packageName => {
				fetchedPackage = packageName;
				return '1.0.1';
			},
		});

		expect(fetchedPackage).toBe(CLI_PACKAGE_NAME);
		expect(result).toEqual({
			cache: { checkedAt: 2000, ok: true, latestVersion: '1.0.1' },
			latestVersion: '1.0.1',
			updateAvailable: true,
		});
	});

	it('records a failed update check without surfacing an error', async () => {
		const result = await checkForCliUpdate({
			cliPath: DEFAULT_CLI_PATH,
			autoCheckUpdates: true,
			installedVersion: '1.0.0',
			now: 2000,
			cache: undefined,
			fetchLatestVersion: async () => {
				throw new Error('registry unavailable');
			},
		});

		expect(result).toEqual({
			cache: { checkedAt: 2000, ok: false },
			updateAvailable: false,
		});
	});
});
