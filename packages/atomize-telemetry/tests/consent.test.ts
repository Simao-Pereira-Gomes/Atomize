import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createConsentReader, type EnvOverrideName, envOverride, markNudged, readConsent, resolveConsent, retireAnonymousId, setConsent } from "../src/index";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let dir: string;
let path: string;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "atomize-telemetry-"));
	path = join(dir, ".atomize", "telemetry.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("consent file", () => {
	test("a missing file reads as undecided", () => {
		expect(readConsent(path).enabled).toBeUndefined();
	});

	test.each(["not json", "[]", '{"version":2,"enabled":true}', '{"version":1,"enabled":"yes"}', '{"enabled":true}'])(
		"unusable content %s reads as undecided and does not throw",
		(content) => {
			writeFileSync(join(dir, "bad.json"), content);
			expect(readConsent(join(dir, "bad.json")).enabled).toBeUndefined();
		},
	);

	test("enabling creates a UUID v4 Anonymous ID and a decision time", () => {
		const state = setConsent(true, { path });
		expect(state.enabled).toBe(true);
		expect(state.anonymousId).toMatch(UUID_V4);
		expect(state.decidedAt).toBeDefined();
		expect(readConsent(path)).toEqual(state);
	});

	test("the Anonymous ID survives a disable and re-enable cycle", () => {
		const first = setConsent(true, { path }).anonymousId;
		expect(setConsent(false, { path })).toMatchObject({ enabled: false, anonymousId: first });
		expect(setConsent(true, { path }).anonymousId).toBe(first);
	});

	test("retiring the Anonymous ID disables telemetry, and a later enable creates a new ID", () => {
		const first = setConsent(true, { path }).anonymousId;
		expect(retireAnonymousId({ path })).toMatchObject({ enabled: false, anonymousId: undefined });
		expect(JSON.parse(readFileSync(path, "utf8"))).not.toHaveProperty("anonymousId");
		const second = setConsent(true, { path }).anonymousId;
		expect(second).toMatch(UUID_V4);
		expect(second).not.toBe(first);
	});

	test("retiring the Anonymous ID keeps other surfaces' fields", () => {
		setConsent(true, { path });
		markNudged("vscode", { path });
		expect(retireAnonymousId({ path }).nudged).toEqual({ vscode: true });
	});

	test("disabling while undecided records the decision without inventing an ID", () => {
		expect(setConsent(false, { path })).toMatchObject({ enabled: false, anonymousId: undefined });
	});

	test("writes merge into what another surface wrote, including unknown fields", () => {
		setConsent(true, { path });
		const raw = JSON.parse(readFileSync(path, "utf8"));
		writeFileSync(path, JSON.stringify({ ...raw, nudged: { vscode: true }, futureField: 7 }));
		markNudged("cli", { path });
		const after = JSON.parse(readFileSync(path, "utf8"));
		expect(after.nudged).toEqual({ vscode: true, cli: true });
		expect(after.futureField).toBe(7);
		expect(after.enabled).toBe(true);
	});

	test("a nudge does not count as a decision", () => {
		markNudged("cli", { path });
		expect(readConsent(path)).toMatchObject({ enabled: undefined, nudged: { cli: true } });
	});

	test("a malformed file is replaced rather than crashing a write", () => {
		setConsent(true, { path });
		writeFileSync(path, "{broken");
		expect(setConsent(true, { path }).enabled).toBe(true);
	});
});

describe("env overrides", () => {
	test.each([
		[{ ATOMIZE_TELEMETRY: "0" }, "ATOMIZE_TELEMETRY"],
		[{ ATOMIZE_TELEMETRY: "false" }, "ATOMIZE_TELEMETRY"],
		[{ ATOMIZE_TELEMETRY: "OFF" }, "ATOMIZE_TELEMETRY"],
		[{ DO_NOT_TRACK: "1" }, "DO_NOT_TRACK"],
	])("%o forces telemetry off", (env, name) => {
		expect(envOverride(env)).toBe(name as EnvOverrideName);
		expect(resolveConsent(setConsent(true, { path }), env).enabled).toBe(false);
	});

	test.each([{ ATOMIZE_TELEMETRY: "1" }, { ATOMIZE_TELEMETRY: "true" }, { DO_NOT_TRACK: "0" }, {}])(
		"%o is not an override and can never enable",
		(env) => {
			expect(envOverride(env)).toBeUndefined();
			expect(resolveConsent(readConsent(join(dir, "absent.json")), env).enabled).toBe(false);
		},
	);
});

describe("send-time reader", () => {
	test("re-reads only when the file changes", () => {
		setConsent(true, { path });
		const reader = createConsentReader(path);
		expect(reader.read().enabled).toBe(true);

		// Same mtime and size: a different payload is not noticed, proving no re-read happened.
		const original = readFileSync(path, "utf8");
		const stats = { atime: new Date(1_000_000), mtime: new Date(1_000_000) };
		utimesSync(path, stats.atime, stats.mtime);
		const stale = createConsentReader(path);
		expect(stale.read().enabled).toBe(true);
		writeFileSync(path, original.replace("true", "fals"));
		utimesSync(path, stats.atime, stats.mtime);
		expect(stale.read().enabled).toBe(true);
	});

	test("picks up a disable written by another process", () => {
		setConsent(true, { path });
		const reader = createConsentReader(path);
		expect(reader.read().enabled).toBe(true);
		setConsent(false, { path });
		expect(reader.read().enabled).toBe(false);
	});

	test("a deleted file reads as undecided", () => {
		setConsent(true, { path });
		const reader = createConsentReader(path);
		reader.read();
		rmSync(path);
		expect(reader.read().enabled).toBeUndefined();
	});
});
