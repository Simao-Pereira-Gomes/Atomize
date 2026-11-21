import { createTelemetryClient, type TelemetryClient } from "@sppg2001/atomize-telemetry";
import { version } from "../../../package.json";
import { maybeShowTelemetryHint } from "./telemetry-hint";

/** The most an exit waits for in-flight telemetry. Disabled telemetry has nothing in flight and waits for nothing. */
export const EXIT_FLUSH_CAP_MS = 300;

let client: TelemetryClient | undefined;

/** The CLI's telemetry client, created on first use. */
export function getTelemetry(): TelemetryClient {
	client ??= createTelemetryClient({ surface: "cli", atomizeVersion: version });
	return client;
}

/** @internal Swaps the client in tests. */
export function setTelemetryClientForTesting(next: TelemetryClient | undefined): void {
	client = next;
}

export interface ExitWithOptions {
	/** Whether a successful exit may show the one-time Telemetry Nudge. False for machine-readable output. */
	hint?: boolean;
}

/**
 * Exits with `code` after giving in-flight telemetry up to 300 ms to land. Telemetry can neither
 * change the exit code nor hold the process: every failure here is swallowed.
 */
export async function exitWith(code: number, options: ExitWithOptions = {}): Promise<never> {
	try {
		if (code === 0 && options.hint !== false) maybeShowTelemetryHint();
	} catch {
		// a hint must never change how a command ends
	}
	try {
		await getTelemetry().flush(EXIT_FLUSH_CAP_MS);
	} catch {
		// nothing to do: telemetry is best effort
	}
	return process.exit(code);
}
