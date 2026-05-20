import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { note } from "@clack/prompts";
import chalk from "chalk";
import { gt, valid } from "semver";
import z from "zod";
import { isInteractiveTerminal } from "@/cli/utilities/prompt-utilities";

export const updateNotifierModeSchema = z.enum(["enabled", "disabled"]);

export type UpdateNotifierMode = z.infer<typeof updateNotifierModeSchema>;

export interface UpdateNotifierEnv {
	ATOMIZE_UPDATE_NOTIFIER?: UpdateNotifierMode | undefined;
}

export interface UpdateNotifierPackage {
  name: string;
  version: string;
}

interface UpdateCache {
  checkedAt: number;
  latestVersion: string;
  status: "success" | "failed";
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FAILED_CHECK_RETRY_MS = 60 * 60 * 1000;
const REGISTRY_TIMEOUT_MS = 500;

const semverStringSchema = z.string().transform((value, ctx) => {
  const parsed = valid(value);
  if (!parsed) {
    ctx.addIssue({
      code: "custom",
      message: "Expected a valid semantic version",
    });
    return z.NEVER;
  }
  return parsed;
});

const updateCacheSchema = z
  .object({
    checkedAt: z.number().int().nonnegative(),
    latestVersion: semverStringSchema,
    status: z.enum(["success", "failed"]),
  })
  .strict();

const registryLatestSchema = z.looseObject({
  version: semverStringSchema,
});

type FetchLatestVersion = (
  packageName: string,
  signal: AbortSignal,
) => Promise<string | null>;
type RegistryFetch = (input: string, init: RequestInit) => Promise<Response>;

interface UpdateNotifierDependencies {
  env?: UpdateNotifierEnv | undefined;
  now?: (() => number) | undefined;
  isInteractive?: (() => boolean) | undefined;
  cacheFilePath?: string | undefined;
  readCache?: ((filePath: string) => UpdateCache | null) | undefined;
  writeCache?: ((filePath: string, data: UpdateCache) => void) | undefined;
  fetchLatestVersion?: FetchLatestVersion | undefined;
  notify?:
    | ((pkg: UpdateNotifierPackage, latestVersion: string) => void)
    | undefined;
  registryTimeoutMs?: number | undefined;
}

export function resolveUpdateNotifierMode(
	env: UpdateNotifierEnv | undefined,
): UpdateNotifierMode {
	return env?.ATOMIZE_UPDATE_NOTIFIER ?? "enabled";
}

export function parseUpdateNotifierEnv(env: NodeJS.ProcessEnv): UpdateNotifierEnv {
	const parsed = updateNotifierModeSchema.safeParse(env.ATOMIZE_UPDATE_NOTIFIER);
	return parsed.success ? { ATOMIZE_UPDATE_NOTIFIER: parsed.data } : {};
}

export function isVersionNewer(current: string, latest: string): boolean {
  const parsedCurrent = valid(current);
  const parsedLatest = valid(latest);
  if (!parsedCurrent || !parsedLatest) {
    return false;
  }
  return gt(parsedLatest, parsedCurrent);
}

function isUpdateCacheStale(cache: UpdateCache | null, now: number): boolean {
  if (!cache) return true;
  const ttlMs = cache.status === "failed" ? FAILED_CHECK_RETRY_MS : CACHE_TTL_MS;
  return now - cache.checkedAt > ttlMs;
}

function getCacheFilePath(): string {
  const configDir =
    process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  return path.join(configDir, "atomize", "update-check.json");
}

export function readUpdateCache(filePath: string): UpdateCache | null {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsedJson: unknown = JSON.parse(raw);
    const parsedCache = updateCacheSchema.safeParse(parsedJson);
    return parsedCache.success ? parsedCache.data : null;
  } catch {
    return null;
  }
}

export function writeUpdateCache(filePath: string, data: UpdateCache): void {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data), "utf8");
  } catch {
    // do nothing since is a non-critical background operation
  }
}

export async function fetchLatestVersion(
  packageName: string,
  signal: AbortSignal,
  fetchImpl: RegistryFetch = fetch,
): Promise<string | null> {
  try {
    const encodedPackageName = encodeURIComponent(packageName);
    const response = await fetchImpl(
      `https://registry.npmjs.org/${encodedPackageName}/latest`,
      {
        signal,
      },
    );
    if (!response.ok) return null;
    const data: unknown = await response.json();
    const parsed = registryLatestSchema.safeParse(data);
    return parsed.success ? parsed.data.version : null;
  } catch {
    return null;
  }
}

function showUpdateNotification(
  pkg: UpdateNotifierPackage,
  latestVersion: string,
): void {
  note(
    `${chalk.dim("current:")} ${chalk.red(pkg.version)}  ->  ${chalk.dim("latest:")} ${chalk.green(latestVersion)}\n` +
      `Run ${chalk.cyan(`npm i -g ${pkg.name}`)} to update`,
    chalk.yellow("Update available"),
  );
}

async function fetchLatestVersionWithTimeout(
  packageName: string,
  fetchVersion: FetchLatestVersion,
  timeoutMs: number,
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchVersion(packageName, controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

export async function runUpdateNotifier(
  pkg: UpdateNotifierPackage,
  dependencies: UpdateNotifierDependencies = {},
): Promise<void> {
	const mode = resolveUpdateNotifierMode(dependencies.env );

  if (mode === "disabled") return;
  const interactive = dependencies.isInteractive ?? isInteractiveTerminal;
  if (!interactive()) return;

  const now = dependencies.now ?? Date.now;
  const notify = dependencies.notify ?? showUpdateNotification;
  const readCache = dependencies.readCache ?? readUpdateCache;
  const writeCache = dependencies.writeCache ?? writeUpdateCache;
  const fetchVersion = dependencies.fetchLatestVersion ?? fetchLatestVersion;
  const cacheFilePath = dependencies.cacheFilePath ?? getCacheFilePath();
  const cache = readCache(cacheFilePath);
  const currentTime = now();

  const isStale = isUpdateCacheStale(cache, currentTime);
  if (!isStale) {
    if (cache?.status === "success" && isVersionNewer(pkg.version, cache.latestVersion)) {
      notify(pkg, cache.latestVersion);
    }
    return;
  }

	const latestVersion = await fetchLatestVersionWithTimeout(
		pkg.name,
		fetchVersion,
		dependencies.registryTimeoutMs ?? REGISTRY_TIMEOUT_MS,
	);
	if (latestVersion) {
		writeCache(cacheFilePath, { checkedAt: currentTime, latestVersion, status: "success" });
		if (isVersionNewer(pkg.version, latestVersion)) {
			notify(pkg, latestVersion);
		}
		return;
	}

	const currentVersion = valid(pkg.version);
	if (cache) {
		writeCache(cacheFilePath, { ...cache, checkedAt: currentTime, status: "failed" });
	} else if (currentVersion) {
		writeCache(cacheFilePath, {
			checkedAt: currentTime,
			latestVersion: currentVersion,
			status: "failed",
		});
	}
}
