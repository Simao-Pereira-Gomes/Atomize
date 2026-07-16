import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import { addAzureDevOpsProfile, removeConnectionProfile, rotateAzureDevOpsToken } from "../cli/cli-bridge";
import {
  type AzureDevOpsProfile,
  type GroundedFieldOptions,
  listAzureDevOpsProfiles,
  loadGroundedFieldOptions,
} from "../grounding/grounding-service";
import {
  isAuthoringStoreReadyForReview,
  SECTION_META,
  type SectionId,
  type SectionStores,
} from "../stores/sections";
import { type GroundingSession, GroundingSettings } from "./GroundingSettings";
import { sectionFilledCount, sectionStatus, usesDefaultSectionSettings } from "./section-status";
import {
  BasicInfoSection,
  EstimationSection,
  FilterSection,
  MetadataSection,
  ReviewSection,
  TasksSection,
  ValidationSection,
} from "./sections";

const OPTIONAL_SECTIONS = new Set<SectionId>(["metadata"]);

function SectionContent(props: { id: SectionId; stores: SectionStores; canReview: boolean; grounding: GroundingSession }) {
  return (
    <>
      <Show when={props.id === "basic-info"}>
        <BasicInfoSection store={props.stores["basic-info"]} />
      </Show>
      <Show when={props.id === "filter"}>
        <FilterSection store={props.stores.filter} grounding={props.grounding} />
      </Show>
      <Show when={props.id === "tasks"}>
        <TasksSection store={props.stores.tasks} />
      </Show>
      <Show when={props.id === "estimation"}>
        <EstimationSection store={props.stores.estimation} />
      </Show>
      <Show when={props.id === "validation"}>
        <ValidationSection store={props.stores.validation} />
      </Show>
      <Show when={props.id === "metadata"}>
        <MetadataSection store={props.stores.metadata} />
      </Show>
      <Show when={props.id === "review"}>
        <ReviewSection store={props.stores} canReview={props.canReview} />
      </Show>
    </>
  );
}

export function TemplateBuilder(props: { stores: SectionStores; onChangeStartingPath: () => void }) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const [theme, setTheme] = createSignal<"light" | "dark">(prefersDark ? "dark" : "light");
  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  const stores = props.stores;
  const [active, setActive] = createSignal<SectionId>("basic-info");
  const [confirmReset, setConfirmReset] = createSignal(false);
  const [profiles, setProfiles] = createSignal<AzureDevOpsProfile[]>([]);
  const [grounded, setGrounded] = createSignal<GroundedFieldOptions>();
  const [selectedProfile, setSelectedProfile] = createSignal("");
  const [groundingState, setGroundingState] = createSignal<"idle" | "loading" | "ready" | "error">("idle");
  const [groundingError, setGroundingError] = createSignal("");

  onMount(async () => {
    try { setProfiles(await listAzureDevOpsProfiles()); } catch { /* Connecting is optional. */ }
  });
  const loadGrounding = async (profile = selectedProfile()) => {
    if (!profile) { setGrounded(undefined); setGroundingState("idle"); return true; }
    setGroundingState("loading"); setGroundingError("");
    try { setGrounded(await loadGroundedFieldOptions(profile)); setGroundingState("ready"); return true; }
    catch (error) { setGroundingState("error"); setGroundingError(error instanceof Error ? error.message : "We could not get project choices right now."); return false; }
  };
  const grounding: GroundingSession = {
    profiles,
    selectedProfile,
    options: grounded,
    state: groundingState,
    error: groundingError,
    selectProfile: async (profile) => { setSelectedProfile(profile); return loadGrounding(profile); },
    refresh: () => loadGrounding(),
    addProject: async (project) => {
      await addAzureDevOpsProfile(project);
      const available = await listAzureDevOpsProfiles();
      setProfiles(available);
      setSelectedProfile(project.name);
      await loadGrounding(project.name);
    },
    rotateToken: async (name, pat) => { await rotateAzureDevOpsToken(name, pat); },
    removeProject: async (name) => {
      await removeConnectionProfile(name);
      const available = await listAzureDevOpsProfiles();
      setProfiles(available);
      if (selectedProfile() === name) { setSelectedProfile(""); setGrounded(undefined); setGroundingState("idle"); }
    },
  };

  const filledCount = (id: SectionId) =>
    id === "review" ? 0 : sectionFilledCount(stores, id);
  const allSectionsValid = createMemo(() => isAuthoringStoreReadyForReview(stores));
  const statusFor = (id: SectionId): "ok" | "warn" | "neutral" =>
    id === "review" ? (allSectionsValid() ? "ok" : "neutral") : sectionStatus(stores, id);
  const usesDefaultsFor = (id: SectionId) =>
    id !== "review" && usesDefaultSectionSettings(stores, id);
  const isOptionalSection = (id: SectionId) => OPTIONAL_SECTIONS.has(id);
  const activeMeta = createMemo(() => SECTION_META.find((s) => s.id === active()));
  const completedSections = createMemo(
    () => SECTION_META.filter((section) => statusFor(section.id) === "ok").length,
  );
  const completion = createMemo(() => Math.round((completedSections() / SECTION_META.length) * 100));
  const tabNumber = (id: SectionId) => String(SECTION_META.findIndex((section) => section.id === id) + 1).padStart(2, "0");
  const nextSections = createMemo(() => {
    const currentIndex = SECTION_META.findIndex((section) => section.id === active());
    return SECTION_META.slice(currentIndex + 1, currentIndex + 4);
  });

  return (
    <div
      class={`ui-proto-root min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100 ${theme() === "dark" ? "dark" : ""}`}
      data-theme={theme()}
    >
      <header class="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-7">
        <div class="flex min-w-0 items-center gap-3">
          <div class="grid size-8 shrink-0 place-items-center rounded-lg bg-indigo-600 text-sm font-black text-white">
            A
          </div>
          <div class="min-w-0">
            <p class="truncate font-semibold tracking-tight text-slate-950 dark:text-white">Atomize</p>
            <p class="hidden text-xs text-slate-500 dark:text-slate-400 sm:block">Template Builder</p>
          </div>
        </div>
        <div class="flex items-center gap-2 sm:gap-3">
          <button
            class="hidden text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400 md:block"
            type="button"
            onClick={() => setConfirmReset(true)}
          >
            Change starting path
          </button>
          <GroundingSettings session={grounding} />
          <span class="hidden text-sm text-slate-500 dark:text-slate-400 md:inline">
            {completedSections()} of {SECTION_META.length} sections ready
          </span>
          <button
            class="grid size-9 place-items-center rounded-lg !border-0 !bg-slate-100 text-slate-600 !shadow-none hover:!bg-slate-200 dark:!bg-slate-800 dark:text-slate-300 dark:hover:!bg-slate-700"
            type="button"
            onClick={toggleTheme}
            title="Toggle light/dark mode"
            aria-label="Toggle light/dark mode"
          >
            {theme() === "dark" ? "☀" : "☾"}
          </button>
          <button
            class="hidden rounded-lg !border-0 !bg-emerald-600 px-4 py-2 text-sm font-semibold !text-white !shadow-none hover:!bg-emerald-500 sm:block"
            type="button"
            disabled={!allSectionsValid()}
          >
            Save template
          </button>
        </div>
      </header>
      <main class="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[18rem_minmax(0,1fr)_17rem] lg:px-7 lg:py-8">
        <aside class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:top-6 lg:h-fit">
          <p class="px-3 pb-2 pt-1 text-xs font-bold tracking-widest text-slate-400 uppercase">
            Build a template
          </p>
          <ol class="space-y-1">
            <For each={SECTION_META}>
              {(section, index) => {
                const status = () => statusFor(section.id);
                const usesDefaults = () => usesDefaultsFor(section.id);
                const isOptional = () => isOptionalSection(section.id);
                return (
                  <li>
                    <button
                      type="button"
                      class={`flex w-full items-center gap-3 rounded-xl !border-0 px-3 py-3 text-left !shadow-none transition ${active() === section.id ? "!bg-indigo-50 font-semibold text-indigo-700 dark:!bg-indigo-950/60 dark:text-indigo-200" : "!bg-transparent text-slate-600 hover:!bg-slate-100 dark:text-slate-300 dark:hover:!bg-slate-800"}`}
                      onClick={() => setActive(section.id)}
                      aria-label={`${section.label}${isOptional() ? " (optional)" : ""} — ${status() === "ok" ? (usesDefaults() ? "ready with defaults" : "complete") : status() === "warn" ? "needs attention" : "in progress"}`}
                    >
                      <span
                        class={`grid size-5 shrink-0 place-items-center rounded-full border text-xs font-bold ${status() === "warn" ? "border-amber-500 bg-amber-500 text-white" : active() === section.id ? "border-indigo-600 bg-indigo-600 text-white" : status() === "ok" ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-slate-500 dark:border-slate-600 dark:text-slate-400"}`}
                      >
                        {status() === "ok" ? "✓" : index() + 1}
                      </span>
                      <span class="min-w-0 flex-1 truncate text-sm">{section.label}</span>
                      <Show when={filledCount(section.id) > 0}>
                        <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          {filledCount(section.id)}
                        </span>
                      </Show>
                      <Show when={usesDefaults()}>
                        <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          Standard settings
                        </span>
                      </Show>
                      <Show when={isOptional()}>
                        <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          Optional
                        </span>
                      </Show>
                    </button>
                  </li>
                );
              }}
            </For>
          </ol>
          <button
            class="mt-3 w-full rounded-lg !border-0 !bg-emerald-600 px-4 py-2.5 text-sm font-semibold !text-white !shadow-none hover:!bg-emerald-500 sm:hidden"
            type="button"
            disabled={!allSectionsValid()}
          >
            Save template
          </button>
        </aside>
        <section class="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
          <div class="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800">
            <div>
              <p class="text-sm font-semibold text-indigo-600 dark:text-indigo-400">Template details</p>
              <h1 class="mt-1 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
                {activeMeta()?.label}
              </h1>
              <p class="mt-2 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">
                {activeMeta()?.description}
              </p>
            </div>
            <span
              class={`rounded-full px-3 py-1 text-xs font-bold ${statusFor(active()) === "ok" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : statusFor(active()) === "warn" ? "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}
            >
              {statusFor(active()) === "ok"
                ? usesDefaultsFor(active())
                  ? "Ready · using standard settings"
                  : "Ready"
                : statusFor(active()) === "warn"
                  ? "Needs attention"
                  : "In progress"}
            </span>
          </div>
          <div class="mt-7">
            <SectionContent id={active()} stores={stores} canReview={allSectionsValid()} grounding={grounding} />
          </div>
        </section>
        <aside class="space-y-4 lg:sticky lg:top-6 lg:h-fit">
          <section class="rounded-2xl bg-slate-900 p-5 text-white shadow-sm dark:bg-slate-800">
            <p class="text-xs font-bold tracking-widest text-slate-400 uppercase">Template health</p>
            <p class="mt-3 text-3xl font-bold">
              {completedSections()} / {SECTION_META.length}
            </p>
            <p class="mt-1 text-sm text-slate-300">sections ready to save</p>
            <div class="mt-5 h-2 overflow-hidden rounded-full bg-slate-700">
              <div class="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${completion()}%` }} />
            </div>
          </section>
          <Show when={nextSections().length > 0}>
          <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p class="text-sm font-bold text-slate-950 dark:text-white">Next steps</p>
            <ol class="mt-3 space-y-3">
              <For each={nextSections()}>
                {(section) => (
                  <li class="flex gap-3 text-sm text-slate-600 dark:text-slate-300">
                    <span class="font-mono text-slate-400">{tabNumber(section.id)}</span>
                    <span>{section.label}</span>
                  </li>
                )}
              </For>
            </ol>
          </section>
          </Show>
          <section class="rounded-2xl border border-indigo-100 bg-indigo-50 p-5 text-sm leading-6 text-indigo-900 dark:border-indigo-950 dark:bg-indigo-950/50 dark:text-indigo-100">
            <p class="font-semibold">Tip</p>
            <p class="mt-1 text-indigo-700 dark:text-indigo-200">
              Complete the basic information first; it gives the rest of the Template a clear identity.
            </p>
          </section>
        </aside>
      </main>
      <Show when={confirmReset()}>
        <div class="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-5" role="presentation">
          <section class="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900" role="dialog" aria-modal="true" aria-labelledby="reset-title">
            <h2 id="reset-title" class="text-xl font-bold text-slate-950 dark:text-white">Change starting path?</h2>
            <p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Everything you have entered will be reset. This cannot be undone.</p>
            <div class="mt-6 flex justify-end gap-3">
              <button class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700" type="button" onClick={() => setConfirmReset(false)}>Cancel</button>
              <button class="rounded-lg !border-0 !bg-rose-600 px-4 py-2 text-sm font-semibold !text-white !shadow-none hover:!bg-rose-500" type="button" onClick={props.onChangeStartingPath}>Reset and change path</button>
            </div>
          </section>
        </div>
      </Show>
    </div>
  );
}
