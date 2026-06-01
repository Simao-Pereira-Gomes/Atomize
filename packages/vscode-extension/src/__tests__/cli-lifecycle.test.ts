import { afterEach, describe, expect, it, mock } from 'bun:test';

describe('createCliLifecycle', () => {
	afterEach(() => {
		mock.restore();
	});

	it('shows an error when the default CLI cannot be run', async () => {
		const showErrorMessage = mock(async () => undefined);
		const showWarningMessage = mock(async () => undefined);

		mock.module('vscode', () => ({
			commands: {
				executeCommand: mock(async () => undefined),
			},
			window: {
				createTerminal: mock(() => ({
					show: mock(() => undefined),
					sendText: mock(() => undefined),
				})),
				showErrorMessage,
				showInformationMessage: mock(async () => undefined),
				showWarningMessage,
			},
		}));

		mock.module('../config/atomize-configuration.js', () => ({
			getAutoCheckUpdates: () => true,
			getConfiguredCliPath: () => 'atomize',
			getConfiguredInstallCommand: () => 'npm install -g @sppg2001/atomize',
		}));

		const { createCliLifecycle } = await import(`../cli/cli-lifecycle.js?t=${Date.now()}-unavailable`);
		const lifecycle = createCliLifecycle({
			globalState: {
				get: () => undefined,
				update: mock(async () => undefined),
			},
		} as never);

		await lifecycle.showCliUnavailableMessage('atomize', 'Atomize CLI not found. Install it to generate tasks.');

		expect(showErrorMessage).toHaveBeenCalledWith(
			'Atomize CLI not found. Install it to generate tasks.',
			'Install',
			'Open Settings',
			'Dismiss',
		);
		expect(showWarningMessage).not.toHaveBeenCalled();
	});

	it('shows an error when a configured CLI path cannot be executed', async () => {
		const showErrorMessage = mock(async () => undefined);
		const showWarningMessage = mock(async () => undefined);

		mock.module('vscode', () => ({
			commands: {
				executeCommand: mock(async () => undefined),
			},
			window: {
				createTerminal: mock(() => ({
					show: mock(() => undefined),
					sendText: mock(() => undefined),
				})),
				showErrorMessage,
				showInformationMessage: mock(async () => undefined),
				showWarningMessage,
			},
		}));

		mock.module('../config/atomize-configuration.js', () => ({
			getAutoCheckUpdates: () => true,
			getConfiguredCliPath: () => '/missing/atomize',
			getConfiguredInstallCommand: () => 'npm install -g @sppg2001/atomize',
		}));

		const { createCliLifecycle } = await import(`../cli/cli-lifecycle.js?t=${Date.now()}-configured`);
		const lifecycle = createCliLifecycle({
			globalState: {
				get: () => undefined,
				update: mock(async () => undefined),
			},
		} as never);

		await lifecycle.showCliUnavailableMessage('/missing/atomize', 'unused');

		expect(showErrorMessage).toHaveBeenCalledWith(
			'Configured Atomize CLI path could not be executed: /missing/atomize',
			'Open Settings',
			'Dismiss',
		);
		expect(showWarningMessage).not.toHaveBeenCalled();
	});
});
