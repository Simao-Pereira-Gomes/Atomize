import { categorizeError, type ErrorCategory, type TelemetryAction, type TelemetryEventInput } from "@sppg2001/atomize-telemetry";
import { ExitCode, ExitError } from "@/cli/utilities/exit-codes";
import { EXIT_FLUSH_CAP_MS, exitWith, getTelemetry } from "./telemetry";

type CommandFinishedInput = Extract<TelemetryEventInput, { event: "command_finished" }>;

/** The per-action props: everything on a `command_finished` event the surface supplies besides how it ended. */
export type ActionProps<A extends TelemetryAction> = Omit<
	Extract<CommandFinishedInput, { action: A }>,
	"event" | "action" | "outcome" | "errorCategory" | "durationMs"
>;

export interface TrackedRun<P> {
	/** Fills in props once the command knows them. */
	set(props: Partial<P>): void;
	/**
	 * Ends the command with a non-zero exit code even though it worked, for a result the shell
	 * should see as failing (an invalid Template is a successful `validate`, exiting 1).
	 */
	exitWith(code: number): void;
}

type Ending = { outcome: "success" | "failure" | "cancelled"; errorCategory?: ErrorCategory; exitCode: number };

function endingOf(error: unknown, requestedExitCode: number): Ending {
	if (error === undefined) return { outcome: "success", exitCode: requestedExitCode };
	if (error instanceof ExitError) {
		return error.code === ExitCode.Success ? { outcome: "cancelled", exitCode: 0 } : { outcome: "failure", exitCode: error.code };
	}
	const classified = categorizeError(error);
	return classified.outcome === "cancelled"
		? { outcome: "cancelled", exitCode: 0 }
		: { outcome: "failure", errorCategory: classified.errorCategory, exitCode: ExitCode.Failure };
}

/**
 * Wraps a command's action so it reports exactly one `command_finished` event for `action` and
 * every way out of it goes through `exitWith`. The handler throws to end the command: an
 * `ExitError` carries its exit code, a Ctrl+C or declined confirmation is `ExitError(0)` or a
 * `CancellationError` and reports `cancelled`, anything else is a failure exiting 1. A handler that
 * returns normally succeeds and lets the process end on its own once telemetry has had its chance.
 * The handler prints its own errors before throwing.
 */
export function tracked<A extends TelemetryAction, Args extends unknown[]>(
	action: A,
	defaults: ActionProps<A>,
	handler: (run: TrackedRun<ActionProps<A>>, ...args: Args) => Promise<void>,
): (...args: Args) => Promise<void> {
	return async (...args) => {
		const startedAt = Date.now();
		const props = { ...defaults };
		let requestedExitCode: number = ExitCode.Success;
		let error: unknown;
		const run: TrackedRun<ActionProps<A>> = {
			set: (next) => void Object.assign(props, next),
			exitWith: (code) => {
				requestedExitCode = code;
			},
		};
		try {
			await handler(run, ...args);
		} catch (caught) {
			error = caught ?? new Error("unknown");
		}

		const ending = endingOf(error, requestedExitCode);
		try {
			getTelemetry().track({
				event: "command_finished",
				action,
				outcome: ending.outcome,
				...(ending.errorCategory ? { errorCategory: ending.errorCategory } : {}),
				durationMs: Math.min(Date.now() - startedAt, 7 * 24 * 60 * 60 * 1000),
				...props,
			} as CommandFinishedInput);
		} catch {
			// telemetry never changes what a command does
		}

		if (ending.exitCode !== ExitCode.Success || ending.outcome === "cancelled") {
			await exitWith(ending.exitCode, { hint: false });
		}
		await getTelemetry().flush(EXIT_FLUSH_CAP_MS);
	};
}
