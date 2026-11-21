import type { ConsentDecision, TelemetryStatus } from "@sppg2001/atomize-sidecar/contract";
import type { ActionProps, ErrorCategory, TelemetryAction, TelemetryEventInput } from "@sppg2001/atomize-telemetry";
import { invoke } from "@tauri-apps/api/core";

/**
 * Studio's telemetry, seen from the webview. The webview only reports what it saw each action do;
 * the sidecar owns consent, the Anonymous ID and the network (ADR-0060), so nothing here reads
 * `~/.atomize` and every call is best effort: a failure never reaches the user.
 */

type Transport = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
let transport: Transport = invoke;

/** @internal Swaps the Tauri bridge in tests. */
export function setTelemetryTransportForTesting(next: Transport | undefined): void {
	transport = next ?? invoke;
}

export type { ConsentDecision, TelemetryStatus };

export type Ending = { outcome: "success" | "cancelled" } | { outcome: "failure"; errorCategory?: ErrorCategory };

const quiet = (work: Promise<unknown>): void => void work.catch(() => undefined);

export function reportEvent(event: TelemetryEventInput): void {
	quiet(transport("telemetry_report", { event }));
}

export const telemetryStatus = (): Promise<TelemetryStatus> => transport<TelemetryStatus>("telemetry_status");
export const setTelemetryConsent = (decision: ConsentDecision): Promise<TelemetryStatus> =>
	transport<TelemetryStatus>("telemetry_set_consent", { decision });
export const requestTelemetryDeletion = (): Promise<{ sent: boolean; anonymousId: string | null }> =>
	transport("telemetry_request_deletion");

/** `session_started`, once per launch. */
export function reportSessionStarted(): void {
	reportEvent({ event: "session_started" });
}

const MAX_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
let onNudgeDue: (() => void) | undefined;
let nudgeChecked = false;

/** The Shell registers what to do when the one-time banner is due. */
export function setNudgeListener(listener: (() => void) | undefined): void {
	onNudgeDue = listener;
	if (listener === undefined) nudgeChecked = false;
}

/**
 * The one-time banner is due after the first successful action, while the user is undecided, no
 * env override forces telemetry off, and it has not been shown. Showing it is recorded at once as
 * `nudged.studio`, so it can never appear twice.
 */
async function checkNudge(): Promise<void> {
	if (nudgeChecked || !onNudgeDue) return;
	nudgeChecked = true;
	try {
		const status = await telemetryStatus();
		if (status.state !== "undecided" || status.override !== null || status.nudged) return;
		await setTelemetryConsent("dismissNudge");
		onNudgeDue?.();
	} catch {
		// the sidecar may be recovering; the next success asks again
		nudgeChecked = false;
	}
}

/** Reports one finished action. A success is also the moment the banner may become due. */
export function reportFinished<A extends TelemetryAction>(action: A, props: ActionProps<A>, ending: Ending, startedAt: number): void {
	reportEvent({
		event: "command_finished",
		action,
		outcome: ending.outcome,
		...(ending.outcome === "failure" && ending.errorCategory ? { errorCategory: ending.errorCategory } : {}),
		durationMs: Math.min(Date.now() - startedAt, MAX_DURATION_MS),
		...props,
	} as TelemetryEventInput);
	if (ending.outcome === "success") void checkNudge();
}

/** How a failed sidecar call ended, from its error code: a cancellation, or a coarse category. */
export function endingOfError(error: unknown): Ending {
	const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : "";
	if (code === "REQUEST_CANCELLED" || code === "AI_DRAFT_CANCELLED") return { outcome: "cancelled" };
	return { outcome: "failure", errorCategory: categoryOfCode(code) };
}

function categoryOfCode(code: string): ErrorCategory {
	if (code === "COPILOT_AUTH_REQUIRED" || code.startsWith("AI_")) return "ai";
	if (code.endsWith("_TOKEN_EXPIRED") || code.endsWith("_AUTH_FAILED")) return "auth";
	if (code.startsWith("TEMPLATE_")) return "template";
	if (code.startsWith("REFERENCE_")) return "reference-docs";
	if (code === "PROJECT_WORKSPACE_REQUIRED") return "config";
	if (/^(GENERATE_|GROUNDING_|WIKI_|ONLINE_VALIDATION_)/.test(code)) return "platform";
	return "unknown";
}

/**
 * Runs one action and reports how it ended. `props` may depend on the result, which is how counts
 * and flags reach the event; `endingOf` lets a result that is not an error still end as something
 * other than a success (a stopped run). The call's own outcome is never changed.
 */
export async function observed<A extends TelemetryAction, T>(
	action: A,
	props: ActionProps<A> | ((result: T | undefined) => ActionProps<A>),
	run: () => Promise<T>,
	endingOf?: (result: T) => Ending,
): Promise<T> {
	const startedAt = Date.now();
	const resolveProps = (result: T | undefined): ActionProps<A> => (typeof props === "function" ? props(result) : props);
	let result: T;
	try {
		result = await run();
	} catch (error) {
		reportFinished(action, resolveProps(undefined), endingOfError(error), startedAt);
		throw error;
	}
	reportFinished(action, resolveProps(result), endingOf?.(result) ?? { outcome: "success" }, startedAt);
	return result;
}
