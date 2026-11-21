import { platform } from "node:os";
import { type ConsentReader, createConsentReader, defaultConsentPath, resolveConsent } from "./consent";
import { type Surface, type TelemetryEvent, type TelemetryEventInput, telemetryEventSchema } from "./events";

/** The PostHog project's public capture key (safe to ship in a client). An empty key disables sending. */
export const POSTHOG_PROJECT_KEY = "phc_pqJ6w4CSEmnwsSdyGiXbCEoMSuz8abRNoUu6hwYjPKtE";
export const POSTHOG_CAPTURE_URL = "https://eu.i.posthog.com/capture/";

/** A send that has not finished by now is abandoned. */
const SEND_TIMEOUT_MS = 3_000;

export interface TelemetryClientOptions {
	surface: Surface;
	atomizeVersion: string;
	projectKey?: string;
	captureUrl?: string;
	consentPath?: string;
	env?: Record<string, string | undefined>;
	fetch?: typeof fetch;
	now?: () => Date;
	/**
	 * A second gate checked at send time, after the shared consent: a surface with its own switch
	 * (VS Code's) can only add a condition, never override the shared decision. Not applied to
	 * deletion requests.
	 */
	gate?: () => boolean;
	runtimeVersion?: string;
	os?: string;
}

export interface TelemetryClient {
	/** Sends one event if consent allows it. Never throws, never waits, never retries. */
	track(event: TelemetryEventInput): void;
	/**
	 * Sends a Deletion Request. It is a data-subject request, not usage telemetry, so it goes
	 * even when telemetry is disabled or overridden, as long as there is an Anonymous ID to name.
	 * Returns whether a request was sent.
	 */
	requestDeletion(): boolean;
	/** Resolves once in-flight sends finish, or after `capMs`, whichever comes first. */
	flush(capMs: number): Promise<void>;
}

function runtimeVersionOf(): string {
	const bun = (process.versions as Record<string, string | undefined>).bun;
	return bun ? `bun-${bun}` : `node-${process.versions.node}`;
}

function osOf(value: string): "darwin" | "linux" | "win32" | "other" {
	return value === "darwin" || value === "linux" || value === "win32" ? value : "other";
}

export function createTelemetryClient(options: TelemetryClientOptions): TelemetryClient {
	const projectKey = options.projectKey ?? POSTHOG_PROJECT_KEY;
	const captureUrl = options.captureUrl ?? POSTHOG_CAPTURE_URL;
	const env = options.env ?? process.env;
	const send = options.fetch ?? globalThis.fetch;
	const now = options.now ?? (() => new Date());
	const reader: ConsentReader = createConsentReader(options.consentPath ?? defaultConsentPath());
	const inFlight = new Set<Promise<void>>();

	function post(event: TelemetryEvent): void {
		const { anonymousId, event: name, ...properties } = event;
		const body = JSON.stringify({
			api_key: projectKey,
			event: name,
			distinct_id: anonymousId,
			timestamp: event.timestamp,
			properties: { ...properties, $process_person_profile: false, $geoip_disable: true },
		});
		const request = Promise.resolve()
			.then(() =>
				send(captureUrl, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body,
					signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
				}),
			)
			.then(() => undefined)
			.catch(() => undefined)
			.finally(() => inFlight.delete(request));
		inFlight.add(request);
	}

	function build(input: TelemetryEventInput, anonymousId: string): TelemetryEvent | undefined {
		const parsed = telemetryEventSchema.safeParse({
			...input,
			surface: options.surface,
			atomizeVersion: options.atomizeVersion,
			runtimeVersion: options.runtimeVersion ?? runtimeVersionOf(),
			os: osOf(options.os ?? platform()),
			anonymousId,
			timestamp: now().toISOString(),
		});
		return parsed.success ? parsed.data : undefined;
	}

	return {
		track(input) {
			try {
				if (projectKey === "") return;
				if (options.gate && !options.gate()) return;
				const consent = resolveConsent(reader.read(), env);
				if (!consent.enabled || !consent.state.anonymousId) return;
				const event = build(input, consent.state.anonymousId);
				if (event) post(event);
			} catch {
				// telemetry never changes what a command does
			}
		},
		requestDeletion() {
			try {
				if (projectKey === "") return false;
				const { anonymousId } = reader.read();
				if (!anonymousId) return false;
				const event = build({ event: "telemetry_deletion_requested" }, anonymousId);
				if (!event) return false;
				post(event);
				return true;
			} catch {
				return false;
			}
		},
		async flush(capMs) {
			if (inFlight.size === 0) return;
			let timer: ReturnType<typeof setTimeout> | undefined;
			// Not unref'd: the caller awaits this and the timer is cleared below, so it can hold the
			// process for capMs at most. Unref'd, an idle event loop could end the process before the
			// cap fires (so exitWith never sets its exit code), and on Windows bun waits forever.
			const cap = new Promise<void>((resolve) => {
				timer = setTimeout(resolve, capMs);
			});
			try {
				await Promise.race([Promise.allSettled([...inFlight]).then(() => undefined), cap]);
			} finally {
				clearTimeout(timer);
			}
		},
	};
}

