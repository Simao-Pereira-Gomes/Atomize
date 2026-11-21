import { Switch } from "@kobalte/core";
import { TELEMETRY_DOCS_URL } from "@sppg2001/atomize-telemetry/docs";
import { createSignal, onMount, Show } from "solid-js";
import { openInBrowser } from "../links/open-in-browser";
import { reportFinished, requestTelemetryDeletion, setTelemetryConsent, type TelemetryStatus, telemetryStatus } from "../telemetry/telemetry";

/**
 * Global Settings › Usage data. The sidecar owns the consent file, so this reads `telemetry.status`
 * every time it opens: a change made from the CLI or VS Code shows up the next time it is opened.
 */
export function UsageDataSettings() {
	const [status, setStatus] = createSignal<TelemetryStatus>();
	const [message, setMessage] = createSignal("");
	const [confirmingDeletion, setConfirmingDeletion] = createSignal(false);
	const [busy, setBusy] = createSignal(false);
	const [detailsOpen, setDetailsOpen] = createSignal(false);
	const [copied, setCopied] = createSignal(false);

	// The ID is also select-all text, so a blocked clipboard still lets the user copy it by hand.
	const copyId = async (id: string) => {
		try {
			await navigator.clipboard.writeText(id);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1500);
		} catch {
			setMessage("Select the ID and copy it with your keyboard.");
		}
	};

	const refresh = async () => {
		const openedAt = Date.now();
		try {
			setStatus(await telemetryStatus());
			setMessage("");
			reportFinished("telemetry.status", {}, { outcome: "success" }, openedAt);
		} catch {
			setMessage("Usage data settings are unavailable while the companion process recovers.");
		}
	};
	onMount(() => void refresh());

	const decide = async (enable: boolean) => {
		setBusy(true);
		try {
			setStatus(await setTelemetryConsent(enable ? "enable" : "disable"));
			setMessage("");
		} catch {
			setMessage("We could not save that choice. Try again.");
		} finally {
			setBusy(false);
		}
	};

	const requestDeletion = async () => {
		setBusy(true);
		try {
			const result = await requestTelemetryDeletion();
			setConfirmingDeletion(false);
			setMessage(
				result.sent
					? "Deletion requested (completed within 30 days). Usage data is off."
					: "Usage data is off. The request could not be sent from this build; see Learn more.",
			);
			await refresh();
		} catch {
			setMessage("We could not request deletion. Try again.");
		} finally {
			setBusy(false);
		}
	};

	return (
		<div class="space-y-2" data-testid="usage-data-settings">
			<Show when={status()} fallback={<Show when={message()}><p role="alert" class="text-xs text-slate-500 dark:text-slate-400">{message()}</p></Show>}>
				{(current) => (
					<>
						<Switch.Root class="flex cursor-pointer items-center justify-between gap-3" checked={current().state === "enabled"} disabled={busy()} onChange={(enable) => void decide(enable)}>
							<Switch.Input />
							<Switch.Label class="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-200">Share anonymous usage data</Switch.Label>
							<Switch.Control class="sk-switch-control shrink-0">
								<Switch.Thumb class="sk-switch-thumb" />
							</Switch.Control>
						</Switch.Root>
						<Show when={current().override}>
							{(override) => <p class="text-xs text-amber-700 dark:text-amber-300">Turned off by {override()}.</p>}
						</Show>
						<button
							type="button"
							class="flex items-center gap-1.5 !border-0 !bg-transparent !p-0 text-xs font-semibold text-slate-500 !shadow-none hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
							aria-expanded={detailsOpen()}
							onClick={() => setDetailsOpen((open) => !open)}
						>
							<svg aria-hidden="true" viewBox="0 0 12 12" class={`size-3 shrink-0 transition-transform ${detailsOpen() ? "rotate-90" : ""}`} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
								<path d="M4.5 2.5 8 6l-3.5 3.5" />
							</svg>
							Details
						</button>
						<Show when={detailsOpen()}>
							<div class="space-y-2.5 border-t border-slate-100 pt-2.5 dark:border-slate-800">
								<p class="text-xs leading-5 text-slate-600 dark:text-slate-300">
									Actions and counts only, shared with the CLI and VS Code. Never your work items or templates.{" "}
									<button type="button" class="!border-0 !bg-transparent !p-0 font-semibold text-indigo-700 !shadow-none hover:underline dark:text-indigo-300" onClick={() => void openInBrowser(TELEMETRY_DOCS_URL).catch(() => setMessage("We could not open the page in your browser."))}>Learn more</button>
								</p>
								<Show when={current().anonymousId}>
									{(id) => (
										<>
											<div class="space-y-1">
												<div class="flex items-center justify-between">
													<p class="text-xs font-semibold text-slate-500 dark:text-slate-400">Anonymous ID</p>
													<button type="button" class="!border-0 !bg-transparent !p-0 text-xs font-semibold text-indigo-700 !shadow-none hover:underline dark:text-indigo-300" onClick={() => void copyId(id())}>
														{copied() ? "Copied" : "Copy"}
													</button>
												</div>
												<code class="block select-all break-all font-mono text-[11px] leading-4 text-slate-700 dark:text-slate-200">{id()}</code>
											</div>
											<Show
												when={confirmingDeletion()}
												fallback={
													<button type="button" class="rounded-md border border-rose-300 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40" onClick={() => setConfirmingDeletion(true)}>
														Request deletion
													</button>
												}
											>
												<div class="flex items-center gap-2">
													<button type="button" class="rounded-md !border-0 !bg-rose-600 px-2.5 py-1 text-xs font-semibold !text-white !shadow-none hover:!bg-rose-500 disabled:opacity-60" disabled={busy()} onClick={() => void requestDeletion()}>Delete my data</button>
													<button type="button" class="!border-0 !bg-transparent !p-0 text-xs font-semibold text-slate-500 !shadow-none hover:underline dark:text-slate-400" onClick={() => setConfirmingDeletion(false)}>Cancel</button>
												</div>
											</Show>
										</>
									)}
								</Show>
							</div>
						</Show>
						<Show when={message()}><p role="status" class="text-xs text-slate-500 dark:text-slate-400">{message()}</p></Show>
					</>
				)}
			</Show>
		</div>
	);
}
