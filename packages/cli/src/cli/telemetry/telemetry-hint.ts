import { note } from "@clack/prompts";
import { envOverride, markNudged, readConsent } from "@sppg2001/atomize-telemetry";
import chalk from "chalk";
import { isInteractiveTerminal } from "@/cli/utilities/prompt-utilities";

export const TELEMETRY_DOCS_URL = "https://atomize-docs.pages.dev/telemetry";

export interface TelemetryHintDependencies {
	isInteractive?: () => boolean;
	env?: Record<string, string | undefined>;
	consentPath?: string;
	show?: (message: string, title: string) => void;
}

let shownThisRun = false;

/**
 * The one-time Telemetry Nudge: a note after the first successful command, only when a person is
 * at an interactive terminal and has not decided. Never in CI or a non-TTY session, never under
 * an env override. Showing it records `nudged.cli`, so it appears at most once.
 */
export function maybeShowTelemetryHint(dependencies: TelemetryHintDependencies = {}): boolean {
	if (shownThisRun) return false;
	if (!(dependencies.isInteractive ?? isInteractiveTerminal)()) return false;
	if (envOverride(dependencies.env ?? process.env)) return false;
	const state = readConsent(dependencies.consentPath);
	if (state.enabled !== undefined || state.nudged.cli) return false;

	shownThisRun = true;
	(dependencies.show ?? note)(
		[
			"Atomize can send anonymous usage data (which commands run, how they end, never your",
			"work items, org or templates) to PostHog, to help prioritise fixes.",
			`Run ${chalk.cyan("atomize telemetry enable")} to opt in. It applies to the CLI, Studio and the VS Code extension.`,
			chalk.dim(TELEMETRY_DOCS_URL),
		].join("\n"),
		chalk.cyan("Help improve Atomize?"),
	);
	try {
		markNudged("cli", { path: dependencies.consentPath });
	} catch {
		// an unwritable consent file only means the hint may show again
	}
	return true;
}

/** @internal Resets the once-per-process guard in tests. */
export function resetTelemetryHintForTesting(): void {
	shownThisRun = false;
}
