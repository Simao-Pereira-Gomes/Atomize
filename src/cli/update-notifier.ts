import process from "node:process";
import chalk from "chalk";
import type { UpdateInfo } from "update-notifier";
import updateNotifier from "update-notifier";
import { writeManagedOutput } from "@/cli/utilities/terminal-output";

export type UpdateNotifierMode = "background" | "immediate";

export interface UpdateNotifierEnv {
	ATOMIZE_DEV?: string | undefined;
}

export interface UpdateNotifierPackage {
	name: string;
	version: string;
}

export function resolveUpdateNotifierMode(env: UpdateNotifierEnv): UpdateNotifierMode {
	return env.ATOMIZE_DEV === "true" ? "immediate" : "background";
}

export async function runUpdateNotifier(pkg: UpdateNotifierPackage): Promise<void> {
	const mode = resolveUpdateNotifierMode({ ATOMIZE_DEV: process.env.ATOMIZE_DEV });
	const notifier = updateNotifier({
		pkg,
		updateCheckInterval: mode === "immediate" ? 0 : undefined,
	});

	if (mode === "background") {
		notifier.notify({
			message:
				"Update available {currentVersion} -> {latestVersion}\nRun npm i -g @sppg2001/atomize to update",
		});
		return;
	}

	if (!process.stdout.isTTY) {
		return;
	}

	try {
		const update = await notifier.fetchInfo();
		if (isOutdated(update)) {
			printImmediateUpdateNotification(update);
		}
	} catch {
		// Keep local development resilient when offline or registry access fails.
	}
}

function isOutdated(update: UpdateInfo): boolean {
	return update.type !== "latest";
}

function printImmediateUpdateNotification(update: UpdateInfo): void {
	const updateCommand = `npm i -g ${update.name}`;
	writeManagedOutput(
		"stderr",
		chalk.yellow(
			`Update available ${update.current} -> ${update.latest}. Run ${updateCommand} to update.`,
		),
	);
}
