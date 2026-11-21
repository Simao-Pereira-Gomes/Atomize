import {
	defaultConsentPath,
	envOverride,
	readConsent,
	setConsent,
} from "@sppg2001/atomize-telemetry";
import chalk from "chalk";
import { Command } from "commander";
import { EXIT_FLUSH_CAP_MS, getTelemetry } from "@/cli/telemetry/telemetry";
import { TELEMETRY_DOCS_URL } from "@/cli/telemetry/telemetry-hint";
import { writeStdout } from "@/cli/utilities/terminal-output";

const COLLECTED = [
	"Which Atomize action ran (for example generate or validate) and how it ended: success, failure or cancelled",
	"A coarse error category on failure (never an error message)",
	"How long it took, and counts such as Stories and Tasks",
	"Atomize version, runtime version, operating system and CLI/Studio/VS Code surface",
	"A random Anonymous ID, shared by all three surfaces",
];

const NEVER_COLLECTED =
	"Never collected: org URLs, tokens, Story or Task content, template names, file paths, IP addresses or any free text.";

export interface TelemetryCommandDependencies {
	consentPath?: string;
	print?: (line: string) => void;
	env?: Record<string, string | undefined>;
	flush?: () => Promise<void>;
}

export function makeTelemetryCommand(dependencies: TelemetryCommandDependencies = {}): Command {
	const print = dependencies.print ?? writeStdout;
	const env = () => dependencies.env ?? process.env;
	const consentPath = dependencies.consentPath ?? defaultConsentPath();
	const flush = dependencies.flush ?? (() => getTelemetry().flush(EXIT_FLUSH_CAP_MS));

	const command = new Command("telemetry").description("Manage anonymous usage telemetry (off until you enable it)");

	command
		.command("enable")
		.description("Turn on anonymous usage telemetry for the CLI, Studio and the VS Code extension")
		.action(async () => {
			setConsent(true, { path: consentPath });
			print(chalk.green("Telemetry enabled for the Atomize CLI, Studio and VS Code extension."));
			print("The choice is shared through ~/.atomize/telemetry.json; disabling it anywhere turns it off everywhere.");
			const override = envOverride(env());
			if (override) {
				print(chalk.yellow(`Nothing will be sent while ${override} is set in this environment.`));
			} else {
				getTelemetry().track({ event: "telemetry_enabled", source: "command" });
			}
			print(chalk.dim(`What is collected: atomize telemetry status · ${TELEMETRY_DOCS_URL}`));
			await flush();
		});

	command
		.command("disable")
		.description("Turn off anonymous usage telemetry everywhere")
		.action(() => {
			const { anonymousId } = setConsent(false, { path: consentPath });
			print("Telemetry disabled for the Atomize CLI, Studio and VS Code extension. Nothing was sent.");
			if (anonymousId) {
				print(`Your Anonymous ID is ${chalk.bold(anonymousId)}.`);
				print(`To erase data already sent under it, run ${chalk.cyan("atomize telemetry delete")}, or see ${TELEMETRY_DOCS_URL}.`);
			}
		});

	command
		.command("status")
		.description("Show whether telemetry is on, what is collected, and your Anonymous ID")
		.action(() => {
			const state = readConsent(consentPath);
			const override = envOverride(env());
			const saved = state.enabled === undefined ? "not decided" : state.enabled ? "enabled" : "disabled";
			if (override) {
				print(`Telemetry: ${chalk.red("Disabled")} by ${override} (your saved choice: ${saved})`);
			} else if (state.enabled === undefined) {
				print("Telemetry: not decided. Nothing is sent. Run `atomize telemetry enable` to opt in.");
			} else {
				print(`Telemetry: ${state.enabled ? chalk.green("Enabled") : "Disabled"}`);
			}
			print(`Choice stored in ${consentPath}`);
			print("");
			print("Collected when enabled:");
			for (const line of COLLECTED) print(`  - ${line}`);
			print(NEVER_COLLECTED);
			print(`Data goes to PostHog (EU). Details: ${TELEMETRY_DOCS_URL}`);
			print("");
			print(`Anonymous ID: ${state.anonymousId ?? "none yet (created when you enable telemetry)"}`);
		});

	command
		.command("delete")
		.description("Request deletion of usage data already sent, then disable telemetry")
		.action(async () => {
			const { anonymousId } = readConsent(consentPath);
			if (!anonymousId) {
				print("No Anonymous ID exists, so no data has been sent under one. Nothing to delete.");
				return;
			}
			const sent = getTelemetry().requestDeletion();
			setConsent(false, { path: consentPath });
			print(sent ? `Deletion requested for Anonymous ID ${chalk.bold(anonymousId)}. Telemetry is now disabled.` : `Telemetry is now disabled. The deletion request could not be sent from this build; quote Anonymous ID ${chalk.bold(anonymousId)} when you ask for deletion: ${TELEMETRY_DOCS_URL}`);
			if (sent) print("Deletion is completed within 30 days.");
			await flush();
		});

	return command;
}

export const telemetryCommand = makeTelemetryCommand();
