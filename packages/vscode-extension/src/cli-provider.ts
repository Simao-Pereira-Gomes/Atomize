import { gt, prerelease, valid } from 'semver';

export const DEFAULT_CLI_PATH = 'atomize';
export const DEFAULT_INSTALL_COMMAND = 'npm install -g @sppg2001/atomize';
export const CLI_PACKAGE_NAME = '@sppg2001/atomize';
export const UPDATE_CHECK_CACHE_KEY = 'atomize.cli.updateCheck';
export const UPDATE_CHECK_TTL_MS = 24 * 60 * 60 * 1000;

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
