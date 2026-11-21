import {
	createTelemetryClient,
	type EnvOverrideName,
	envOverride,
	markNudged,
	readConsent,
	setConsent,
	type TelemetryClient,
	type TelemetryEventInput,
} from "@sppg2001/atomize-telemetry";

/** Where the user's telemetry choice stands, for Studio's Usage data settings and its banner. */
export type TelemetryStatus = {
	/** The saved choice, whatever an env override says. */
	state: "enabled" | "disabled" | "undecided";
	/** An environment variable that forces telemetry off, or null. */
	override: EnvOverrideName | null;
	anonymousId: string | null;
	/** Whether Studio's one-time banner has already been shown. */
	nudged: boolean;
};

/** What a webview can ask of consent: decide, or record that the banner was shown. */
export type ConsentDecision = "enable" | "disable" | "dismissNudge";

export interface SidecarTelemetry {
	report(event: TelemetryEventInput): void;
	status(): TelemetryStatus;
	setConsent(decision: ConsentDecision): TelemetryStatus;
	/** Sends the Deletion Request, then disables telemetry. `sent` is false when there is no Anonymous ID or no way to send. */
	requestDeletion(): { sent: boolean; anonymousId: string | null };
	flush(capMs: number): Promise<void>;
}

export interface SidecarTelemetryOptions {
	atomizeVersion: string;
	consentPath?: string;
	env?: Record<string, string | undefined>;
	fetch?: typeof fetch;
	projectKey?: string;
}

/**
 * Studio's telemetry, run in the sidecar so neither the webview nor Rust ever touches
 * `~/.atomize/telemetry.json`. The webview reports what it saw; the shared client decides whether
 * anything is sent (consent, env override, project key) and never throws.
 */
export function createSidecarTelemetry(options: SidecarTelemetryOptions): SidecarTelemetry {
	const path = options.consentPath;
	const env = options.env ?? process.env;
	const client: TelemetryClient = createTelemetryClient({
		surface: "studio",
		atomizeVersion: options.atomizeVersion,
		...(path ? { consentPath: path } : {}),
		...(options.env ? { env: options.env } : {}),
		...(options.fetch ? { fetch: options.fetch } : {}),
		...(options.projectKey !== undefined ? { projectKey: options.projectKey } : {}),
	});
	const pathOption = path ? { path } : {};

	const status = (): TelemetryStatus => {
		const consent = readConsent(path);
		return {
			state: consent.enabled === undefined ? "undecided" : consent.enabled ? "enabled" : "disabled",
			override: envOverride(env) ?? null,
			anonymousId: consent.anonymousId ?? null,
			nudged: consent.nudged.studio === true,
		};
	};

	return {
		report: (event) => client.track(event),
		status,
		setConsent(decision) {
			if (decision === "dismissNudge") markNudged("studio", pathOption);
			else {
				setConsent(decision === "enable", pathOption);
				if (decision === "enable") client.track({ event: "telemetry_enabled", source: "studio" });
			}
			return status();
		},
		requestDeletion() {
			const { anonymousId } = readConsent(path);
			if (!anonymousId) return { sent: false, anonymousId: null };
			const sent = client.requestDeletion();
			setConsent(false, pathOption);
			return { sent, anonymousId };
		},
		flush: (capMs) => client.flush(capMs),
	};
}
