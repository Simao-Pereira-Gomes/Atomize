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

  return (
    <div class="ui-proto-root" data-theme={theme()}>
      <div class="ui-sidebar">
        <aside class="sidebar-nav">
          <div class="sidebar-header">
            <span class="sidebar-title">Template Builder</span>
            <button class="theme-toggle" type="button" onClick={toggleTheme} title="Toggle light/dark mode">
              {theme() === "dark" ? "☀" : "☾"}
            </button>
          </div>
          <For each={SECTION_META}>
            {(s) => (
              <button
                type="button"
                class={`sidebar-item${active() === s.id ? " sidebar-item--active" : ""}`}
                onClick={() => setActive(s.id)}
              >
                <span class={`status-dot status-dot--${statusFor(s.id)}`} />
                <span class="sidebar-label">{s.label}</span>
                <Show when={filledCount(s.id) > 0}>
                  <span class="sidebar-badge">{filledCount(s.id)}</span>
                </Show>
              </button>
            )}
          </For>
          <div class="sidebar-footer">
            <button class="btn btn--save btn--full" type="button" disabled={!allSectionsValid()}>
              Save template
            </button>
          </div>
        </aside>
        <main class="sidebar-content">
          <div class="section-shell">
            <div class="section-header">
              <h2 class="section-heading">{activeMeta()?.label}</h2>
              <p class="section-description">{activeMeta()?.description}</p>
            </div>
            <SectionContent id={active()} stores={stores} />
          </div>
        </main>
      </div>
    </div>
  );
}
