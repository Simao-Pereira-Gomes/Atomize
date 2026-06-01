import { describe, expect, it } from 'bun:test';
import {
	buildAuthAddArgs,
	buildAuthListArgs,
	buildAuthRemoveArgs,
	buildAuthRemoveHelpArgs,
	buildAuthRotateArgs,
	buildAuthRotateHelpArgs,
	buildAuthTestArgs,
	buildAuthUseArgs,
	buildGenDryRunJsonArgs,
	buildGenExecuteJsonArgs,
	buildLivePreviewArgs,
	buildValidateArgs,
	buildVersionArgs,
	CLI_MINIMUM_VERSION,
	CLI_PACKAGE_NAME,
	checkForCliUpdate,
	DEFAULT_CLI_PATH,
	DEFAULT_INSTALL_COMMAND,
	extractAnySemver,
	extractStableSemver,
	hasNewerStableVersion,
	isUpdateCheckEligible,
	meetsCliFeatureRequirements,
	normalizeCliPath,
	normalizeInstallCommand,
	resolveCliExecutable,
	UPDATE_CHECK_TTL_MS,
} from '../cli/cli-provider.js';
import { buildExtendedEnv } from '../cli/env-utils.js';

describe('cli-provider', () => {
	it('uses atomize when no CLI path is configured', () => {
		expect(normalizeCliPath(undefined)).toBe(DEFAULT_CLI_PATH);
		expect(normalizeCliPath('   ')).toBe(DEFAULT_CLI_PATH);
	});

	it('preserves a configured executable path', () => {
		expect(normalizeCliPath('/Users/me/bin/atomize-dev')).toBe('/Users/me/bin/atomize-dev');
	});

	it('resolves Windows npm .cmd shims from PATH', () => {
		const existing = new Set(['C:\\Users\\me\\AppData\\Roaming\\npm\\atomize.cmd']);
		const resolved = resolveCliExecutable('atomize', {
			platform: 'win32',
			env: {
				Path: 'C:\\Users\\me\\AppData\\Roaming\\npm;C:\\Windows\\System32',
				PATHEXT: '.COM;.EXE;.BAT;.CMD',
			},
			exists: path => existing.has(path),
		});

		expect(resolved).toBe('C:\\Users\\me\\AppData\\Roaming\\npm\\atomize.cmd');
	});

	it('resolves explicit Windows CLI paths to a .cmd shim when that is what exists', () => {
		const resolved = resolveCliExecutable('C:\\tools\\atomize', {
			platform: 'win32',
			env: { PATHEXT: '.EXE;.CMD' },
			exists: path => path === 'C:\\tools\\atomize.cmd',
		});

		expect(resolved).toBe('C:\\tools\\atomize.cmd');
	});

	it('leaves non-Windows CLI resolution unchanged', () => {
		expect(resolveCliExecutable('atomize', {
			platform: 'darwin',
			env: { PATH: '/opt/bin' },
			exists: () => true,
		})).toBe('atomize');
	});

	it('preserves the existing Windows Path key when extending the environment', () => {
		const env = buildExtendedEnv({
			USERPROFILE: 'C:\\Users\\me',
			Path: 'C:\\Windows\\System32',
		}, 'win32');

		expect(env.PATH).toBeUndefined();
		expect(env.Path).toContain('C:\\Windows\\System32');
		expect(env.Path).not.toContain('/bin:C:\\Windows\\System32');
	});

	it('includes the Windows npm global bin in the extended environment so the extension host can find .cmd shims', () => {
		const env = buildExtendedEnv({
			USERPROFILE: 'C:\\Users\\me',
			APPDATA: 'C:\\Users\\me\\AppData\\Roaming',
			Path: 'C:\\Windows\\System32',
		}, 'win32');

		expect(env.Path).toContain('C:\\Users\\me\\AppData\\Roaming\\npm');
	});

	it('falls back to USERPROFILE-derived AppData path when APPDATA env is absent', () => {
		const env = buildExtendedEnv({
			USERPROFILE: 'C:\\Users\\me',
			Path: 'C:\\Windows\\System32',
		}, 'win32');

		expect(env.Path).toContain('C:\\Users\\me\\AppData\\Roaming\\npm');
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

	it('extracts any valid semver including prereleases', () => {
		expect(extractAnySemver('2.0.1')).toBe('2.0.1');
		expect(extractAnySemver('2.0.1-beta.1')).toBe('2.0.1-beta.1');
		expect(extractAnySemver('atomize 2.0.1-rc.3')).toBe('2.0.1-rc.3');
		expect(extractAnySemver('not a version')).toBeUndefined();
		expect(extractAnySemver(undefined)).toBeUndefined();
	});

	it('meets CLI feature requirements for parseable versions at or above minimum', () => {
		expect(meetsCliFeatureRequirements(CLI_MINIMUM_VERSION)).toBe(true);
		expect(meetsCliFeatureRequirements('3.0.0')).toBe(true);
		expect(meetsCliFeatureRequirements('2.1.0-beta.1')).toBe(true);
		expect(meetsCliFeatureRequirements('2.0.0')).toBe(false);
		expect(meetsCliFeatureRequirements('1.9.9')).toBe(false);
		expect(meetsCliFeatureRequirements('2.0.1-beta.1')).toBe(false);
	});

	it('lets unparseable versions through feature requirements check', () => {
		expect(meetsCliFeatureRequirements(undefined)).toBe(true);
		expect(meetsCliFeatureRequirements('dev')).toBe(true);
		expect(meetsCliFeatureRequirements('')).toBe(true);
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

describe('buildLivePreviewArgs', () => {
	it('builds gen --json --story arguments for live preview', () => {
		expect(buildLivePreviewArgs('/templates/auth.atomize.yaml', '4821', 'work-ado')).toEqual([
			'gen', '/templates/auth.atomize.yaml', '--story', '4821', '--profile', 'work-ado', '--json',
		]);
	});
});

describe('buildGenDryRunJsonArgs', () => {
	it('builds gen --json arguments without --story or --execute', () => {
		expect(buildGenDryRunJsonArgs('/templates/auth.atomize.yaml', 'work-ado')).toEqual([
			'gen', '/templates/auth.atomize.yaml', '--profile', 'work-ado', '--json',
		]);
	});
});

describe('buildGenExecuteJsonArgs', () => {
	it('builds gen --json-stream --execute --auto-approve arguments', () => {
		expect(buildGenExecuteJsonArgs('/templates/auth.atomize.yaml', 'work-ado', false)).toEqual([
			'gen', '/templates/auth.atomize.yaml', '--profile', 'work-ado', '--json-stream', '--execute', '--auto-approve',
		]);
	});

	it('appends --continue-on-error when continueOnError is true', () => {
		expect(buildGenExecuteJsonArgs('/templates/auth.atomize.yaml', 'work-ado', true)).toEqual([
			'gen', '/templates/auth.atomize.yaml', '--profile', 'work-ado', '--json-stream', '--execute', '--auto-approve', '--continue-on-error',
		]);
	});
});
