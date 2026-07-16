export const CLI_INSTALL_COMMAND = 'npm install -g @sppg2001/atomize';

export class NpmUnavailableError extends Error {
	override readonly name = 'NpmUnavailableError';
	constructor(message = 'npm could not be started.') {
		super(message);
	}
}

export class CliInstallError extends Error {
	override readonly name = 'CliInstallError';
}

export type InstallOutputListener = (output: string) => void;

function isNpmUnavailable(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /(?:ENOENT|not found|could not find|executable)/i.test(message);
}

/** Runs the supported CLI installation command and streams output to the caller. */
export async function installCli(onOutput: InstallOutputListener): Promise<void> {
	const { Command } = await import('@tauri-apps/plugin-shell');
	const command = Command.create('npm', ['install', '-g', '@sppg2001/atomize']);

	command.stdout.on('data', onOutput);
	command.stderr.on('data', onOutput);

	await new Promise<void>((resolve, reject) => {
		command.on('close', ({ code }) => {
			if (code === 0) resolve();
			else reject(new CliInstallError(`npm install exited with code ${code ?? 'unknown'}.`));
		});
		command.on('error', error => reject(new NpmUnavailableError(error)));
		void command.spawn().catch(error => {
			reject(isNpmUnavailable(error) ? new NpmUnavailableError(String(error)) : new CliInstallError(String(error)));
		});
	});
}
