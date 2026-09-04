import { type Accessor, createMemo, createSignal, For, Show } from "solid-js";
import type { OriginBaselineSession } from "../diff/origin-baseline";
import {
  isAuthoringStoreReadyForReview,
  SECTION_META,
  type SectionId,
  type SectionStores,
} from "../stores/sections";
import type { GroundingSession } from "./GroundingSettings";
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
import type { OnlineValidationSession } from "./sections/ReviewSection";

const OPTIONAL_SECTIONS = new Set<SectionId>(["metadata"]);

function SectionContent(props: { id: SectionId; stores: SectionStores; canReview: boolean; grounding: GroundingSession; autoNormalize: boolean; onAutoNormalizeChange: () => void; openFilePath?: string; sidecarAvailable: Accessor<boolean>; onlineValidation: OnlineValidationSession; originBaseline: OriginBaselineSession; onManageProjects: () => void }) {
  return (
    <>
      <Show when={props.id === "basic-info"}>
        <BasicInfoSection store={props.stores["basic-info"]} />
      </Show>
      <Show when={props.id === "filter"}>
        <FilterSection store={props.stores.filter} grounding={props.grounding} />
      </Show>
      <Show when={props.id === "tasks"}>
        <TasksSection store={props.stores.tasks} grounding={props.grounding} conditionWorkItemTypes={props.stores.filter.fields.workItemTypes} autoNormalize={props.autoNormalize} onAutoNormalizeChange={props.onAutoNormalizeChange} />
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
        <ReviewSection store={props.stores} canReview={props.canReview} openFilePath={props.openFilePath} grounding={props.grounding} sidecarAvailable={props.sidecarAvailable} onlineValidation={props.onlineValidation} originBaseline={props.originBaseline} onManageProjects={props.onManageProjects} />
      </Show>
    </>
  );
}

export function AtomizeStudio(props: { stores: SectionStores; onDiscard: () => void; initialSection?: SectionId; aiDraftReady?: boolean; openFilePath?: string; grounding: GroundingSession; sidecarAvailable: Accessor<boolean>; onlineValidation: OnlineValidationSession; originBaseline: OriginBaselineSession; onManageProjects: () => void }) {
  const stores = props.stores;
  const [active, setActive] = createSignal<SectionId>(props.initialSection ?? "basic-info");
  const [confirmReset, setConfirmReset] = createSignal(false);
  const [autoNormalize, setAutoNormalize] = createSignal(false);
  const grounding = props.grounding;

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
    <div class="ui-proto-root">
      <div class="border-b border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-900 sm:px-7">
        <button
          class="text-sm font-semibold text-rose-600 hover:underline dark:text-rose-400"
          type="button"
          onClick={() => setConfirmReset(true)}
        >
          Discard draft
        </button>
      </div>
      <div class="h-1 w-full bg-slate-100 dark:bg-slate-800" role="presentation">
        <div class="h-full bg-emerald-400 transition-all" style={{ width: `${completion()}%` }} />
      </div>
      <main class="grid w-full gap-6 px-5 py-6 lg:grid-cols-[15rem_minmax(0,1fr)_14rem] lg:px-7 lg:py-8">
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
        </aside>
        <section class="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
          <Show when={props.aiDraftReady}><div class="mb-6 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-semibold text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950 dark:text-indigo-100">AI draft ready to review — check the highlighted fields before saving.</div></Show>
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
            <SectionContent id={active()} stores={stores} canReview={allSectionsValid()} grounding={grounding} autoNormalize={autoNormalize()} onAutoNormalizeChange={() => setAutoNormalize((value) => !value)} openFilePath={props.openFilePath} sidecarAvailable={props.sidecarAvailable} onlineValidation={props.onlineValidation} originBaseline={props.originBaseline} onManageProjects={props.onManageProjects} />
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
            <h2 id="reset-title" class="text-xl font-bold text-slate-950 dark:text-white">Discard this draft?</h2>
            <p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Everything you have entered will be reset. This cannot be undone.</p>
            <div class="mt-6 flex justify-end gap-3">
              <button class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700" type="button" onClick={() => setConfirmReset(false)}>Cancel</button>
              <button class="rounded-lg !border-0 !bg-rose-600 px-4 py-2 text-sm font-semibold !text-white !shadow-none hover:!bg-rose-500" type="button" onClick={props.onDiscard}>Discard draft</button>
            </div>
          </section>
        </div>
      </Show>
    </div>
  );
}
