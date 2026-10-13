import { type Accessor, createEffect, createMemo, createSignal, For, on, onCleanup, Show } from "solid-js";
import type { GroundedFieldOptions } from "../grounding/grounding-service";
import { SidecarRequestError, searchStories } from "../sidecar/sidecar-client";
import {
  canLoadMore,
  describeRow,
  emptyFilters,
  loadedSummary,
  MAX_STORIES,
  PAGE_SIZE,
  parseStoryRows,
  type StoryFilters,
  type StoryRow,
  toSearchRequest,
} from "../stories/story-browser-model";
import { SearchableSelectField } from "./fields";

const SEARCH_DEBOUNCE_MS = 300;

/**
 * The Story Browser's Search mode (see CONTEXT.md): find Stories by ID or title, narrowed by type,
 * state, area path, iteration, and whether they have Tasks, and tick several. Ticked Stories stay
 * ticked while the search changes. The profile's token never reaches the webview.
 */
export function StoryBrowser(props: {
  profile: Accessor<string>;
  /** The profile's project metadata, offering the filter choices. */
  choices: Accessor<GroundedFieldOptions | undefined>;
  selected: Accessor<StoryRow[]>;
  onChange: (stories: StoryRow[]) => void;
  hasTasksByDefault?: boolean;
  disabled?: Accessor<boolean>;
  /** A list to open on, e.g. the Stories a Template was applied to, with Search one click away. */
  defaultView?: { label: string; load: () => Promise<unknown> };
}) {
  const [mode, setMode] = createSignal<"default" | "search">(props.defaultView ? "default" : "search");
  const [defaultRows, setDefaultRows] = createSignal<StoryRow[] | undefined>();
  const [filters, setFilters] = createSignal<StoryFilters>(emptyFilters(props.hasTasksByDefault ?? true));
  const [limit, setLimit] = createSignal(PAGE_SIZE);
  const [rows, setRows] = createSignal<StoryRow[]>([]);
  const [loading, setLoading] = createSignal(false);
  // Set while "Load more" fetches the next page, so its progress shows down by the button, not off-screen at the top.
  const [loadingMore, setLoadingMore] = createSignal(false);
  const [error, setError] = createSignal("");
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));
  // React only when the profile itself changes, not whenever the object a caller derives it from does.
  const profile = createMemo(() => props.profile());

  const run = async () => {
    if (mode() === "default") return loadDefault();
    const current = ++generation;
    setLoading(true);
    setError("");
    try {
      const result = parseStoryRows(await searchStories(profile(), toSearchRequest(filters(), limit())));
      if (current === generation) setRows(result);
    } catch (caught) {
      if (current === generation) {
        setRows([]);
        setError(caught instanceof SidecarRequestError ? caught.message : "We could not search Stories right now.");
      }
    } finally {
      if (current === generation) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  /** The default view loads once, then typing narrows it locally. */
  const loadDefault = async () => {
    if (defaultRows() !== undefined || !props.defaultView) return;
    const current = ++generation;
    setLoading(true);
    setError("");
    try {
      const result = parseStoryRows(await props.defaultView.load());
      if (current === generation) setDefaultRows(result);
    } catch (caught) {
      if (current === generation) {
        setDefaultRows([]);
        setError(caught instanceof SidecarRequestError ? caught.message : "We could not load these Stories right now.");
      }
    } finally {
      if (current === generation) setLoading(false);
    }
  };
  const shown = () => {
    if (mode() === "search") return rows();
    const text = filters().text.trim().toLowerCase();
    return (defaultRows() ?? []).filter((row) => !text || row.id.toLowerCase().includes(text) || row.title.toLowerCase().includes(text));
  };

  createEffect(on([filters, limit, profile, mode], () => {
    clearTimeout(timer);
    timer = setTimeout(() => void run(), SEARCH_DEBOUNCE_MS);
  }));

  const update = (change: Partial<StoryFilters>) => {
    setLimit(PAGE_SIZE);
    setLoadingMore(false);
    setFilters({ ...filters(), ...change });
  };
  const loadedRows = () => (mode() === "search" ? rows() : defaultRows() ?? []);
  const summary = () => {
    const search = mode() === "search";
    return loadedSummary(shown().length, loadedRows().length, {
      more: search && canLoadMore(rows().length, limit()),
      atMax: search && rows().length >= MAX_STORIES,
    });
  };
  const isSelected = (id: string) => props.selected().some((story) => story.id === id);
  const toggle = (row: StoryRow) => props.onChange(isSelected(row.id) ? props.selected().filter((story) => story.id !== row.id) : [...props.selected(), row]);
  const one = (values: string[]) => values[0] ?? "";
  const states = () => {
    const options = props.choices();
    if (!options) return [];
    const types = filters().workItemTypes.length ? filters().workItemTypes : options.workItemTypes;
    return [...new Set(types.flatMap((type) => options.statesByWorkItemType[type] ?? []))].sort();
  };

  // Projects can have hundreds of area paths and iterations, so each filter is searchable by typing.
  const FilterSelect = (filterProps: { label: string; value: string; options: string[]; onChange: (value: string) => void }) => (
    <SearchableSelectField
      label={filterProps.label}
      value={filterProps.value}
      options={filterProps.options.map((option) => ({ value: option, label: option }))}
      placeholder={props.choices() ? "Any (type to search)" : "Loading choices…"}
      disabled={props.disabled?.() || !props.choices()}
      clearable
      onChange={filterProps.onChange}
    />
  );

  return (
    <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div class="space-y-3 border-b border-slate-100 p-3 dark:border-slate-800">
        <Show when={props.defaultView}>
          {(view) => (
            <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span class="font-semibold text-slate-600 dark:text-slate-300">{mode() === "default" ? view().label : "Search all Stories"}</span>
              <button
                type="button"
                class="font-semibold text-indigo-600 hover:underline disabled:opacity-50 dark:text-indigo-400"
                disabled={props.disabled?.()}
                onClick={() => { setError(""); setMode(mode() === "default" ? "search" : "default"); }}
              >
                {mode() === "default" ? "Search all Stories instead" : `Back to ${view().label.toLowerCase()}`}
              </button>
            </div>
          )}
        </Show>
        <input
          class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          placeholder="Search by ID or title…"
          value={filters().text}
          disabled={props.disabled?.()}
          onInput={(event) => update({ text: event.currentTarget.value })}
        />
        <Show when={mode() === "search"}>
        <div class="story-browser-filters grid grid-cols-2 gap-2">
          <FilterSelect label="Type" value={one(filters().workItemTypes)} options={props.choices()?.workItemTypes ?? []} onChange={(value) => update({ workItemTypes: value ? [value] : [], states: [] })} />
          <FilterSelect label="State" value={one(filters().states)} options={states()} onChange={(value) => update({ states: value ? [value] : [] })} />
          <FilterSelect label="Area path (and below)" value={one(filters().areaPaths)} options={props.choices()?.areaPaths ?? []} onChange={(value) => update({ areaPaths: value ? [value] : [] })} />
          <FilterSelect label="Iteration (and below)" value={one(filters().iterations)} options={props.choices()?.iterationPaths ?? []} onChange={(value) => update({ iterations: value ? [value] : [] })} />
        </div>
        <label class="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={filters().hasTasks} disabled={props.disabled?.()} onChange={(event) => update({ hasTasks: event.currentTarget.checked })} />
          Only Stories that already have Tasks
        </label>
        </Show>
      </div>

      <div class="max-h-72 overflow-y-auto p-2" aria-busy={loading()}>
        {/* Shown on every load, not only an empty one, so a slow project never looks stuck. */}
        <Show when={loading() && !loadingMore()}>
          <p class="flex items-center gap-2 p-3 text-sm text-slate-500 dark:text-slate-400" role="status">
            <span class="size-3.5 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600 dark:border-slate-600 dark:border-t-indigo-400" aria-hidden="true" />
            {mode() === "search" ? "Searching Stories…" : `Loading ${props.defaultView?.label ?? "Stories"}…`}
          </p>
        </Show>
        <Show when={error()}>
          <p class="p-3 text-sm text-rose-600">{error()}</p>
        </Show>
        <Show when={!error() && !loading() && shown().length === 0}>
          <p class="p-3 text-sm text-slate-500 dark:text-slate-400">No Stories match. Try a different search or fewer filters.</p>
        </Show>
        <For each={shown()}>
          {(row) => (
            <label class="flex cursor-pointer items-start gap-3 rounded-xl p-3 hover:bg-indigo-50 dark:hover:bg-indigo-950/30">
              <input type="checkbox" class="mt-1" checked={isSelected(row.id)} disabled={props.disabled?.()} onChange={() => toggle(row)} />
              <div class="min-w-0">
                <p class="font-semibold text-slate-950 dark:text-white">{row.id} · {row.title}</p>
                <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{describeRow(row)}</p>
              </div>
            </label>
          )}
        </For>
        <Show when={mode() === "search" && !error() && canLoadMore(rows().length, limit())}>
          <button
            type="button"
            class="m-2 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold disabled:opacity-70 dark:border-slate-700"
            disabled={loading() || loadingMore()}
            aria-busy={loadingMore()}
            onClick={() => { setLoadingMore(true); setLimit(limit() + PAGE_SIZE); }}
          >
            <Show when={loadingMore()}>
              <span class="size-3.5 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600 dark:border-slate-600 dark:border-t-indigo-400" aria-hidden="true" />
            </Show>
            {loadingMore() ? "Loading more Stories…" : "Load more"}
          </button>
        </Show>
      </div>

      <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-slate-100 px-4 py-3 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span aria-live="polite">{error() ? "" : summary()}</span>
        <span class="font-semibold text-slate-700 dark:text-slate-200">{props.selected().length} selected</span>
      </div>
    </div>
  );
}
