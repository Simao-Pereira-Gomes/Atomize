import { type Accessor, createEffect, createSignal, For, Show } from "solid-js";
import type { NewAzureDevOpsProfile } from "../connections/connection-client";
import type {
	AzureDevOpsProfile,
	GroundedFieldOptions,
} from "../grounding/grounding-service";
import { dismissOverlay } from "./dismiss-overlay";

// Tauri command errors (e.g. `connection_add_profile`, `connection_rotate_token`) reject
// with the plain `String` the Rust side returned, not an `Error` instance, so checking
// `instanceof Error` alone would always miss the actual backend message.
function errorMessage(error: unknown, fallback: string): string {
	if (typeof error === "string") return error;
	if (error instanceof Error) return error.message;
	return fallback;
}

export type GroundingSession = {
	profiles: () => AzureDevOpsProfile[];
	selectedProfile: () => string;
	options: () => GroundedFieldOptions | undefined;
	state: () => "idle" | "loading" | "ready" | "error";
	error: () => string;
	selectProfile: (profile: string) => Promise<boolean>;
	refresh: () => Promise<boolean>;
	addProject: (project: NewAzureDevOpsProfile) => Promise<void>;
	rotateToken: (name: string, pat: string) => Promise<void>;
	setDefault: (name: string) => Promise<void>;
	removeProject: (name: string) => Promise<void>;
};

function ProjectIcon(props: { project: string; active: boolean }) {
	return (
		<span
			class={`grid size-9 place-items-center rounded-xl text-sm font-bold ${props.active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}
		>
			{props.project.slice(0, 1).toUpperCase()}
		</span>
	);
}

export function GroundingSettings(props: { session: GroundingSession; sidecarAvailable: Accessor<boolean>; openManagerRequest?: Accessor<number> }) {
	const [quickOpen, setQuickOpen] = createSignal(false);
	const [manageOpen, setManageOpen] = createSignal(false);
	const [managedProfileName, setManagedProfileName] = createSignal("");
	const [adding, setAdding] = createSignal(false);
	const [formError, setFormError] = createSignal("");
	const [name, setName] = createSignal("");
	const [organizationUrl, setOrganizationUrl] = createSignal("");
	const [project, setProject] = createSignal("");
	const [team, setTeam] = createSignal("");
	const [pat, setPat] = createSignal("");
	const [rotating, setRotating] = createSignal(false);
	const [newPat, setNewPat] = createSignal("");
	const [connecting, setConnecting] = createSignal(false);
	let lastManagerRequest = 0;
	let quickTriggerRef: HTMLButtonElement | undefined;
	let quickPanelRef: HTMLDivElement | undefined;
	let managePanelRef: HTMLElement | undefined;
	dismissOverlay(quickOpen, () => setQuickOpen(false), () => [quickTriggerRef, quickPanelRef]);
	dismissOverlay(manageOpen, () => setManageOpen(false), () => [managePanelRef]);
	const activeProfile = () =>
		props.session
			.profiles()
			.find((profile) => profile.name === props.session.selectedProfile());
	const managedProfile = () =>
		props.session
			.profiles()
			.find((profile) => profile.name === managedProfileName());

	createEffect(() => {
		if (props.session.state() === "error") setQuickOpen(true);
	});

	const connect = async (profile: string) => {
		if (connecting() || !props.sidecarAvailable()) return;
		setConnecting(true);
		const connected = await props.session.selectProfile(profile);
		setConnecting(false);
		if (connected) setQuickOpen(false);
	};
	const disconnect = () => {
		void props.session.selectProfile("");
		setQuickOpen(false);
	};
	const openManagement = () => {
		setQuickOpen(false);
		setAdding(false);
		setRotating(false);
		setManagedProfileName(
			props.session.selectedProfile() ||
				props.session.profiles()[0]?.name ||
				"",
		);
		setManageOpen(true);
	};
	createEffect(() => {
		const request = props.openManagerRequest?.() ?? 0;
		if (request > lastManagerRequest) { lastManagerRequest = request; openManagement(); }
	});
	const addProject = async (event: SubmitEvent) => {
		event.preventDefault();
		setFormError("");
		try {
			await props.session.addProject({
				name: name().trim(),
				organizationUrl: organizationUrl().trim(),
				project: project().trim(),
				team: team().trim(),
				pat: pat(),
			});
			setPat("");
			setManagedProfileName(name().trim());
			setAdding(false);
		} catch (error) {
			setPat("");
			setFormError(errorMessage(error, "We could not add that project."));
		}
	};
	const rotateToken = async (event: SubmitEvent) => {
		event.preventDefault();
		const profile = managedProfile();
		if (!profile) return;
		setFormError("");
		try {
			await props.session.rotateToken(profile.name, newPat());
			setNewPat("");
			setRotating(false);
			if (profile.name === props.session.selectedProfile())
				void props.session.refresh();
		} catch (error) {
			setFormError(errorMessage(error, "We could not update that token."));
		}
	};
	const setDefault = async () => {
		const profile = managedProfile();
		if (!profile) return;
		setFormError("");
		try { await props.session.setDefault(profile.name); }
		catch (error) { setFormError(errorMessage(error, "We could not set that default project.")); }
	};
	const removeManagedProject = async () => {
		const profile = managedProfile();
		if (!profile || !window.confirm(`Remove ${profile.project}?`)) return;
		await props.session.removeProject(profile.name);
		setManagedProfileName(props.session.profiles()[0]?.name || "");
	};

	return (
		<div class="relative">
			<button
				ref={quickTriggerRef}
				class="flex items-center gap-2 rounded-xl !border-0 !bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 !shadow-none hover:!bg-slate-200 dark:!bg-slate-800 dark:text-slate-200 dark:hover:!bg-slate-700"
				type="button"
				onClick={() => setQuickOpen((value) => !value)}
			>
				<span
					class={`grid size-7 place-items-center rounded-lg ${props.session.state() === "ready" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : props.session.state() === "error" ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300" : "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"}`}
				>
					{props.session.state() === "error" ? "!" : "⌘"}
				</span>
				<span class="hidden max-w-40 truncate sm:inline">
					{props.session.state() === "ready"
						? (activeProfile()?.project ?? "Work project")
						: "Work project"}
				</span>
				<span class="text-slate-400">⌄</span>
			</button>

			<Show when={quickOpen()}>
				<div ref={quickPanelRef} class="absolute right-0 top-14 z-50 w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-2xl dark:border-slate-700 dark:bg-slate-900">
					<div class="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
						<p class="font-bold text-slate-950 dark:text-white">
							Your work project
						</p>
						<p class="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
							Choose where your team’s choices come from.
						</p>
					</div>
					<div class="max-h-80 overflow-y-auto p-3 space-y-1">
						<button
							class={`flex w-full items-center gap-3 rounded-xl !border-0 p-3 text-left !shadow-none transition ${props.session.selectedProfile() === "" ? "!bg-indigo-50 dark:!bg-indigo-950/50" : "!bg-transparent hover:!bg-slate-50 dark:hover:!bg-slate-800"}`}
							type="button"
								disabled={connecting()}
							onClick={disconnect}
						>
							<span
								class={`grid size-9 place-items-center rounded-xl text-lg font-bold ${props.session.selectedProfile() === "" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}
							>
								—
							</span>
							<span class="min-w-0 flex-1">
								<span class="block font-semibold text-slate-950 dark:text-white">
									Use without a project
								</span>
								<span class="block text-sm text-slate-500 dark:text-slate-400">
									Enter template values manually
								</span>
							</span>
							<Show when={props.session.selectedProfile() === ""}>
								<span class="text-indigo-600 dark:text-indigo-300">✓</span>
							</Show>
						</button>
						<Show when={props.session.profiles().length > 0}>
							<div class="my-2 border-t border-slate-100 dark:border-slate-800" />
						</Show>
						<For each={props.session.profiles()}>
							{(profile) => (
								<button
									class={`flex w-full items-center gap-3 rounded-xl !border-0 p-3 text-left !shadow-none transition ${profile.name === props.session.selectedProfile() ? "!bg-indigo-50 dark:!bg-indigo-950/50" : "!bg-transparent hover:!bg-slate-50 dark:hover:!bg-slate-800"}`}
									type="button"
									disabled={connecting() || !props.sidecarAvailable()}
									onClick={() => void connect(profile.name)}
								>
									<ProjectIcon
										project={profile.project}
										active={profile.name === props.session.selectedProfile()}
									/>
									<span class="min-w-0 flex-1">
										<span class="block truncate font-semibold text-slate-950 dark:text-white">
											{profile.project}
										</span>
										<span class="block truncate text-sm text-slate-500 dark:text-slate-400">
											{profile.team} · Azure DevOps
										</span>
									</span>
									<Show
										when={
											connecting() &&
											profile.name === props.session.selectedProfile()
										}
										fallback={
											<Show
												when={profile.name === props.session.selectedProfile()}
											>
												<span class="text-indigo-600 dark:text-indigo-300">
													✓
												</span>
											</Show>
										}
									>
										<span class="text-sm font-semibold text-indigo-600 dark:text-indigo-300">
											Connecting…
										</span>
									</Show>
								</button>
							)}
						</For>
					</div>
					<div class="flex items-center justify-between border-t border-slate-100 px-5 py-3 dark:border-slate-800">
						<button
							class="text-sm font-semibold text-indigo-700 dark:text-indigo-300"
							type="button"
							onClick={openManagement}
						>
							Manage projects…
						</button>
						<Show when={props.session.state() === "ready"}>
							<button
								class="text-sm font-semibold text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white"
								type="button"
								disabled={!props.sidecarAvailable()}
								onClick={() => void props.session.refresh()}
							>
								Refresh
							</button>
						</Show>
					</div>
					<Show when={props.session.state() === "error"}>
						<div
							class="border-t border-rose-100 bg-rose-50 px-5 py-3 text-sm text-rose-700 dark:border-rose-950 dark:bg-rose-950/30 dark:text-rose-300"
							role="alert"
						>
							<p class="font-semibold">We couldn’t connect to that project.</p>
							<p class="mt-1">{props.session.error()}</p>
							<button
								class="mt-2 font-semibold underline"
								type="button"
								onClick={() => void props.session.refresh()}
							>
								Try again
							</button>
						</div>
					</Show>
				</div>
			</Show>

			<Show when={manageOpen()}>
				<div
					class="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-5"
					role="presentation"
				>
					<section
						ref={managePanelRef}
						class="flex max-h-[min(42rem,calc(100vh-2.5rem))] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900"
						role="dialog"
						aria-modal="true"
						aria-labelledby="manage-projects-title"
					>
						<header class="flex items-start justify-between border-b border-slate-200 px-6 py-5 dark:border-slate-800">
							<div>
								<h2
									id="manage-projects-title"
									class="text-xl font-bold text-slate-950 dark:text-white"
								>
									Manage work projects
								</h2>
								<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
									Manage the Azure DevOps connections available to this builder.
								</p>
							</div>
							<button
								class="text-lg text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white"
								type="button"
								aria-label="Close project settings"
								onClick={() => setManageOpen(false)}
							>
								×
							</button>
						</header>
						<div class="grid min-h-0 flex-1 md:grid-cols-[15rem_minmax(0,1fr)]">
							<aside class="min-h-0 overflow-y-auto border-b border-slate-200 p-3 dark:border-slate-800 md:border-b-0 md:border-r">
								<button
									class="mb-3 w-full rounded-lg !border-0 !bg-indigo-600 px-3 py-2 text-sm font-semibold !text-white !shadow-none"
									type="button"
									onClick={() => {
										setAdding(true);
										setRotating(false);
										setFormError("");
									}}
								>
									+ Add project
								</button>
								<p class="px-2 pb-2 text-xs font-bold tracking-widest text-slate-400 uppercase">
									Connections
								</p>
								<div class="space-y-1">
									<For each={props.session.profiles()}>
										{(profile) => (
											<button
												class={`flex w-full items-center gap-2 rounded-lg !border-0 p-2.5 text-left !shadow-none ${profile.name === managedProfileName() ? "!bg-indigo-50 text-indigo-700 dark:!bg-indigo-950/50 dark:text-indigo-200" : "!bg-transparent text-slate-700 hover:!bg-slate-100 dark:text-slate-200 dark:hover:!bg-slate-800"}`}
												type="button"
												onClick={() => {
													setManagedProfileName(profile.name);
													setAdding(false);
													setRotating(false);
													setFormError("");
												}}
											>
												<ProjectIcon
													project={profile.project}
													active={profile.name === managedProfileName()}
												/>
												<span class="min-w-0">
													<span class="block truncate text-sm font-semibold">
														{profile.project}
													</span>
													<span class="block truncate text-xs text-slate-500 dark:text-slate-400">
														{profile.team}
													</span>
												</span>
											</button>
										)}
									</For>
									<Show when={props.session.profiles().length === 0}>
										<p class="px-2 py-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
											No saved projects yet.
										</p>
									</Show>
								</div>
							</aside>
							<main class="min-h-0 overflow-y-auto p-6">
								<Show
									when={adding()}
									fallback={
										<Show
											when={managedProfile()}
											fallback={
												<div class="grid h-full place-items-center text-center">
													<div>
														<p class="font-semibold text-slate-950 dark:text-white">
															Choose a connection
														</p>
														<p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
															Select one from the list or add a new project.
														</p>
													</div>
												</div>
											}
										>
											{(profile) => (
												<div class="max-w-lg">
													<p class="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
														Azure DevOps connection
													</p>
													<h3 class="mt-1 text-2xl font-bold text-slate-950 dark:text-white">
														{profile().project}
													</h3>
													<dl class="mt-6 space-y-4 text-sm">
														<div>
															<dt class="font-semibold text-slate-500 dark:text-slate-400">
																Organization
															</dt>
															<dd class="mt-1 break-all text-slate-950 dark:text-white">
																{profile().organizationUrl}
															</dd>
														</div>
														<div>
															<dt class="font-semibold text-slate-500 dark:text-slate-400">
																Team
															</dt>
															<dd class="mt-1 text-slate-950 dark:text-white">
																{profile().team}
															</dd>
														</div>
													</dl>
													<div class="mt-8 border-t border-slate-200 pt-6 dark:border-slate-800">
														<Show when={!profile().isDefault}>
															<button class="mb-3 w-44 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200" type="button" onClick={() => void setDefault()}>
																Set as default
															</button>
														</Show>
														<Show
															when={!rotating()}
															fallback={
																<form class="space-y-3" onSubmit={rotateToken}>
																	<label
																		class="ui-label"
																		for="new-access-token"
																	>
																		New access token
																	</label>
																	<div class="flex gap-2">
																		<input
																			id="new-access-token"
																			class="ui-input min-w-0 flex-1"
																			required
																			type="password"
																			value={newPat()}
																			onInput={(event) =>
																				setNewPat(event.currentTarget.value)
																			}
																			autocomplete="off"
																		/>
																		<button
																			class="rounded-lg !border-0 !bg-indigo-600 px-3 text-sm font-semibold !text-white !shadow-none"
																			type="submit"
																		>
																			Save
																		</button>
																		<button
																			class="text-sm font-semibold text-slate-600 dark:text-slate-300"
																			type="button"
																			onClick={() => setRotating(false)}
																		>
																			Cancel
																		</button>
																	</div>
																	<Show when={formError()}>
																		<p class="ui-error">{formError()}</p>
																	</Show>
																</form>
															}
														>
															<Show when={!rotating()}>
																<button
																	class="w-44 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
																	type="button"
																	onClick={() => {
																		setFormError("");
																		setRotating(true);
																	}}
																>
																	Change token
																</button>
															</Show>
														</Show>
													</div>
													<div class="mt-8">
														<button
															class="w-44 rounded-lg border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700 dark:border-rose-900 dark:text-rose-300"
															type="button"
															onClick={() => void removeManagedProject()}
														>
															Remove connection
														</button>
													</div>
												</div>
											)}
										</Show>
									}
								>
									<form class="max-w-lg space-y-4" onSubmit={addProject}>
										<div>
											<p class="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
												New connection
											</p>
											<h3 class="mt-1 text-2xl font-bold text-slate-950 dark:text-white">
												Add a work project
											</h3>
											<p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
												Your access token is saved by Atomize in your system
												keychain.
											</p>
										</div>
										<input
											class="ui-input w-full"
											required
															value={name()}
															onInput={(event) => setName(event.currentTarget.value)}
											placeholder="Connection name, e.g. website-team"
										/>
										<input
											class="ui-input w-full"
											required
											type="url"
															value={organizationUrl()}
															onInput={(event) => setOrganizationUrl(event.currentTarget.value)}
											placeholder="https://dev.azure.com/your-organization"
										/>
										<div class="grid grid-cols-2 gap-3">
											<input
												class="ui-input w-full"
												required
												value={project()}
												onInput={(event) =>
													setProject(event.currentTarget.value)
												}
												placeholder="Project"
											/>
											<input
												class="ui-input w-full"
												required
												value={team()}
												onInput={(event) => setTeam(event.currentTarget.value)}
												placeholder="Team"
											/>
										</div>
										<input
											class="ui-input w-full"
											required
											type="password"
											value={pat()}
											onInput={(event) => setPat(event.currentTarget.value)}
											placeholder="Personal access token"
											autocomplete="off"
										/>
										<Show when={formError()}>
											<p class="ui-error">{formError()}</p>
										</Show>
										<div class="flex justify-end gap-3">
											<button
												class="text-sm font-semibold text-slate-600 dark:text-slate-300"
												type="button"
												onClick={() => setAdding(false)}
											>
												Cancel
											</button>
											<button
												class="rounded-lg !border-0 !bg-indigo-600 px-3 py-2 text-sm font-semibold !text-white !shadow-none"
												type="submit"
												disabled={props.session.state() === "loading"}
											>
												{props.session.state() === "loading"
													? "Adding…"
													: "Add project"}
											</button>
										</div>
									</form>
								</Show>
							</main>
						</div>
					</section>
				</div>
			</Show>
		</div>
	);
}
