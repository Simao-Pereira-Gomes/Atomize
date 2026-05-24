import { spawn } from 'node:child_process';
import { gt, gte, prerelease, valid } from 'semver';
import { extendedEnv } from './env-utils.js';

export const CLI_EXIT_CODES = {
	AuthFailure: 3,
} as const;

export const DEFAULT_CLI_PATH = 'atomize';
export const DEFAULT_INSTALL_COMMAND = 'npm install -g @sppg2001/atomize';
export const CLI_PACKAGE_NAME = '@sppg2001/atomize';
export const UPDATE_CHECK_CACHE_KEY = 'atomize.cli.updateCheck';
export const UPDATE_CHECK_TTL_MS = 24 * 60 * 60 * 1000;
export const CLI_MINIMUM_VERSION = '2.0.1';

export interface CliUpdateCache {
	checkedAt: number;
	ok: boolean;
	latestVersion?: string;
}

export interface UpdateCheckOptions {
	cliPath: string;
	autoCheckUpdates: boolean;
	installedVersion: string | undefined;
	now: number;
	cache: CliUpdateCache | undefined;
	fetchLatestVersion: (packageName: string, signal: AbortSignal) => Promise<string>;
	timeoutMs?: number;
}

export interface UpdateCheckResult {
	cache: CliUpdateCache;
	latestVersion?: string;
	updateAvailable: boolean;
}

export function normalizeCliPath(value: unknown): string {
	if (typeof value !== 'string') return DEFAULT_CLI_PATH;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : DEFAULT_CLI_PATH;
}

export function normalizeInstallCommand(value: unknown): string {
	if (typeof value !== 'string') return DEFAULT_INSTALL_COMMAND;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : DEFAULT_INSTALL_COMMAND;
}

export function isDefaultCliPath(cliPath: string): boolean {
	return normalizeCliPath(cliPath) === DEFAULT_CLI_PATH;
}

export function buildValidateArgs(filePath: string, profile?: string): string[] {
	const args = ['validate', '--output', 'json'];
	if (profile) args.push('--profile', profile);
	args.push(filePath);
	return args;
}

export function buildVersionArgs(): string[] {
	return ['--version'];
}

export function buildInspectArgs(filePath: string): string[] {
	return ['preview', filePath, '--inspect'];
}

export function buildPreviewArgs(filePath: string, mockStory: string): string[] {
	return ['preview', filePath, '--mock-story', mockStory];
}

export function buildAuthListArgs(): string[] {
	return ['auth', 'list', '--json'];
}

export function buildAuthAddArgs(profile: {
	name: string;
	organizationUrl: string;
	project: string;
	team: string;
}): string[] {
	return [
		'auth',
		'add',
		profile.name,
		'--org-url',
		profile.organizationUrl,
		'--project',
		profile.project,
		'--team',
		profile.team,
		'--pat-stdin',
	];
}

export function buildAuthUseArgs(profileName: string): string[] {
	return ['auth', 'use', profileName];
}

export function buildAuthTestArgs(profileName: string): string[] {
	return ['auth', 'test', profileName];
}

export function buildAuthRotateArgs(profileName: string): string[] {
	return ['auth', 'rotate', profileName, '--pat-stdin'];
}

export function buildAuthRemoveArgs(profileName: string): string[] {
	return ['auth', 'remove', profileName, '--confirm'];
}

export function buildAuthRemoveHelpArgs(): string[] {
	return ['auth', 'remove', '--help'];
}

export function buildLivePreviewArgs(filePath: string, storyId: string, profile: string): string[] {
	return ['gen', filePath, '--story', storyId, '--profile', profile, '--json'];
}

export function buildGenDryRunJsonArgs(filePath: string, profile: string): string[] {
	return ['gen', filePath, '--profile', profile, '--json'];
}

export function buildGenExecuteJsonArgs(filePath: string, profile: string, continueOnError: boolean): string[] {
	const args = ['gen', filePath, '--profile', profile, '--json', '--execute', '--auto-approve'];
	if (continueOnError) args.push('--continue-on-error');
	return args;
}

export function buildAuthRotateHelpArgs(): string[] {
	return ['auth', 'rotate', '--help'];
}

export function extractAnySemver(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const match = value.match(/\b(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?\b/);
	if (!match) return undefined;
	return valid(match[0]) ?? undefined;
}

export function meetsCliFeatureRequirements(version: string | undefined): boolean {
	const parsed = extractAnySemver(version);
	if (!parsed) return true;
	return gte(parsed, CLI_MINIMUM_VERSION);
}

export function extractStableSemver(value: string | undefined): string | undefined {
	if (!value) return undefined;
	const match = value.match(/\b(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?\b/);
	if (!match) return undefined;
	const version = valid(match[0]);
	return isStableSemver(version) ? version : undefined;
}

export function isStableSemver(version: string | null | undefined): version is string {
	const parsed = valid(version);
	return Boolean(parsed && prerelease(parsed) === null);
}

export function isUpdateCheckEligible(
	cliPath: string,
	autoCheckUpdates: boolean,
	installedVersion: string | undefined,
): boolean {
	return isDefaultCliPath(cliPath) && autoCheckUpdates && isStableSemver(installedVersion);
}

export function isUpdateCacheFresh(cache: CliUpdateCache | undefined, now: number): boolean {
	return typeof cache?.checkedAt === 'number' && now - cache.checkedAt < UPDATE_CHECK_TTL_MS;
}

export function hasNewerStableVersion(installedVersion: string, latestVersion: string): boolean {
	return isStableSemver(installedVersion)
		&& isStableSemver(latestVersion)
		&& gt(latestVersion, installedVersion);
}

export async function fetchNpmLatestVersion(
	packageName: string,
	signal: AbortSignal,
	fetchImpl: typeof fetch = fetch,
): Promise<string> {
	const encodedName = encodeURIComponent(packageName);
	const response = await fetchImpl(`https://registry.npmjs.org/${encodedName}/latest`, {
		headers: { Accept: 'application/json' },
		signal,
	});
	if (!response.ok) {
		throw new Error(`npm registry returned HTTP ${response.status}`);
	}
	const data = await response.json() as { version?: unknown };
	if (typeof data.version !== 'string' || !isStableSemver(data.version)) {
		throw new Error('npm registry returned an unstable or invalid version');
	}
	return data.version;
}

export async function checkForCliUpdate(options: UpdateCheckOptions): Promise<UpdateCheckResult | undefined> {
	const installedVersion = extractStableSemver(options.installedVersion);
	if (!isUpdateCheckEligible(options.cliPath, options.autoCheckUpdates, installedVersion) || !installedVersion) {
		return undefined;
	}
	if (isUpdateCacheFresh(options.cache, options.now)) {
		return undefined;
	}

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 3000);
	try {
		const latestVersion = await options.fetchLatestVersion(CLI_PACKAGE_NAME, controller.signal);
		const stableLatest = extractStableSemver(latestVersion);
		if (!stableLatest) {
			const cache = { checkedAt: options.now, ok: false };
			return { cache, updateAvailable: false };
		}
		const cache = { checkedAt: options.now, ok: true, latestVersion: stableLatest };
		return {
			cache,
			latestVersion: stableLatest,
			updateAvailable: hasNewerStableVersion(installedVersion, stableLatest),
		};
	} catch {
		const cache = { checkedAt: options.now, ok: false };
		return { cache, updateAvailable: false };
	} finally {
		clearTimeout(timeout);
	}
}

export interface CliProbeResult {
	available: boolean;
	version?: string;
}

export function probeCli(cliPath: string): Promise<CliProbeResult> {
	return new Promise(resolve => {
		const proc = spawn(cliPath, buildVersionArgs(), { shell: false, env: extendedEnv() });
		let output = '';
		proc.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
		proc.stderr.on('data', (chunk: Buffer) => { output += chunk.toString(); });
		proc.on('close', code => resolve({ available: code === 0, version: output.trim() }));
		proc.on('error', () => resolve({ available: false }));
	});
}

