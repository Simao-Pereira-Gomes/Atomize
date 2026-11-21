/**
 * The one-time inline Telemetry Nudge: a banner, not a toast system. It appears after the first
 * successful action while the user is undecided, and the sidecar has already recorded it as shown
 * (`nudged.studio`) by the time it renders, so it can never come back.
 */
export function TelemetryBanner(props: { onEnable: () => void; onNotNow: () => void; onSettings: () => void }) {
	return (
		<section aria-label="Usage data" class="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-200 bg-indigo-50 px-5 py-3 text-sm text-indigo-950 dark:border-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-100 sm:px-7">
			<p class="min-w-0 flex-1">
				Share anonymous usage data to help improve Atomize? Never your work items or templates.
			</p>
			<div class="flex shrink-0 items-center gap-2">
				<button type="button" class="rounded-lg !border-0 !bg-indigo-600 px-3 py-1.5 text-sm font-semibold !text-white !shadow-none hover:!bg-indigo-500" onClick={props.onEnable}>Enable</button>
				<button type="button" class="rounded-lg border border-indigo-300 px-3 py-1.5 text-sm font-semibold dark:border-indigo-700" onClick={props.onNotNow}>Not now</button>
				<button type="button" class="rounded-lg border border-indigo-300 px-3 py-1.5 text-sm font-semibold dark:border-indigo-700" onClick={props.onSettings}>Settings</button>
			</div>
		</section>
	);
}
