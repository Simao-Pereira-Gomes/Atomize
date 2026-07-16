import { createMemo, createSignal, For, Show } from "solid-js";
import {
  type Errors,
  SECTION_META,
  type SectionId,
  type SectionStores,
  useSectionStores,
} from "../stores/sections";
import {
  BasicInfoSection,
  EstimationSection,
  FilterSection,
  MetadataSection,
  TasksSection,
  ValidationSection,
} from "./sections";

// Default field values that don't count toward "filled" status
const FILLED_DEFAULTS = new Set(["", "percentage", "none", "1.0", "build"]);

function countFilledFields(fields: Record<string, unknown>): number {
  return Object.values(fields).filter((v) =>
    Array.isArray(v)
      ? v.length > 0
      : typeof v === "boolean"
        ? false
        : !FILLED_DEFAULTS.has(v as string),
  ).length;
}

type StoreView = { errors: Errors; isValid: () => boolean; fields: Record<string, unknown> };

function storeView(stores: SectionStores, id: SectionId): StoreView {
  return stores[id] as unknown as StoreView;
}

function sectionStatus(stores: SectionStores, id: SectionId): "ok" | "warn" | "neutral" {
  const s = storeView(stores, id);
  if (Object.values(s.errors).some(Boolean)) return "warn";
  if (countFilledFields(s.fields) > 0 && s.isValid()) return "ok";
  return "neutral";
}

function SectionContent(props: { id: SectionId; stores: SectionStores }) {
  return (
    <>
      <Show when={props.id === "basic-info"}>
        <BasicInfoSection store={props.stores["basic-info"]} />
      </Show>
      <Show when={props.id === "filter"}>
        <FilterSection store={props.stores.filter} />
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
    </>
  );
}

export function TemplateBuilder() {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const [theme, setTheme] = createSignal<"light" | "dark">(prefersDark ? "dark" : "light");
  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  const stores = useSectionStores();
  const [active, setActive] = createSignal<SectionId>("basic-info");

  const filledCount = (id: SectionId) => countFilledFields(storeView(stores, id).fields);
  const statusFor = (id: SectionId) => sectionStatus(stores, id);
  const activeMeta = createMemo(() => SECTION_META.find((s) => s.id === active()));
  const allSectionsValid = createMemo(() => SECTION_META.every((s) => storeView(stores, s.id).isValid()));
  const completedSections = createMemo(
    () => SECTION_META.filter((section) => statusFor(section.id) === "ok").length,
  );
  const completion = createMemo(() => Math.round((completedSections() / SECTION_META.length) * 100));

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
      <main class="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[15rem_minmax(0,1fr)_17rem] lg:px-7 lg:py-8">
        <aside class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:top-6 lg:h-fit">
          <p class="px-3 pb-2 pt-1 text-xs font-bold tracking-widest text-slate-400 uppercase">
            Build a template
          </p>
          <ol class="space-y-1">
            <For each={SECTION_META}>
              {(section, index) => {
                const status = () => statusFor(section.id);
                return (
                  <li>
                    <button
                      type="button"
                      class={`flex w-full items-center gap-3 rounded-xl !border-0 px-3 py-3 text-left !shadow-none transition ${active() === section.id ? "!bg-indigo-50 font-semibold text-indigo-700 dark:!bg-indigo-950/60 dark:text-indigo-200" : "!bg-transparent text-slate-600 hover:!bg-slate-100 dark:text-slate-300 dark:hover:!bg-slate-800"}`}
                      onClick={() => setActive(section.id)}
                    >
                      <span
                        class={`grid size-5 shrink-0 place-items-center rounded-full border text-xs font-bold ${active() === section.id ? "border-indigo-600 bg-indigo-600 text-white" : status() === "ok" ? "border-emerald-500 bg-emerald-500 text-white" : status() === "warn" ? "border-amber-500 bg-amber-500 text-white" : "border-slate-300 text-slate-500 dark:border-slate-600 dark:text-slate-400"}`}
                      >
                        {status() === "ok" ? "✓" : index() + 1}
                      </span>
                      <span class="min-w-0 flex-1 truncate text-sm">{section.label}</span>
                      <Show when={filledCount(section.id) > 0}>
                        <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          {filledCount(section.id)}
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
                ? "Ready"
                : statusFor(active()) === "warn"
                  ? "Needs attention"
                  : "In progress"}
            </span>
          </div>
          <div class="mt-7">
            <SectionContent id={active()} stores={stores} />
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
          <section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p class="text-sm font-bold text-slate-950 dark:text-white">Up next</p>
            <ol class="mt-3 space-y-3">
              <For each={SECTION_META.filter((section) => section.id !== active()).slice(0, 3)}>
                {(section, index) => (
                  <li class="flex gap-3 text-sm text-slate-600 dark:text-slate-300">
                    <span class="font-mono text-slate-400">0{index() + 1}</span>
                    <span>{section.label}</span>
                  </li>
                )}
              </For>
            </ol>
          </section>
          <section class="rounded-2xl border border-indigo-100 bg-indigo-50 p-5 text-sm leading-6 text-indigo-900 dark:border-indigo-950 dark:bg-indigo-950/50 dark:text-indigo-100">
            <p class="font-semibold">Tip</p>
            <p class="mt-1 text-indigo-700 dark:text-indigo-200">
              Complete the basic information first; it gives the rest of the Template a clear identity.
            </p>
          </section>
        </aside>
      </main>
    </div>
  );
}
