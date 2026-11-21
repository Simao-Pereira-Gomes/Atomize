import { randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "zod";
import { anonymousIdSchema, SURFACES, type Surface } from "./events";

/** The shared consent file: one per user, read and written by every surface. */
export function defaultConsentPath(): string {
	return join(homedir(), ".atomize", "telemetry.json");
}

const consentFileSchema = z.looseObject({
	version: z.literal(1),
	enabled: z.boolean().optional(),
	decidedAt: z.iso.datetime().optional(),
	anonymousId: anonymousIdSchema.optional(),
	nudged: z.partialRecord(z.enum(SURFACES), z.boolean()).optional(),
});

export interface ConsentState {
	/** `undefined` means the user has not decided: nothing is sent. */
	enabled: boolean | undefined;
	decidedAt: string | undefined;
	anonymousId: string | undefined;
	nudged: Partial<Record<Surface, boolean>>;
}

const UNDECIDED: ConsentState = Object.freeze({
	enabled: undefined,
	decidedAt: undefined,
	anonymousId: undefined,
	nudged: Object.freeze({}),
}) as ConsentState;

function parseConsent(raw: string): ConsentState {
	try {
		const parsed = consentFileSchema.safeParse(JSON.parse(raw));
		if (!parsed.success) return UNDECIDED;
		return {
			enabled: parsed.data.enabled,
			decidedAt: parsed.data.decidedAt,
			anonymousId: parsed.data.anonymousId,
			nudged: { ...parsed.data.nudged },
		};
	} catch {
		return UNDECIDED;
	}
}

/** Reads the consent file. A missing, malformed or unknown-version file reads as undecided; it never throws. */
export function readConsent(path: string = defaultConsentPath()): ConsentState {
	try {
		return parseConsent(readFileSync(path, "utf8"));
	} catch {
		return UNDECIDED;
	}
}

/** The file's current fields to merge into, or a fresh document when it is absent or unusable. */
function readForMerge(path: string): Record<string, unknown> {
	try {
		const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
		if (consentFileSchema.safeParse(raw).success) return raw as Record<string, unknown>;
	} catch {
		// absent or malformed: start over
	}
	return { version: 1 };
}

function writeMerged(path: string, update: (current: Record<string, unknown>) => Record<string, unknown>): ConsentState {
	const next = update(readForMerge(path));
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	const temp = `${path}.${process.pid}.${randomUUID()}.tmp`;
	writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
	try {
		chmodSync(temp, 0o600);
	} catch {
		// best effort (Windows has no mode bits)
	}
	renameSync(temp, path);
	return parseConsent(JSON.stringify(next));
}

/**
 * Records an explicit decision. The Anonymous ID is created on the first enable and kept on
 * disable, so a user can always quote it in a Deletion Request. Only a sent Deletion Request
 * retires it (see `retireAnonymousId`).
 */
export function setConsent(
	enabled: boolean,
	options: { path?: string; now?: () => Date } = {},
): ConsentState {
	const path = options.path ?? defaultConsentPath();
	const now = options.now ?? (() => new Date());
	return writeMerged(path, (current) => {
		const existingId = anonymousIdSchema.safeParse(current.anonymousId);
		return {
			...current,
			version: 1,
			enabled,
			decidedAt: now().toISOString(),
			anonymousId: existingId.success ? existingId.data : enabled ? randomUUID() : current.anonymousId,
		};
	});
}

/**
 * Records a sent Deletion Request: telemetry is disabled and the Anonymous ID is forgotten, so a
 * later enable creates a fresh one. Reusing an ID queued for deletion could get new events erased
 * with the old ones, or attached to the person the deletion workaround creates.
 */
export function retireAnonymousId(options: { path?: string; now?: () => Date } = {}): ConsentState {
	const now = options.now ?? (() => new Date());
	return writeMerged(options.path ?? defaultConsentPath(), (current) => {
		const { anonymousId: _retired, ...rest } = current;
		return { ...rest, version: 1, enabled: false, decidedAt: now().toISOString() };
	});
}

/** Records that a surface showed its one-time nudge, without touching the user's decision. */
export function markNudged(surface: Surface, options: { path?: string } = {}): ConsentState {
	return writeMerged(options.path ?? defaultConsentPath(), (current) => {
		const nudged = typeof current.nudged === "object" && current.nudged !== null ? current.nudged : {};
		return { ...current, version: 1, nudged: { ...nudged, [surface]: true } };
	});
}

export type EnvOverrideName = "ATOMIZE_TELEMETRY" | "DO_NOT_TRACK";

/** An environment variable that forces telemetry off. Variables can only turn it off, never on. */
export function envOverride(env: Record<string, string | undefined> = process.env): EnvOverrideName | undefined {
	const atomize = env.ATOMIZE_TELEMETRY?.trim().toLowerCase();
	if (atomize === "0" || atomize === "false" || atomize === "off") return "ATOMIZE_TELEMETRY";
	if (env.DO_NOT_TRACK?.trim() === "1") return "DO_NOT_TRACK";
	return undefined;
}

export interface ConsentReader {
	/** The current state, re-read from disk only when the file's mtime or size has changed. */
	read(): ConsentState;
}

/** Consent is checked at send time: `stat` before each send, re-read only on change. No watchers. */
export function createConsentReader(path: string = defaultConsentPath()): ConsentReader {
	let signature: string | undefined;
	let cached: ConsentState = UNDECIDED;
	return {
		read() {
			let next: string;
			try {
				const stats = statSync(path);
				next = `${stats.mtimeMs}:${stats.size}`;
			} catch {
				signature = "absent";
				cached = UNDECIDED;
				return cached;
			}
			if (next !== signature) {
				cached = readConsent(path);
				signature = next;
			}
			return cached;
		},
	};
}

export interface EffectiveConsent {
	/** Whether a send is allowed right now. */
	enabled: boolean;
	override: EnvOverrideName | undefined;
	state: ConsentState;
}

export function resolveConsent(
	state: ConsentState,
	env: Record<string, string | undefined> = process.env,
): EffectiveConsent {
	const override = envOverride(env);
	return { enabled: state.enabled === true && override === undefined, override, state };
}
