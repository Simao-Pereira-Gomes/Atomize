import type {
	ActionProps,
	ErrorCategory,
	TelemetryAction,
	TelemetryClient,
	TelemetryEventInput,
} from '@sppg2001/atomize-telemetry';

/**
 * The extension's telemetry. It sends only while two gates are both open: the shared consent
 * (`~/.atomize/telemetry.json`, read by the client at send time) and VS Code's own switch
 * (`vscode.env.isTelemetryEnabled`, kept current through `onDidChangeTelemetryEnabled`, so toggling
 * either takes effect without a reload).
 *
 * Nothing here touches the disk or loads `atomize-telemetry` (and its zod schemas) until the first
 * event is about to be sent, and not at all while VS Code's switch is off, so activation pays
 * nothing for it.
 */

type TelemetryPackage = typeof import('@sppg2001/atomize-telemetry');

export interface TelemetryUi {
	showInformationMessage(message: string, ...items: string[]): PromiseLike<string | undefined>;
	showWarningMessage(message: string, options: { modal: boolean }, ...items: string[]): PromiseLike<string | undefined>;
	openExternal(url: string): PromiseLike<boolean>;
}

export interface ExtensionTelemetryDeps {
	atomizeVersion: string;
	/** `vscode.env.isTelemetryEnabled`, read once at construction; changes arrive through the listener. */
	isVscodeTelemetryEnabled: () => boolean;
	/** `vscode.env.onDidChangeTelemetryEnabled`: VS Code tells us when the user changes its switch. */
	onDidChangeVscodeTelemetryEnabled: (listener: (enabled: boolean) => void) => { dispose(): void };
	loadPackage: () => Promise<TelemetryPackage>;
	ui: TelemetryUi;
	consentPath?: string;
	env?: Record<string, string | undefined>;
	fetch?: typeof fetch;
	/** Overrides the PostHog project key; tests only. */
	projectKey?: string;
}

/** How a command ended, when the handler did not simply return. */
export interface CommandRun<P> {
	set(props: Partial<P>): void;
	/** The user dismissed a picker or declined a confirmation. */
	cancelled(): void;
	/** The command failed in a way it handled itself, for instance by showing an error message. */
	failed(error: unknown): void;
}

export type Ending =
	| { outcome: 'success' | 'cancelled' }
	| { outcome: 'failure'; errorCategory?: ErrorCategory }
	| { error: unknown };

const NUDGE_MESSAGE =
	'Atomize can send anonymous usage data (which commands run and how they end, never your work items, org or templates) to PostHog, to help prioritise fixes. It applies to the Atomize CLI, Studio and this extension.';

/** Memoizes an async factory; kept local so this module needs nothing from `vscode`. */
function memoize<T>(factory: () => Promise<T>): () => Promise<T> {
	let promise: Promise<T> | undefined;
	return () => {
		promise ??= factory().catch(error => {
			promise = undefined;
			throw error;
		});
		return promise;
	};
}

export class ExtensionTelemetry {
	private nudgeChecked = false;
	private vscodeEnabled: boolean;
	private readonly subscription: { dispose(): void };
	private readonly client: () => Promise<TelemetryClient>;

	constructor(private readonly deps: ExtensionTelemetryDeps) {
		this.vscodeEnabled = deps.isVscodeTelemetryEnabled();
		this.subscription = deps.onDidChangeVscodeTelemetryEnabled(enabled => { this.vscodeEnabled = enabled; });
		this.client = memoize(async () => {
			const pkg = await deps.loadPackage();
			return pkg.createTelemetryClient({
				surface: 'vscode',
				atomizeVersion: deps.atomizeVersion,
				gate: () => this.vscodeEnabled,
				...(deps.consentPath ? { consentPath: deps.consentPath } : {}),
				...(deps.env ? { env: deps.env } : {}),
				...(deps.fetch ? { fetch: deps.fetch } : {}),
				...(deps.projectKey !== undefined ? { projectKey: deps.projectKey } : {}),
			});
		});
	}

	dispose(): void {
		this.subscription.dispose();
	}

	/** Sends an event if both gates allow it. Never throws and never waits for the network. */
	track(event: TelemetryEventInput): void {
		if (!this.vscodeEnabled) return;
		void this.client().then(client => client.track(event), () => undefined);
	}

	sessionStarted(): void {
		this.track({ event: 'session_started' });
	}

	/** Reports how an action ended. A success is also the moment the one-time nudge may appear. */
	finished<A extends TelemetryAction>(action: A, props: ActionProps<A>, ending: Ending, startedAt: number): void {
		if (!this.vscodeEnabled) return;
		const durationMs = Math.min(Date.now() - startedAt, 7 * 24 * 60 * 60 * 1000);
		void (async () => {
			const pkg = await this.deps.loadPackage();
			let outcome: 'success' | 'failure' | 'cancelled';
			let errorCategory: ErrorCategory | undefined;
			if ('error' in ending) {
				const classified = pkg.categorizeError(ending.error);
				outcome = classified.outcome;
				if (classified.outcome === 'failure') errorCategory = classified.errorCategory;
			} else {
				outcome = ending.outcome;
				if (ending.outcome === 'failure') errorCategory = ending.errorCategory;
			}
			this.track({
				event: 'command_finished',
				action,
				outcome,
				...(errorCategory ? { errorCategory } : {}),
				durationMs,
				...props,
			} as TelemetryEventInput);
			if (outcome === 'success') this.maybeNudge();
		})().catch(() => undefined);
	}

	/** Wraps a command handler so it reports one `command_finished`; a throw is a failure and is rethrown. */
	instrument<A extends TelemetryAction, Args extends unknown[]>(
		action: A,
		defaults: ActionProps<A>,
		handler: (run: CommandRun<ActionProps<A>>, ...args: Args) => unknown,
	): (...args: Args) => Promise<void> {
		return async (...args) => {
			const startedAt = Date.now();
			const props = { ...defaults };
			let cancelled = false;
			let failure: { error: unknown } | undefined;
			const run: CommandRun<ActionProps<A>> = {
				set: next => void Object.assign(props, next),
				cancelled: () => { cancelled = true; },
				failed: error => { failure = { error }; },
			};
			try {
				await handler(run, ...args);
			} catch (error) {
				this.finished(action, props, { error }, startedAt);
				throw error;
			}
			this.finished(action, props, failure ?? { outcome: cancelled ? 'cancelled' : 'success' }, startedAt);
		};
	}

	async flush(capMs: number): Promise<void> {
		try {
			await (await this.client()).flush(capMs);
		} catch {
			// best effort
		}
	}

	/**
	 * The one-time Telemetry Nudge, after the first successful Atomize command and only while VS
	 * Code's switch is on and the user has not decided. The shared file is read here, once, not at
	 * activation. "Learn more" is not an answer, so the question comes back after the docs open.
	 */
	private maybeNudge(): void {
		if (this.nudgeChecked || !this.vscodeEnabled) return;
		this.nudgeChecked = true;
		void (async () => {
			const pkg = await this.deps.loadPackage();
			const env = this.deps.env ?? process.env;
			const path = this.deps.consentPath;
			const state = pkg.readConsent(path);
			if (state.enabled !== undefined || state.nudged.vscode || pkg.envOverride(env)) return;
			for (;;) {
				const choice = await this.deps.ui.showInformationMessage(NUDGE_MESSAGE, 'Enable', 'Not now', 'Learn more');
				if (choice === 'Learn more') {
					await this.deps.ui.openExternal(pkg.TELEMETRY_DOCS_URL);
					continue;
				}
				if (choice === 'Enable') await this.enable('vscode-notification');
				else pkg.markNudged('vscode', path ? { path } : {});
				return;
			}
		})().catch(() => undefined);
	}

	async enable(source: 'command' | 'vscode-notification' = 'command'): Promise<void> {
		const pkg = await this.deps.loadPackage();
		const path = this.deps.consentPath;
		pkg.setConsent(true, path ? { path } : {});
		this.track({ event: 'telemetry_enabled', source: source === 'command' ? 'command' : 'vscode-notification' });
		const notes = [];
		if (!this.vscodeEnabled) notes.push("VS Code's telemetry setting is off, so the extension sends nothing until it is on.");
		const override = pkg.envOverride(this.deps.env ?? process.env);
		if (override) notes.push(`${override} is set in this environment, so nothing is sent.`);
		void this.deps.ui.showInformationMessage(
			['Atomize telemetry enabled for the CLI, Studio and this extension.', ...notes].join(' '),
		);
	}

	async disable(): Promise<void> {
		const pkg = await this.deps.loadPackage();
		const path = this.deps.consentPath;
		const { anonymousId } = pkg.setConsent(false, path ? { path } : {});
		void this.deps.ui.showInformationMessage(
			`Atomize telemetry disabled everywhere. Nothing was sent.${anonymousId ? ` Your Anonymous ID is ${anonymousId}; use "Atomize: Request Deletion of Telemetry Data" to erase what was already sent.` : ''}`,
		);
	}

	async showStatus(): Promise<void> {
		const pkg = await this.deps.loadPackage();
		const state = pkg.readConsent(this.deps.consentPath);
		const override = pkg.envOverride(this.deps.env ?? process.env);
		const saved = state.enabled === undefined ? 'not decided' : state.enabled ? 'enabled' : 'disabled';
		const parts = [
			override
				? `Atomize telemetry: disabled by ${override} (your saved choice: ${saved}).`
				: `Atomize telemetry: ${saved}.`,
			this.vscodeEnabled ? 'VS Code telemetry: on.' : "VS Code telemetry: off, so this extension sends nothing.",
			`Anonymous ID: ${state.anonymousId ?? 'none yet'}.`,
		];
		const choice = await this.deps.ui.showInformationMessage(parts.join(' '), 'Learn more');
		if (choice === 'Learn more') await this.deps.ui.openExternal(pkg.TELEMETRY_DOCS_URL);
	}

	/** A data-subject request, not telemetry: sent whatever the gates say, then telemetry is turned off. */
	async requestDeletion(): Promise<void> {
		const pkg = await this.deps.loadPackage();
		const path = this.deps.consentPath;
		const { anonymousId } = pkg.readConsent(path);
		if (!anonymousId) {
			void this.deps.ui.showInformationMessage('No Anonymous ID exists, so no data has been sent under one. Nothing to delete.');
			return;
		}
		const confirmed = await this.deps.ui.showWarningMessage(
			'Request deletion of the usage data sent under your Anonymous ID? This also disables Atomize telemetry everywhere. Deletion is completed within 30 days.',
			{ modal: true },
			'Request Deletion',
		);
		if (confirmed !== 'Request Deletion') return;
		const client = await this.client();
		const sent = client.requestDeletion();
		// Keep the ID when the request didn't go out: the user still needs it to ask by email.
		if (sent) pkg.retireAnonymousId(path ? { path } : {});
		else pkg.setConsent(false, path ? { path } : {});
		await client.flush(300);
		void this.deps.ui.showInformationMessage(
			sent
				? `Deletion requested for Anonymous ID ${anonymousId}. Telemetry is now disabled, and enabling it again creates a new Anonymous ID.`
				: `Telemetry is now disabled. The request could not be sent from this build; quote Anonymous ID ${anonymousId} when you ask for deletion: ${pkg.TELEMETRY_DOCS_URL}`,
		);
	}
}

let instance: ExtensionTelemetry | undefined;

export function initExtensionTelemetry(deps: ExtensionTelemetryDeps): ExtensionTelemetry {
	instance = new ExtensionTelemetry(deps);
	return instance;
}

export function resetExtensionTelemetryForTesting(): void {
	instance = undefined;
}

/** What the commands call. Before activation wires it up (and in tests that don't), it does nothing. */
export const telemetry = {
	instrument<A extends TelemetryAction, Args extends unknown[]>(
		action: A,
		defaults: ActionProps<A>,
		handler: (run: CommandRun<ActionProps<A>>, ...args: Args) => unknown,
	): (...args: Args) => Promise<void> {
		return async (...args) => {
			if (instance) return instance.instrument(action, defaults, handler)(...args);
			const noop: CommandRun<ActionProps<A>> = { set() {}, cancelled() {}, failed() {} };
			await handler(noop, ...args);
		};
	},
	finished<A extends TelemetryAction>(action: A, props: ActionProps<A>, ending: Ending, startedAt: number): void {
		instance?.finished(action, props, ending, startedAt);
	},
};
