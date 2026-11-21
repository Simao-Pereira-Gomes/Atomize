import { describe, expect, mock, test } from "bun:test";
import { type DeletionConfig, main, processDeletions, readConfig } from "./process-telemetry-deletions";

const A = "3b241101-e2bb-4255-8caf-4136c566a962";
const B = "9d1f3c52-7a1e-4c1b-9a53-0d6a2f4e8b71";
const personUuid = (id: string) => `uuid-of-${id}`;

const config: DeletionConfig = {
	personalApiKey: "phx_secret",
	projectId: "123",
	projectKey: "phc_public",
	host: "https://eu.posthog.com",
	captureUrl: "https://eu.i.posthog.com/capture/",
};

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A scripted PostHog: which IDs have requested deletion, who has a person, whose deletion is recorded. */
function posthog(options: {
	requests: Array<[string, string?]>;
	recorded?: Set<string>;
	personAppears?: (id: string, polls: number) => boolean;
	override?: (url: URL, init: RequestInit) => Response | undefined;
}) {
	const calls: Array<{ method: string; path: string; body: unknown }> = [];
	const polls = new Map<string, number>();
	const captured = new Set<string>();
	const handler: Handler = (url, init) => {
		const body = init.body ? JSON.parse(init.body as string) : undefined;
		calls.push({ method: init.method ?? "GET", path: url.pathname, body });
		const overridden = options.override?.(url, init);
		if (overridden) return overridden;
		if (url.pathname.endsWith("/capture/")) {
			captured.add(body.distinct_id);
			return json({ status: 1 });
		}
		if (url.pathname.endsWith("/query/")) return json({ results: options.requests.map(([id, person]) => [id, person ?? personUuid(id)]) });
		if (url.pathname.endsWith("/persons/deletion_status/")) {
			const uuid = url.searchParams.get("person_uuid") as string;
			return json({ results: options.recorded?.has(uuid) ? [{ person_uuid: uuid, status: "pending", delete_verified_at: null }] : [] });
		}
		if (url.pathname.endsWith("/persons/")) {
			const id = url.searchParams.get("distinct_id") as string;
			const count = (polls.get(id) ?? 0) + 1;
			polls.set(id, count);
			const appears = captured.has(id) && (options.personAppears?.(id, count) ?? true);
			return json({ results: appears ? [{ id: "1", uuid: personUuid(id) }] : [] });
		}
		if (url.pathname.endsWith("/persons/bulk_delete/")) return json({ persons_found: 1, persons_queued_for_deletion: 1, deletion_errors: [] }, 202);
		return json({}, 404);
	};
	const fetchMock = mock(async (input: string | URL | Request, init?: RequestInit) => handler(new URL(String(input)), init ?? {}));
	return { fetchMock: fetchMock as unknown as typeof fetch, calls };
}

const quietDeps = (fetchImpl: typeof fetch) => {
	const lines: string[] = [];
	return { lines, deps: { fetch: fetchImpl, sleep: async () => {}, log: (line: string) => void lines.push(line), personPolls: 3 } };
};

describe("a new Deletion Request", () => {
	test("runs the full flow: $set, wait for the person, bulk delete with events", async () => {
		const ph = posthog({ requests: [[A]] });
		const { deps, lines } = quietDeps(ph.fetchMock);
		const summary = await processDeletions(config, deps);

		expect(summary).toEqual({ new: 1, pending: 0, failed: 0, ignored: 0 });
		const steps = ph.calls.map((call) => call.path.replace(/^\/api\/projects\/123/, ""));
		expect(steps.indexOf("/capture/")).toBeLessThan(steps.lastIndexOf("/persons/"));
		expect(steps.lastIndexOf("/persons/")).toBeLessThan(steps.indexOf("/persons/bulk_delete/"));

		const capture = ph.calls.find((call) => call.path === "/capture/")?.body as { event: string; distinct_id: string; api_key: string };
		expect(capture).toMatchObject({ event: "$set", distinct_id: A, api_key: "phc_public" });
		const bulk = ph.calls.find((call) => call.path.endsWith("/persons/bulk_delete/"));
		expect(bulk?.body).toEqual({ distinct_ids: [A], delete_events: true });
		expect(lines).toEqual(["1 new, 0 pending, 0 failed"]);
	});

	test("waits for the person to appear before deleting", async () => {
		const ph = posthog({ requests: [[A]], personAppears: (_id, polls) => polls >= 4 });
		const { deps } = quietDeps(ph.fetchMock);
		const slept: number[] = [];
		const summary = await processDeletions(config, { ...deps, sleep: async (ms) => void slept.push(ms), personPolls: 5, personPollMs: 7 });
		expect(summary.new).toBe(1);
		expect(slept).toEqual([7, 7]);
	});
});

describe("an ID PostHog is already deleting", () => {
	test("is skipped and counted as pending, with nothing sent", async () => {
		const ph = posthog({ requests: [[A]], recorded: new Set([personUuid(A)]) });
		const { deps, lines } = quietDeps(ph.fetchMock);
		const summary = await processDeletions(config, deps);
		expect(summary).toEqual({ new: 0, pending: 1, failed: 0, ignored: 0 });
		expect(ph.calls.some((call) => call.path.endsWith("/capture/") || call.path.endsWith("/bulk_delete/"))).toBe(false);
		expect(lines).toEqual(["0 new, 1 pending, 0 failed"]);
	});

	test("is recognised by the person id its events were recorded under, even once the person is gone", async () => {
		const ph = posthog({ requests: [[A, "fake-person-uuid"]], recorded: new Set(["fake-person-uuid"]) });
		const { deps } = quietDeps(ph.fetchMock);
		expect((await processDeletions(config, deps)).pending).toBe(1);
	});

	test("mixes with new IDs in one run", async () => {
		const ph = posthog({ requests: [[A], [B]], recorded: new Set([personUuid(A)]) });
		const { deps, lines } = quietDeps(ph.fetchMock);
		await processDeletions(config, deps);
		expect(lines.at(-1)).toBe("1 new, 1 pending, 0 failed");
	});
});

describe("failures", () => {
	test("a person that never appears is reported as failed, and nothing is deleted", async () => {
		const ph = posthog({ requests: [[A]], personAppears: () => false });
		const { deps, lines } = quietDeps(ph.fetchMock);
		const summary = await processDeletions(config, deps);
		expect(summary.failed).toBe(1);
		expect(ph.calls.some((call) => call.path.endsWith("/bulk_delete/"))).toBe(false);
		expect(lines.at(-1)).toBe("0 new, 0 pending, 1 failed");
	});

	test("one failure does not stop the others", async () => {
		const ph = posthog({ requests: [[A], [B]], personAppears: (id) => id === B });
		const { deps } = quietDeps(ph.fetchMock);
		expect(await processDeletions(config, deps)).toMatchObject({ new: 1, failed: 1 });
	});

	test("a bulk delete that queues nothing is a failure", async () => {
		const ph = posthog({
			requests: [[A]],
			override: (url) => (url.pathname.endsWith("/bulk_delete/") ? json({ persons_queued_for_deletion: 0, deletion_errors: [{ person_uuid: "x", step: "y" }] }, 202) : undefined),
		});
		const { deps } = quietDeps(ph.fetchMock);
		expect((await processDeletions(config, deps)).failed).toBe(1);
	});

	test("an ID that is not an Anonymous ID is ignored, never acted on", async () => {
		const ph = posthog({ requests: [["someone@example.com"], ["not-a-uuid"]] });
		const { deps, lines } = quietDeps(ph.fetchMock);
		expect(await processDeletions(config, deps)).toEqual({ new: 0, pending: 0, failed: 0, ignored: 2 });
		expect(ph.calls.some((call) => call.path.endsWith("/capture/") || call.path.endsWith("/bulk_delete/"))).toBe(false);
		expect(lines.at(-1)).toBe("0 new, 0 pending, 0 failed, 2 ignored");
	});
});

describe("main and exit codes", () => {
	// The packaged project key is an empty placeholder until release, so these tests supply one.
	const env = { POSTHOG_PERSONAL_API_KEY: "phx_secret", POSTHOG_PROJECT_ID: "123", POSTHOG_PROJECT_API_KEY: "phc_public" };

	test("missing secrets fail clearly, naming what is missing and nothing else", async () => {
		const lines: string[] = [];
		expect(await main({}, { log: (line) => void lines.push(line) })).toBe(1);
		expect(lines.join("\n")).toContain("POSTHOG_PERSONAL_API_KEY");
		expect(lines.join("\n")).toContain("POSTHOG_PROJECT_ID");
	});

	test("an empty project key is refused with a clear message instead of passing silently", async () => {
		expect(() => readConfig({ POSTHOG_PERSONAL_API_KEY: "k", POSTHOG_PROJECT_ID: "1" }, "")).toThrow(/project key/);
		expect(readConfig({ POSTHOG_PERSONAL_API_KEY: "k", POSTHOG_PROJECT_ID: "1" }, "phc_x").projectKey).toBe("phc_x");
	});

	test("an invalid project id is refused", () => {
		expect(() => readConfig({ ...env, POSTHOG_PROJECT_ID: "../evil" })).toThrow();
	});

	test.each([401, 500])("a PostHog API error (%i) exits non-zero without leaking an ID or key", async (status) => {
		const ph = posthog({ requests: [[A]], override: (url) => (url.pathname.endsWith("/query/") ? json({}, status) : undefined) });
		const lines: string[] = [];
		const code = await main(env, { fetch: ph.fetchMock, sleep: async () => {}, log: (line) => void lines.push(line) });
		expect(code).toBe(1);
		const output = lines.join("\n");
		expect(output).toContain(String(status));
		expect(output).not.toContain("phx_secret");
		expect(output).not.toContain(A);
	});

	test("a network failure exits non-zero", async () => {
		const lines: string[] = [];
		const code = await main(env, { fetch: (async () => { throw new Error(`boom for ${A}`); }) as unknown as typeof fetch, sleep: async () => {}, log: (line) => void lines.push(line) });
		expect(code).toBe(1);
		expect(lines.join("\n")).not.toContain(A);
	});
});

describe("output never contains a distinct ID", () => {
	test("across new, pending, failed and ignored requests", async () => {
		const ph = posthog({ requests: [[A], [B], ["junk-id"]], recorded: new Set([personUuid(B)]), personAppears: () => false });
		const { deps, lines } = quietDeps(ph.fetchMock);
		await processDeletions(config, deps);
		const output = lines.join("\n");
		for (const id of [A, B, "junk-id", personUuid(A), personUuid(B)]) expect(output).not.toContain(id);
	});
});

describe("the workflow", () => {
	test("runs only on a schedule (Thursday) and on dispatch, with secrets only for the script step", async () => {
		const { parse } = await import("yaml");
		const text = await Bun.file(new URL("../.github/workflows/telemetry-deletions.yml", import.meta.url)).text();
		const workflow = parse(text) as { on: Record<string, unknown>; jobs: Record<string, { steps: Array<{ env?: Record<string, string> }> }> };
		expect(Object.keys(workflow.on).sort()).toEqual(["schedule", "workflow_dispatch"]);
		expect((workflow.on.schedule as Array<{ cron: string }>)[0]?.cron.split(" ")[4]).toBe("4");
		const withSecrets = Object.values(workflow.jobs).flatMap((job) => job.steps).filter((step) => step.env);
		expect(withSecrets).toHaveLength(1);
		expect(Object.keys(withSecrets[0]?.env ?? {}).sort()).toEqual(["POSTHOG_PERSONAL_API_KEY", "POSTHOG_PROJECT_ID"]);
	});
});
