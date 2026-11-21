#!/usr/bin/env bun
/**
 * Processes Telemetry Deletion Requests (ADR-0060, issue #351). Run weekly by
 * `.github/workflows/telemetry-deletions.yml`.
 *
 * Events are sent without person profiles, and PostHog can only delete events through a person,
 * so each request goes through PostHog's documented workaround for personless events:
 *   1. find `telemetry_deletion_requested` events, each naming one Anonymous ID;
 *   2. skip an ID whose deletion PostHog already has pending or completed (reusing a distinct ID
 *      mid-deletion misbehaves);
 *   3. send `$set` for the ID so a person exists, wait for that person to appear, then bulk delete
 *      its distinct ID with `delete_events: true`.
 *
 * Output is counts only (`N new, N pending, N failed`): an Anonymous ID is never printed, not even
 * in an error. Any failure, and any missing configuration, exits non-zero.
 *
 * Requests that arrive by email have no event, so their Anonymous IDs can be given in the optional
 * TELEMETRY_DELETION_IDS (comma or space separated); they go through the same checks and steps.
 * Run it locally only: the CI workflow deliberately has no input for it, because the repo is public
 * and a dispatch input shows on the run page.
 *
 * Env: POSTHOG_PERSONAL_API_KEY (person write and query read only), POSTHOG_PROJECT_ID. Optional:
 * POSTHOG_HOST (default https://eu.posthog.com), POSTHOG_CAPTURE_URL, and POSTHOG_PROJECT_API_KEY,
 * the public capture key, which otherwise comes from packages/atomize-telemetry.
 *
 *   bun scripts/process-telemetry-deletions.ts
 */
import { POSTHOG_CAPTURE_URL, POSTHOG_PROJECT_KEY } from "../packages/atomize-telemetry/src/client";
import { anonymousIdSchema } from "../packages/atomize-telemetry/src/events";

export interface DeletionConfig {
	personalApiKey: string;
	projectId: string;
	/** The public project key events are captured with; empty until release. */
	projectKey: string;
	host: string;
	captureUrl: string;
}

export interface DeletionDeps {
	fetch: typeof fetch;
	sleep: (ms: number) => Promise<void>;
	log: (line: string) => void;
	/** How many times to look for the person, and how long to wait between looks. */
	personPolls?: number;
	personPollMs?: number;
}

export interface DeletionSummary {
	new: number;
	pending: number;
	failed: number;
	ignored: number;
}

/** A request that failed, described without anything that could name an Anonymous ID. */
class StepError extends Error {}

/** Never more than PostHog's bulk delete allows in one run; the rest are picked up next week. */
const MAX_REQUESTS_PER_RUN = 500;
const DEFAULT_PERSON_POLLS = 12;
const DEFAULT_PERSON_POLL_MS = 10_000;

export function readConfig(env: Record<string, string | undefined>, packagedProjectKey: string = POSTHOG_PROJECT_KEY): DeletionConfig {
	const missing = ["POSTHOG_PERSONAL_API_KEY", "POSTHOG_PROJECT_ID"].filter((name) => !env[name]?.trim());
	if (missing.length > 0) throw new StepError(`Missing configuration: ${missing.join(", ")}. Set them as repository secrets.`);
	const projectKey = env.POSTHOG_PROJECT_API_KEY?.trim() || packagedProjectKey.trim();
	if (!projectKey) throw new StepError("The PostHog project key is empty in packages/atomize-telemetry, so nothing could have been sent or deleted.");
	const projectId = (env.POSTHOG_PROJECT_ID as string).trim();
	if (!/^\d+$/.test(projectId)) throw new StepError("POSTHOG_PROJECT_ID must be the numeric project id.");
	return {
		personalApiKey: (env.POSTHOG_PERSONAL_API_KEY as string).trim(),
		projectId,
		projectKey,
		host: (env.POSTHOG_HOST?.trim() || "https://eu.posthog.com").replace(/\/+$/, ""),
		captureUrl: env.POSTHOG_CAPTURE_URL?.trim() || POSTHOG_CAPTURE_URL,
	};
}

type Json = Record<string, unknown>;

function client(config: DeletionConfig, deps: DeletionDeps) {
	const base = `${config.host}/api/projects/${config.projectId}`;
	// `what` names the step in errors; the URL, which can carry an ID, never appears in a message.
	async function call(what: string, method: "GET" | "POST", path: string, body?: unknown): Promise<Json> {
		let response: Response;
		try {
			response = await deps.fetch(`${base}${path}`, {
				method,
				headers: { authorization: `Bearer ${config.personalApiKey}`, "content-type": "application/json" },
				...(body === undefined ? {} : { body: JSON.stringify(body) }),
			});
		} catch {
			throw new StepError(`${what}: the request to PostHog failed.`);
		}
		if (!response.ok) throw new StepError(`${what}: PostHog answered ${response.status}.`);
		try {
			return (await response.json()) as Json;
		} catch {
			throw new StepError(`${what}: PostHog's answer was not JSON.`);
		}
	}
	return { call };
}

/** The Anonymous IDs with a Deletion Request, and the person id PostHog recorded their events under. */
async function findRequests(api: ReturnType<typeof client>): Promise<Array<{ id: string; personId: string | undefined }>> {
	const query = [
		"SELECT distinct_id, argMax(toString(person_id), timestamp)",
		"FROM events",
		"WHERE event = 'telemetry_deletion_requested' AND timestamp > now() - INTERVAL 365 DAY",
		"GROUP BY distinct_id",
		`LIMIT ${MAX_REQUESTS_PER_RUN}`,
	].join(" ");
	const result = await api.call("Querying deletion requests", "POST", "/query/", { query: { kind: "HogQLQuery", query } });
	const rows = Array.isArray(result.results) ? result.results : [];
	return rows.flatMap((row) => (Array.isArray(row) && typeof row[0] === "string" ? [{ id: row[0], personId: typeof row[1] === "string" ? row[1] : undefined }] : []));
}

/** Whether PostHog already has a deletion pending or completed for this person. */
async function hasDeletionRecord(api: ReturnType<typeof client>, personUuid: string): Promise<boolean> {
	const result = await api.call("Checking deletion status", "GET", `/persons/deletion_status/?person_uuid=${encodeURIComponent(personUuid)}&status=all`);
	const items = Array.isArray(result) ? result : Array.isArray(result.results) ? result.results : [];
	return (items as Json[]).some((item) => item.status === "pending" || item.status === "completed");
}

async function personUuidsFor(api: ReturnType<typeof client>, id: string): Promise<string[]> {
	const result = await api.call("Looking up the person", "GET", `/persons/?distinct_id=${encodeURIComponent(id)}`);
	const people = Array.isArray(result.results) ? (result.results as Json[]) : [];
	return people.flatMap((person) => (typeof person.uuid === "string" ? [person.uuid] : typeof person.id === "string" ? [person.id] : []));
}

/** Deletes one Anonymous ID's events: attach a person, wait for it, bulk delete with its events. */
async function deleteOne(config: DeletionConfig, api: ReturnType<typeof client>, deps: DeletionDeps, id: string): Promise<void> {
	let captured: Response;
	try {
		captured = await deps.fetch(config.captureUrl, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ api_key: config.projectKey, event: "$set", distinct_id: id, properties: { $geoip_disable: true, $set: { atomize_deletion_requested: true } } }),
		});
	} catch {
		throw new StepError("Attaching a person: the capture request failed.");
	}
	if (!captured.ok) throw new StepError(`Attaching a person: PostHog answered ${captured.status}.`);

	const polls = deps.personPolls ?? DEFAULT_PERSON_POLLS;
	const waitMs = deps.personPollMs ?? DEFAULT_PERSON_POLL_MS;
	let found = false;
	for (let attempt = 0; attempt < polls && !found; attempt++) {
		if (attempt > 0) await deps.sleep(waitMs);
		found = (await personUuidsFor(api, id)).length > 0;
	}
	if (!found) throw new StepError("Waiting for the person: it never appeared.");

	const deleted = await api.call("Deleting", "POST", "/persons/bulk_delete/", { distinct_ids: [id], delete_events: true });
	const queued = typeof deleted.persons_queued_for_deletion === "number" ? deleted.persons_queued_for_deletion : 0;
	const errors = Array.isArray(deleted.deletion_errors) ? deleted.deletion_errors.length : 0;
	if (queued < 1 || errors > 0) throw new StepError("Deleting: PostHog did not queue the deletion.");
}

/** Anonymous IDs given by hand (an emailed request), separated by commas or whitespace. */
export function parseExtraIds(value: string | undefined): string[] {
	return [...new Set((value ?? "").split(/[\s,]+/).filter(Boolean))];
}

export async function processDeletions(config: DeletionConfig, deps: DeletionDeps, extraIds: string[] = []): Promise<DeletionSummary> {
	const api = client(config, deps);
	const summary: DeletionSummary = { new: 0, pending: 0, failed: 0, ignored: 0 };
	const failures = new Set<string>();

	const found = await findRequests(api);
	const known = new Set(found.map((request) => request.id));
	const manual = [...new Set(extraIds)].filter((id) => !known.has(id)).map((id) => ({ id, personId: undefined }));
	const requests = [...found, ...manual];
	for (const { id, personId } of requests) {
		// Anyone can send an event, so only a well-formed Anonymous ID is ever acted on.
		if (!anonymousIdSchema.safeParse(id).success) {
			summary.ignored++;
			continue;
		}
		try {
			const uuids = new Set<string>(personId ? [personId] : []);
			for (const uuid of await personUuidsFor(api, id)) uuids.add(uuid);
			let handled = false;
			for (const uuid of uuids) {
				if (await hasDeletionRecord(api, uuid)) { handled = true; break; }
			}
			if (handled) {
				summary.pending++;
				continue;
			}
			await deleteOne(config, api, deps, id);
			summary.new++;
		} catch (error) {
			summary.failed++;
			failures.add(error instanceof StepError ? error.message : "An unexpected error occurred.");
		}
	}

	for (const message of failures) deps.log(message);
	deps.log(`${summary.new} new, ${summary.pending} pending, ${summary.failed} failed${summary.ignored > 0 ? `, ${summary.ignored} ignored` : ""}`);
	return summary;
}

/** Runs against the real PostHog and returns the process exit code. */
export async function main(env: Record<string, string | undefined> = process.env, deps?: Partial<DeletionDeps>): Promise<number> {
	const log = deps?.log ?? ((line: string) => console.log(line));
	try {
		const config = readConfig(env);
		const summary = await processDeletions(
			config,
			{
				fetch: deps?.fetch ?? fetch,
				sleep: deps?.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
				log,
				...(deps?.personPolls !== undefined ? { personPolls: deps.personPolls } : {}),
				...(deps?.personPollMs !== undefined ? { personPollMs: deps.personPollMs } : {}),
			},
			parseExtraIds(env.TELEMETRY_DELETION_IDS),
		);
		return summary.failed > 0 ? 1 : 0;
	} catch (error) {
		log(error instanceof StepError ? error.message : "An unexpected error occurred.");
		return 1;
	}
}

if (import.meta.main) process.exit(await main());
