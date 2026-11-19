import * as vscode from 'vscode';

function disposeAll(disposables: vscode.Disposable[]): void {
	for (const d of disposables) d.dispose();
}

/**
 * Registers `ids` as placeholder commands that load the real implementation on first use.
 *
 * Activation then doesn't pay for evaluating atomize-core, zod, azure-devops-node-api and the like,
 * which only the real command handlers need. The first call swaps the placeholders for whatever `load`
 * registers (it must register the same ids) and re-runs the command with its original arguments.
 */
export function registerLazyCommands(ids: readonly string[], load: () => Promise<vscode.Disposable>): vscode.Disposable {
	let placeholders: vscode.Disposable[] = [];
	let real: vscode.Disposable | undefined;
	let loading: Promise<void> | undefined;
	let disposed = false;

	function arm(): void {
		placeholders = ids.map(id => vscode.commands.registerCommand(id, async (...args: unknown[]) => {
			loading ??= (async () => {
				disposeAll(placeholders);
				placeholders = [];
				try {
					real = await load();
				} catch (error) {
					loading = undefined;
					if (!disposed) arm();
					throw error;
				}
				if (disposed) real.dispose();
			})();
			await loading;
			return vscode.commands.executeCommand(id, ...args);
		}));
	}
	arm();

	return {
		dispose() {
			disposed = true;
			disposeAll(placeholders);
			real?.dispose();
		},
	};
}

/** Memoizes an async factory, so concurrent and repeated callers share one load. */
export function once<T>(factory: () => Promise<T>): () => Promise<T> {
	let promise: Promise<T> | undefined;
	return () => {
		promise ??= factory().catch(error => {
			promise = undefined;
			throw error;
		});
		return promise;
	};
}
