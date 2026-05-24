import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	fetchLatestVersion,
	isVersionNewer,
	parseUpdateNotifierEnv,
	readUpdateCache,
	resolveUpdateNotifierMode,
	runUpdateNotifier,
	type UpdateNotifierPackage,
} from "@/cli/update-notifier";

const pkg: UpdateNotifierPackage = {
	name: "@sppg2001/atomize",
	version: "1.2.3",
};

let temporaryDirectories: string[] = [];

afterEach(() => {
	for (const directory of temporaryDirectories) {
		rmSync(directory, { recursive: true, force: true });
	}
	temporaryDirectories = [];
});

function createTemporaryDirectory(): string {
	const directory = mkdtempSync(join(tmpdir(), "atomize-update-notifier-"));
	temporaryDirectories.push(directory);
	return directory;
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

type TestFetch = (input: string, init: RequestInit) => Promise<Response>;

describe("resolveUpdateNotifierMode", () => {
	test("uses enabled mode by default", () => {
		expect(resolveUpdateNotifierMode({})).toBe("enabled");
	});

	test("uses explicit enabled mode", () => {
		expect(resolveUpdateNotifierMode({ ATOMIZE_UPDATE_NOTIFIER: "enabled" })).toBe("enabled");
	});

	test("uses explicit disabled mode", () => {
		expect(resolveUpdateNotifierMode({ ATOMIZE_UPDATE_NOTIFIER: "disabled" })).toBe("disabled");
	});

});

describe("parseUpdateNotifierEnv", () => {
	test("returns a typed notifier mode for valid raw environment values", () => {
		expect(parseUpdateNotifierEnv({ ATOMIZE_UPDATE_NOTIFIER: "disabled" })).toEqual({
			ATOMIZE_UPDATE_NOTIFIER: "disabled",
		});
	});

	test("drops invalid raw environment values", () => {
		expect(parseUpdateNotifierEnv({ ATOMIZE_UPDATE_NOTIFIER: "false" })).toEqual({});
	});
});

describe("isVersionNewer", () => {
	test("detects a newer major version", () => {
		expect(isVersionNewer("1.2.3", "2.0.0")).toBe(true);
	});

	test("detects a newer minor version", () => {
		expect(isVersionNewer("1.2.3", "1.3.0")).toBe(true);
	});

	test("detects a newer patch version", () => {
		expect(isVersionNewer("1.2.3", "1.2.4")).toBe(true);
	});

	test("returns false when versions are equal", () => {
		expect(isVersionNewer("1.2.3", "1.2.3")).toBe(false);
	});

	test("returns false when latest is older", () => {
		expect(isVersionNewer("1.2.3", "1.2.2")).toBe(false);
		expect(isVersionNewer("2.0.0", "1.9.9")).toBe(false);
	});

	test("handles prerelease precedence", () => {
		expect(isVersionNewer("1.2.3-beta.1", "1.2.3")).toBe(true);
		expect(isVersionNewer("1.2.3", "1.2.4-beta.1")).toBe(true);
		expect(isVersionNewer("1.2.3", "1.2.3-beta.1")).toBe(false);
	});

	test("handles versions with a leading v prefix", () => {
		expect(isVersionNewer("v1.2.3", "v1.2.4")).toBe(true);
		expect(isVersionNewer("v1.2.3", "v1.2.3")).toBe(false);
	});

	test("returns false for invalid versions", () => {
		expect(isVersionNewer("1.2.3", "latest")).toBe(false);
		expect(isVersionNewer("current", "1.2.4")).toBe(false);
	});
});

describe("readUpdateCache", () => {
	test("returns parsed cache when the file shape is valid", () => {
		const cacheFilePath = join(createTemporaryDirectory(), "update-check.json");
		writeFileSync(
			cacheFilePath,
			JSON.stringify({ checkedAt: 1000, latestVersion: "v1.2.4", status: "success" }),
		);

		expect(readUpdateCache(cacheFilePath)).toEqual({
			checkedAt: 1000,
			latestVersion: "1.2.4",
			status: "success",
		});
	});

	test("returns null for invalid or corrupt cache files", () => {
		const directory = createTemporaryDirectory();
		const corruptCachePath = join(directory, "corrupt.json");
		const wrongShapeCachePath = join(directory, "wrong-shape.json");
		writeFileSync(corruptCachePath, "{");
		writeFileSync(wrongShapeCachePath, JSON.stringify({ checkedAt: 1000, latestVersion: 123 }));

		expect(readUpdateCache(corruptCachePath)).toBeNull();
		expect(readUpdateCache(wrongShapeCachePath)).toBeNull();
		expect(readUpdateCache(join(directory, "missing.json"))).toBeNull();
	});
});

describe("fetchLatestVersion", () => {
	test("fetches the npm latest endpoint and validates the version", async () => {
		let requestedUrl: string | undefined;
		const fetchImpl: TestFetch = async (input) => {
			requestedUrl = String(input);
			return jsonResponse({ version: "v1.2.4" });
		};

		const latestVersion = await fetchLatestVersion(
			"@sppg2001/atomize",
			new AbortController().signal,
			fetchImpl,
		);

		expect(requestedUrl).toBe("https://registry.npmjs.org/%40sppg2001%2Fatomize/latest");
		expect(latestVersion).toBe("1.2.4");
	});

	test("returns null for failed or invalid registry responses", async () => {
		const failedFetch: TestFetch = async () => jsonResponse({ version: "1.2.4" }, 500);
		const invalidFetch: TestFetch = async () => jsonResponse({ version: "latest" });

		await expect(
			fetchLatestVersion("atomize", new AbortController().signal, failedFetch),
		).resolves.toBeNull();
		await expect(
			fetchLatestVersion("atomize", new AbortController().signal, invalidFetch),
		).resolves.toBeNull();
	});
});

describe("runUpdateNotifier", () => {
	test("does nothing when disabled", async () => {
		let fetchCount = 0;
		let notifyCount = 0;

		await runUpdateNotifier(pkg, {
			env: { ATOMIZE_UPDATE_NOTIFIER: "disabled" },
			isInteractive: () => true,
			readCache: () => ({ checkedAt: 0, latestVersion: "1.2.4", status: "success" }),
			fetchLatestVersion: async () => {
				fetchCount += 1;
				return "1.2.5";
			},
			notify: () => {
				notifyCount += 1;
			},
		});

		expect(fetchCount).toBe(0);
		expect(notifyCount).toBe(0);
	});

	test("does nothing outside an interactive terminal", async () => {
		let fetchCount = 0;

		await runUpdateNotifier(pkg, {
			isInteractive: () => false,
			fetchLatestVersion: async () => {
				fetchCount += 1;
				return "1.2.4";
			},
		});

		expect(fetchCount).toBe(0);
	});

	test("shows a cached update without refreshing a fresh cache", async () => {
		const notifications: string[] = [];
		let fetchCount = 0;

		await runUpdateNotifier(pkg, {
			now: () => 24 * 60 * 60 * 1000,
			isInteractive: () => true,
			readCache: () => ({
				checkedAt: 24 * 60 * 60 * 1000 - 1,
				latestVersion: "1.2.4",
				status: "success",
			}),
			fetchLatestVersion: async () => {
				fetchCount += 1;
				return "1.2.5";
			},
			notify: (_pkg, latestVersion) => {
				notifications.push(latestVersion);
			},
		});

		expect(notifications).toEqual(["1.2.4"]);
		expect(fetchCount).toBe(0);
	});

	test("refreshes a stale cache and notifies with the refreshed latest version", async () => {
		const notifications: string[] = [];
		let writtenCache:
			| { checkedAt: number; latestVersion: string; status: "success" | "failed" }
			| undefined;

		await runUpdateNotifier(pkg, {
			now: () => 2 * 24 * 60 * 60 * 1000,
			isInteractive: () => true,
			readCache: () => ({ checkedAt: 0, latestVersion: "1.2.4", status: "success" }),
			fetchLatestVersion: async () => "1.2.5",
			notify: (_pkg, latestVersion) => {
				notifications.push(latestVersion);
			},
			writeCache: (_filePath, data) => {
				writtenCache = data;
			},
			registryTimeoutMs: 10,
		});

		expect(writtenCache).toEqual({
			checkedAt: 2 * 24 * 60 * 60 * 1000,
			latestVersion: "1.2.5",
			status: "success",
		});
		expect(notifications).toEqual(["1.2.5"]);
	});

	test("records failed refresh attempts to avoid retrying on every command", async () => {
		let writtenCache:
			| { checkedAt: number; latestVersion: string; status: "success" | "failed" }
			| undefined;

		await runUpdateNotifier(pkg, {
			now: () => 3000,
			isInteractive: () => true,
			readCache: () => null,
			fetchLatestVersion: async () => null,
			writeCache: (_filePath, data) => {
				writtenCache = data;
			},
			registryTimeoutMs: 10,
		});

		expect(writtenCache).toEqual({ checkedAt: 3000, latestVersion: "1.2.3", status: "failed" });
	});

	test("preserves cached latest version without notifying when stale refresh fails", async () => {
		const notifications: string[] = [];
		let writtenCache:
			| { checkedAt: number; latestVersion: string; status: "success" | "failed" }
			| undefined;

		await runUpdateNotifier(pkg, {
			now: () => 2 * 24 * 60 * 60 * 1000,
			isInteractive: () => true,
			readCache: () => ({ checkedAt: 0, latestVersion: "1.2.4", status: "success" }),
			fetchLatestVersion: async () => null,
			notify: (_pkg, latestVersion) => {
				notifications.push(latestVersion);
			},
			writeCache: (_filePath, data) => {
				writtenCache = data;
			},
			registryTimeoutMs: 10,
		});

		expect(writtenCache).toEqual({
			checkedAt: 2 * 24 * 60 * 60 * 1000,
			latestVersion: "1.2.4",
			status: "failed",
		});
		expect(notifications).toEqual([]);
	});

	test("retries failed checks after one hour instead of waiting a full day", async () => {
		let fetchCount = 0;

		await runUpdateNotifier(pkg, {
			now: () => 60 * 60 * 1000 + 1,
			isInteractive: () => true,
			readCache: () => ({ checkedAt: 0, latestVersion: "1.2.3", status: "failed" }),
			fetchLatestVersion: async () => {
				fetchCount += 1;
				return "1.2.4";
			},
			notify: () => {},
			registryTimeoutMs: 10,
		});

		expect(fetchCount).toBe(1);
	});

	test("does not notify from a fresh failed cache", async () => {
		const notifications: string[] = [];
		let fetchCount = 0;

		await runUpdateNotifier(pkg, {
			now: () => 60 * 60 * 1000 - 1,
			isInteractive: () => true,
			readCache: () => ({ checkedAt: 0, latestVersion: "1.2.4", status: "failed" }),
			fetchLatestVersion: async () => {
				fetchCount += 1;
				return "1.2.5";
			},
			notify: (_pkg, latestVersion) => {
				notifications.push(latestVersion);
			},
		});

		expect(fetchCount).toBe(0);
		expect(notifications).toEqual([]);
	});
});
