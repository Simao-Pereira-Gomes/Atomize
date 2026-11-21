import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTelemetryClient, setConsent, type TelemetryEventInput } from "../src/index";

const event: TelemetryEventInput = {
	event: "command_finished",
	action: "generate",
	outcome: "success",
	durationMs: 120,
	mode: "dry-run",
	output: "human",
	continueOnError: false,
	storyCount: 2,
	taskCount: 6,
	failedStoryCount: 0,
};

let dir: string;
let consentPath: string;
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), "atomize-telemetry-client-"));
	consentPath = join(dir, "telemetry.json");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function setup(overrides: { env?: Record<string, string | undefined>; projectKey?: string; fetch?: typeof fetch } = {}) {
	const fetchMock = mock(async () => new Response("{}"));
	const client = createTelemetryClient({
		surface: "cli",
		atomizeVersion: "5.3.0",
		projectKey: overrides.projectKey ?? "phc_test",
		consentPath,
		env: overrides.env ?? {},
		fetch: overrides.fetch ?? (fetchMock as unknown as typeof fetch),
	});
	return { client, fetchMock };
}

describe("zero network calls", () => {
	test("while undecided", async () => {
		const { client, fetchMock } = setup();
		client.track(event);
		await client.flush(50);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test("while disabled", async () => {
		setConsent(true, { path: consentPath });
		setConsent(false, { path: consentPath });
		const { client, fetchMock } = setup();
		client.track(event);
		await client.flush(50);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test.each<Record<string, string>>([{ ATOMIZE_TELEMETRY: "0" }, { DO_NOT_TRACK: "1" }])("while overridden by %o", async (env) => {
		setConsent(true, { path: consentPath });
		const { client, fetchMock } = setup({ env });
		client.track(event);
		await client.flush(50);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test("with the placeholder empty project key", async () => {
		setConsent(true, { path: consentPath });
		const { client, fetchMock } = setup({ projectKey: "" });
		client.track(event);
		await client.flush(50);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test("after another process disables telemetry", async () => {
		setConsent(true, { path: consentPath });
		const { client, fetchMock } = setup();
		client.track(event);
		await client.flush(50);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		setConsent(false, { path: consentPath });
		client.track(event);
		await client.flush(50);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});
});

describe("when enabled", () => {
	test("posts one personless, geoip-disabled event to the EU endpoint", async () => {
		const state = setConsent(true, { path: consentPath });
		const { client, fetchMock } = setup();
		client.track(event);
		await client.flush(50);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe("https://eu.i.posthog.com/capture/");
		const body = JSON.parse(init.body as string);
		expect(body).toMatchObject({ api_key: "phc_test", event: "command_finished", distinct_id: state.anonymousId });
		expect(body.properties).toMatchObject({
			$process_person_profile: false,
			$geoip_disable: true,
			surface: "cli",
			action: "generate",
			storyCount: 2,
		});
		expect(body.properties.anonymousId).toBeUndefined();
	});

	test("drops an event that fails the schema instead of sending it", async () => {
		setConsent(true, { path: consentPath });
		const { client, fetchMock } = setup();
		client.track({ ...event, storyCount: -1 } as TelemetryEventInput);
		client.track({ ...event, mode: "free text" } as unknown as TelemetryEventInput);
		await client.flush(50);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test("swallows a failing fetch", async () => {
		setConsent(true, { path: consentPath });
		const { client } = setup({ fetch: (async () => Promise.reject(new Error("boom"))) as unknown as typeof fetch });
		expect(() => client.track(event)).not.toThrow();
		await client.flush(50);
	});

	test("flush gives up after its cap when PostHog hangs", async () => {
		setConsent(true, { path: consentPath });
		const { client } = setup({ fetch: (() => new Promise(() => {})) as unknown as typeof fetch });
		client.track(event);
		const started = Date.now();
		await client.flush(100);
		expect(Date.now() - started).toBeLessThan(400);
	});

	test("flush returns immediately when nothing is in flight", async () => {
		const { client } = setup();
		const started = Date.now();
		await client.flush(300);
		expect(Date.now() - started).toBeLessThan(50);
	});
});

describe("deletion request", () => {
	test("is sent even when telemetry is disabled or overridden", async () => {
		setConsent(true, { path: consentPath });
		setConsent(false, { path: consentPath });
		const { client, fetchMock } = setup({ env: { DO_NOT_TRACK: "1" } });
		expect(client.requestDeletion()).toBe(true);
		await client.flush(50);
		const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
		expect(JSON.parse(init.body as string).event).toBe("telemetry_deletion_requested");
	});

	test("sends nothing when there is no Anonymous ID to name", async () => {
		const { client, fetchMock } = setup();
		expect(client.requestDeletion()).toBe(false);
		await client.flush(50);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
