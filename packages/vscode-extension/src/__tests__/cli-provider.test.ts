import { describe, expect, it } from 'bun:test';
import {
	buildAuthAddArgs,
	buildAuthListArgs,
	buildAuthRemoveArgs,
	buildGenJsonArgs,
	buildAuthRemoveHelpArgs,
	buildAuthRotateArgs,
	buildAuthRotateHelpArgs,
	buildAuthTestArgs,
	buildAuthUseArgs,
	buildValidateArgs,
	buildVersionArgs,
	CLI_PACKAGE_NAME,
	checkForCliUpdate,
	DEFAULT_CLI_PATH,
	DEFAULT_INSTALL_COMMAND,
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

	it('builds profile-management arguments without shell syntax', () => {
		expect(buildAuthListArgs()).toEqual(['auth', 'list', '--json']);
		expect(buildAuthAddArgs({
			name: 'work',
			organizationUrl: 'https://dev.azure.com/acme',
			project: 'Product',
			team: 'Core',
		})).toEqual([
			'auth',
			'add',
			'work',
			'--org-url',
			'https://dev.azure.com/acme',
			'--project',
			'Product',
			'--team',
			'Core',
			'--pat-stdin',
		]);
		expect(buildAuthUseArgs('work')).toEqual(['auth', 'use', 'work']);
		expect(buildAuthTestArgs('work')).toEqual(['auth', 'test', 'work']);
		expect(buildAuthRotateArgs('work')).toEqual(['auth', 'rotate', 'work', '--pat-stdin']);
		expect(buildAuthRemoveArgs('work')).toEqual(['auth', 'remove', 'work', '--confirm']);
		expect(buildAuthRemoveHelpArgs()).toEqual(['auth', 'remove', '--help']);
		expect(buildAuthRotateHelpArgs()).toEqual(['auth', 'rotate', '--help']);
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

describe('buildGenJsonArgs', () => {
	it('builds gen --json arguments for live preview', () => {
		expect(buildGenJsonArgs('/templates/auth.atomize.yaml', '4821', 'work-ado')).toEqual([
			'gen', '/templates/auth.atomize.yaml', '--story', '4821', '--profile', 'work-ado', '--json',
		]);
	});
});
