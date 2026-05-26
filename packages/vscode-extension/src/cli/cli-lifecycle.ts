import * as vscode from 'vscode';
import { getAutoCheckUpdates, getConfiguredCliPath, getConfiguredInstallCommand } from '../config/atomize-configuration.js';
import {
	CLI_MINIMUM_VERSION,
	type CliUpdateCache,
	DEFAULT_CLI_PATH,
	fetchNpmLatestVersion,
	probeCli,
	checkForCliUpdate as runCliUpdateCheck,
	UPDATE_CHECK_CACHE_KEY,
} from './cli-provider.js';

export interface UpdateCheckSummary {
	latestVersion?: string;
	updateAvailable: boolean;
}

export interface CliLifecycle {
	checkForCliUpdate: (cliPath: string, version: string | undefined) => Promise<UpdateCheckSummary | undefined>;
	showCliUnavailableMessage: (cliPath: string, message: string) => Promise<void>;
	showCliTooOldMessage: (installedVersion: string) => Promise<void>;
}

export function createCliLifecycle(ctx: vscode.ExtensionContext): CliLifecycle {
	let updateCheckStarted = false;

	async function openAtomizeSettings(): Promise<void> {
		await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:sppg2001.atomize');
	}

	function runInstallCommand(): void {
		const terminal = vscode.window.createTerminal({ name: 'Atomize CLI' });
		terminal.show();
		terminal.sendText(getConfiguredInstallCommand(), true);
	}

	async function promptRecheckAfterInstall(): Promise<void> {
		const selection = await vscode.window.showInformationMessage(
			'Atomize CLI install command started in the terminal.',
			'Re-check',
			'Dismiss',
		);
		if (selection === 'Re-check') {
			const probe = await probeCli(getConfiguredCliPath());
			if (probe.available) {
				void vscode.window.showInformationMessage('Atomize CLI is available.');
			} else {
				await showCliUnavailableMessage(getConfiguredCliPath(), 'Atomize CLI is still not available.');
			}
		}
	}

	async function checkForCliUpdate(cliPath: string, version: string | undefined): Promise<UpdateCheckSummary | undefined> {
		if (updateCheckStarted) return undefined;
		updateCheckStarted = true;
		const result = await runCliUpdateCheck({
			cliPath,
			autoCheckUpdates: getAutoCheckUpdates(),
			installedVersion: version,
			now: Date.now(),
			cache: ctx.globalState.get<CliUpdateCache>(UPDATE_CHECK_CACHE_KEY),
			fetchLatestVersion: fetchNpmLatestVersion,
		});
		if (!result) return undefined;

		await ctx.globalState.update(UPDATE_CHECK_CACHE_KEY, result.cache);

		const summary: UpdateCheckSummary = {
			latestVersion: result.latestVersion,
			updateAvailable: result.updateAvailable && !!result.latestVersion,
		};

		if (summary.updateAvailable && result.latestVersion) {
			const selection = await vscode.window.showInformationMessage(
				`A newer Atomize CLI is available (${result.latestVersion}).`,
				'Update',
				'Dismiss',
			);
			if (selection === 'Update') {
				runInstallCommand();
			}
		}

		return summary;
	}

	async function showCliUnavailableMessage(cliPath: string, defaultMessage: string): Promise<void> {
		if (cliPath === DEFAULT_CLI_PATH) {
			const selection = await vscode.window.showWarningMessage(defaultMessage, 'Install', 'Open Settings', 'Dismiss');
			if (selection === 'Install') {
				runInstallCommand();
				await promptRecheckAfterInstall();
			} else if (selection === 'Open Settings') {
				await openAtomizeSettings();
			}
			return;
		}

		const selection = await vscode.window.showWarningMessage(
			`Configured Atomize CLI path could not be executed: ${cliPath}`,
			'Open Settings',
			'Dismiss',
		);
		if (selection === 'Open Settings') {
			await vscode.commands.executeCommand('workbench.action.openSettings', 'atomize.cliPath');
		}
	}

	async function showCliTooOldMessage(installedVersion: string): Promise<void> {
		const selection = await vscode.window.showWarningMessage(
			`Atomize CLI ${CLI_MINIMUM_VERSION} or later is required. Your installed version is ${installedVersion}.`,
			'Update',
			'Dismiss',
		);
		if (selection === 'Update') {
			runInstallCommand();
		}
	}

	return { checkForCliUpdate, showCliUnavailableMessage, showCliTooOldMessage };
}
