// Generate Area's Live Preview + Execute — issue #138. Scope (Story browser or Template filter,
// see ADR-0056) → dry-run Preview → Live Execution Confirmation (gated by the pure FSM in
// generate/live-execution-confirmation.ts, see ADR-0055) → Execute, with live per-Story progress
// and a final grouped, navigable result list mirroring the VS Code extension's Generate Panel.
import { createSignal, For, Show, Switch, Match } from "solid-js";
import type { GenerateScope, LiveExecutionEvent } from "../generate/live-execution-confirmation";
import { initialLiveExecutionState, transitionLiveExecution } from "../generate/live-execution-confirmation";
import type { GenerateReport, GenerateResultRow as GenerateResultRowData, GenerateWorkItem } from "../generate/live";
import { parseGenerateProgressEvent, parseGenerateReport, parseGenerateStories } from "../generate/live";
import { previewSourceValue, type PreviewSource } from "../generate/preview";
import { cancelGenerate, listenGenerateProgress, queryGenerateStories, runGenerate, SidecarRequestError } from "../sidecar/sidecar-client";
import { GenerateResultRow } from "./GenerateResultRow";

type Step = 1 | 2 | 3;
type StoriesState = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; stories: GenerateWorkItem[] } | { kind: "error"; message: string };
type DryRunState = { kind: "idle" } | { kind: "loading" } | { kind: "ready"; report: GenerateReport } | { kind: "error"; message: string };

export function GenerateLiveArea(props: { source: PreviewSource; profile: () => string }) {
  const [step, setStep] = createSignal<Step>(1);
  const [browsing, setBrowsing] = createSignal(false);
  const [search, setSearch] = createSignal("");
  const [storiesState, setStoriesState] = createSignal<StoriesState>({ kind: "idle" });
  const [selectedIds, setSelectedIds] = createSignal<string[]>([]);
  const [scope, setScope] = createSignal<GenerateScope>();
  const [dryRun, setDryRun] = createSignal<DryRunState>({ kind: "idle" });

  const [fsm, setFsm] = createSignal(initialLiveExecutionState);
  const dispatch = (event: LiveExecutionEvent) => setFsm((current) => transitionLiveExecution(current, event));
  const [ack, setAck] = createSignal(false);

  const [execRows, setExecRows] = createSignal<GenerateResultRowData[]>([]);
  const [execPending, setExecPending] = createSignal<Map<string, GenerateResultRowData>>(new Map());
  const [execReport, setExecReport] = createSignal<GenerateReport>();
  const [execError, setExecError] = createSignal({ message: "", code: "" });
  const [activeRunId, setActiveRunId] = createSignal("");
  const [collapsedIds, setCollapsedIds] = createSignal<Set<string>>(new Set());

  const platformLabel = () => `Azure DevOps · ${props.profile()}`;
  const isRowOpen = (id: string) => !collapsedIds().has(id);
  const toggleRow = (id: string) => setCollapsedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const expandAll = () => setCollapsedIds(new Set<string>());
  const collapseAll = (rows: GenerateResultRowData[]) => setCollapsedIds(new Set(rows.map((row) => row.story.id)));

  const loadStories = async () => {
    if (storiesState().kind !== "idle") return;
    setStoriesState({ kind: "loading" });
    try {
      const result = await queryGenerateStories(previewSourceValue(props.source), props.profile());
      setStoriesState({ kind: "ready", stories: parseGenerateStories(result) });
    } catch (error) {
      setStoriesState({ kind: "error", message: error instanceof SidecarRequestError ? error.message : "We could not fetch Stories from Azure DevOps." });
    }
  };
  const filteredStories = () => (storiesState().kind === "ready" ? (storiesState() as Extract<StoriesState, { kind: "ready" }>).stories : [])
    .filter((story) => story.title.toLowerCase().includes(search().toLowerCase()) || story.id.includes(search()));
  const toggleStory = (id: string) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const advanceToPreview = async (nextScope: GenerateScope) => {
    setScope(nextScope);
    setStep(2);
    setDryRun({ kind: "loading" });
    try {
      const result = await runGenerate(crypto.randomUUID(), previewSourceValue(props.source), props.profile(), true, nextScope, false);
      setDryRun({ kind: "ready", report: parseGenerateReport(result) });
    } catch (error) {
      setDryRun({ kind: "error", message: error instanceof SidecarRequestError ? error.message : "We could not run this preview." });
    }
  };

  const scopeSummary = () => {
    const s = scope();
    if (!s) return "";
    return s.kind === "filter" ? "All Stories matching this Template's filter" : `${s.storyIds.length} Stor${s.storyIds.length === 1 ? "y" : "ies"} selected`;
  };

  const confirmExecution = () => {
    const s = scope();
    if (!s) return;
    setAck(false);
    dispatch({ type: "confirm", payload: { template: props.source, scope: s, platform: platformLabel() } });
  };

  const runLiveExecution = async () => {
    const s = scope();
    if (!s) return;
    dispatch({ type: "proceed" });
    setExecRows([]);
    setExecPending(new Map());
    setExecReport(undefined);
    setExecError({ message: "", code: "" });
    const runId = crypto.randomUUID();
    setActiveRunId(runId);

    const unlisten = await listenGenerateProgress((progress) => {
      if (progress.runId !== runId) return;
      const event = parseGenerateProgressEvent(progress.event);
      if (!event) return;
      if (event.type === "story_start" && event.story) {
        setExecPending((prev) => new Map(prev).set(event.story!.id, { story: event.story!, tasksCreated: [], success: false }));
      } else if (event.type === "task_created" && event.task && event.story) {
        setExecPending((prev) => {
          const next = new Map(prev);
          const row = next.get(event.story!.id);
          if (row) next.set(event.story!.id, { ...row, tasksCreated: [...row.tasksCreated, event.task!] });
          return next;
        });
      } else if (event.type === "story_complete" && event.story) {
        const pending = execPending().get(event.story.id);
        setExecRows((prev) => [...prev, { story: event.story!, tasksCreated: pending?.tasksCreated ?? [], success: true }]);
        setExecPending((prev) => { const next = new Map(prev); next.delete(event.story!.id); return next; });
      } else if (event.type === "story_error" && event.story) {
        const pending = execPending().get(event.story.id);
        setExecRows((prev) => [...prev, { story: event.story!, tasksCreated: pending?.tasksCreated ?? [], success: false, error: event.error }]);
        setExecPending((prev) => { const next = new Map(prev); next.delete(event.story!.id); return next; });
      }
    });

    try {
      const result = await runGenerate(runId, previewSourceValue(props.source), props.profile(), false, s, false);
      const report = parseGenerateReport(result);
      setExecReport(report);
      setCollapsedIds(new Set<string>());
      dispatch({ type: "succeed" });
    } catch (error) {
      const message = error instanceof SidecarRequestError ? error.message : "We could not complete this Generate run.";
      const code = error instanceof SidecarRequestError ? error.code : "";
      setExecError({ message, code });
      dispatch({ type: "fail", message });
    } finally {
      unlisten();
      setActiveRunId("");
    }
  };

  const cancelRun = () => {
    const id = activeRunId();
    if (id) void cancelGenerate(id);
  };

  const retry = () => {
    dispatch({ type: "reset" });
    setStep(2);
  };

  const rowsList = (rows: GenerateResultRowData[]) => (
    <div class="mt-3">
      <Show when={rows.length > 1}>
        <div class="mb-2 flex justify-end gap-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <button type="button" class="hover:underline" onClick={expandAll}>Expand all</button>
          <button type="button" class="hover:underline" onClick={() => collapseAll(rows)}>Collapse all</button>
        </div>
      </Show>
      <For each={rows}>{(row) => <GenerateResultRow row={row} open={isRowOpen(row.story.id)} onToggleOpen={() => toggleRow(row.story.id)} />}</For>
    </div>
  );

  return (
    <div class="mt-6 max-w-3xl">
      <div class="mb-6 flex items-center gap-2">
        <For each={[{ n: 1, label: "Scope" }, { n: 2, label: "Preview" }, { n: 3, label: "Execute" }]}>
          {(item, i) => (
            <>
              <div class={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold ${step() === item.n ? "bg-indigo-600 text-white" : step() > item.n ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>
                <span>{step() > item.n ? "✓" : item.n}</span><span>{item.label}</span>
              </div>
              <Show when={i() < 2}><span class="text-slate-300 dark:text-slate-600">──</span></Show>
            </>
          )}
        </For>
      </div>

      <Show when={step() === 1}>
        <div class="grid grid-cols-2 gap-4">
          <button type="button" class={`rounded-2xl border-2 p-5 text-left ${browsing() ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950/30" : "border-slate-200 bg-white hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900"}`} onClick={() => { setBrowsing(true); void loadStories(); }}>
            <p class="text-2xl">📋</p><p class="mt-2 font-bold text-slate-950 dark:text-white">Browse Stories</p><p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Pick specific Stories to generate for.</p>
          </button>
          <button type="button" class="rounded-2xl border-2 border-slate-200 bg-white p-5 text-left hover:border-indigo-300 dark:border-slate-700 dark:bg-slate-900" onClick={() => void advanceToPreview({ kind: "filter" })}>
            <p class="text-2xl">🔍</p><p class="mt-2 font-bold text-slate-950 dark:text-white">Use Template filter</p><p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Full batch run against every matching Story.</p>
          </button>
        </div>

        <Show when={browsing()}>
          <Switch>
            <Match when={storiesState().kind === "loading"}>
              <p class="mt-5 text-sm text-slate-600 dark:text-slate-300">Fetching Stories from Azure DevOps…</p>
            </Match>
            <Match when={storiesState().kind === "error"}>
              <p class="mt-5 text-sm text-rose-600">{(storiesState() as Extract<StoriesState, { kind: "error" }>).message}</p>
            </Match>
            <Match when={storiesState().kind === "ready"}>
              <div class="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                <div class="border-b border-slate-100 p-3 dark:border-slate-800">
                  <input class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white" placeholder="Search Stories…" value={search()} onInput={(e) => setSearch(e.currentTarget.value)} />
                </div>
                <div class="max-h-72 overflow-y-auto p-2">
                  <For each={filteredStories()}>
                    {(story) => (
                      <label class="flex cursor-pointer items-start gap-3 rounded-xl p-3 hover:bg-indigo-50 dark:hover:bg-indigo-950/30">
                        <input type="checkbox" class="mt-1" checked={selectedIds().includes(story.id)} onChange={() => toggleStory(story.id)} />
                        <div class="min-w-0"><p class="font-semibold text-slate-950 dark:text-white">{story.id} · {story.title}</p><p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{[story.type, story.state, story.areaPath].filter(Boolean).join(" · ")}</p></div>
                      </label>
                    )}
                  </For>
                </div>
                <div class="flex items-center justify-between border-t border-slate-100 px-4 py-3 dark:border-slate-800">
                  <p class="text-sm text-slate-500 dark:text-slate-400">{selectedIds().length} selected</p>
                  <button type="button" class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white !shadow-none disabled:opacity-40" disabled={selectedIds().length === 0} onClick={() => void advanceToPreview({ kind: "stories", storyIds: selectedIds() })}>Continue →</button>
                </div>
              </div>
            </Match>
          </Switch>
        </Show>
      </Show>

      <Show when={step() === 2}>
        <Switch>
          <Match when={dryRun().kind === "loading"}><p class="text-slate-600 dark:text-slate-300">Running dry run…</p></Match>
          <Match when={dryRun().kind === "error"}><p class="text-sm text-rose-600">{(dryRun() as Extract<DryRunState, { kind: "error" }>).message}</p></Match>
          <Match when={dryRun().kind === "ready"}>
            {(() => {
              const report = (dryRun() as Extract<DryRunState, { kind: "ready" }>).report;
              return (
                <div>
                  <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">DRY RUN — nothing has been created yet</div>
                  <div class="mt-4 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700">
                    <For each={report.results}>
                      {(row) => (
                        <div class="border-b border-slate-100 p-4 last:border-0 dark:border-slate-800">
                          <p class="font-semibold text-slate-950 dark:text-white">{row.story.id} · {row.story.title}</p>
                          <Show when={row.error}><p class="mt-1 text-xs text-rose-600">{row.error}</p></Show>
                        </div>
                      )}
                    </For>
                  </div>
                  <p class="mt-3 text-sm text-slate-500 dark:text-slate-400">{report.storiesProcessed} Stories · {report.tasksCreated} Tasks total</p>
                  <div class="mt-4 flex gap-3">
                    <button type="button" class="text-sm font-semibold text-slate-600 hover:underline dark:text-slate-300" onClick={() => setStep(1)}>← Back</button>
                    <button type="button" class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white !shadow-none" onClick={() => { setStep(3); confirmExecution(); }}>Continue to Execute →</button>
                  </div>
                </div>
              );
            })()}
          </Match>
        </Switch>
      </Show>

      <Show when={step() === 3}>
        <Switch>
          <Match when={fsm().kind === "confirming"}>
            <div class="rounded-2xl border-2 border-rose-300 bg-rose-50 p-5 dark:border-rose-900 dark:bg-rose-950/30">
              <p class="text-xs font-bold tracking-widest text-rose-700 uppercase dark:text-rose-300">Live Execution Confirmation</p>
              <dl class="mt-3 space-y-1 text-sm text-rose-950 dark:text-rose-100">
                <div><dt class="inline font-semibold">Scope: </dt><dd class="inline">{scopeSummary()}</dd></div>
                <div><dt class="inline font-semibold">Platform: </dt><dd class="inline">{platformLabel()}</dd></div>
                <div><dt class="inline font-semibold">Tasks to create: </dt><dd class="inline">{dryRun().kind === "ready" ? (dryRun() as Extract<DryRunState, { kind: "ready" }>).report.tasksCreated : "—"}</dd></div>
              </dl>
              <label class="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-white/60 p-3 text-sm text-rose-950 dark:border-rose-900 dark:bg-slate-900/40 dark:text-rose-100">
                <input type="checkbox" class="mt-0.5" checked={ack()} onChange={(e) => setAck(e.currentTarget.checked)} />
                I understand this will create real Work Items in Azure DevOps and this cannot be undone from here.
              </label>
              <div class="mt-4 flex gap-3">
                <button type="button" class="rounded-lg !border-0 bg-white px-4 py-2 text-sm font-bold text-rose-700 !shadow-none hover:bg-rose-100 dark:bg-slate-900 dark:text-rose-200" onClick={() => { dispatch({ type: "cancel" }); setStep(2); }}>Cancel</button>
                <button type="button" class="rounded-lg !border-0 bg-rose-600 px-4 py-2 text-sm font-bold text-white !shadow-none disabled:opacity-40 hover:bg-rose-700" disabled={!ack()} onClick={() => void runLiveExecution()}>Execute — create Work Items</button>
              </div>
            </div>
          </Match>
          <Match when={fsm().kind === "executing"}>
            <div>
              <div class="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
                <span class="size-4 shrink-0 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                <span class="text-sm text-slate-600 dark:text-slate-300">
                  {execPending().size > 0 ? `Creating tasks for ${[...execPending().values()].map((row) => row.story.id).join(", ")}…` : "Creating tasks…"}
                </span>
                <span class="ml-auto shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">{execRows().length} done</span>
              </div>
              <Show when={execRows().length > 0}>{rowsList(execRows())}</Show>
              <button type="button" class="mt-3 text-sm font-semibold text-slate-600 hover:underline dark:text-slate-300" onClick={cancelRun}>Cancel run (best-effort)</button>
            </div>
          </Match>
          <Match when={fsm().kind === "error"}>
            {(() => {
              const err = execError();
              const cancelled = err.code === "REQUEST_CANCELLED";
              return (
                <div>
                  <div class={`rounded-xl border px-4 py-3 text-sm font-semibold ${cancelled ? "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200" : "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-100"}`}>
                    {cancelled ? "Run cancelled. Stories already sent to Azure DevOps were not rolled back." : err.message}
                  </div>
                  <Show when={execRows().length > 0}>{rowsList(execRows())}</Show>
                  <button type="button" class="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white !shadow-none" onClick={retry}>Try again</button>
                </div>
              );
            })()}
          </Match>
          <Match when={fsm().kind === "done"}>
            {(() => {
              const report = execReport();
              if (!report) return null;
              const partial = report.storiesFailed > 0;
              return (
                <div>
                  <div class={`rounded-xl border px-4 py-3 text-sm font-semibold ${partial ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100" : "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"}`}>
                    {partial ? `Partially completed — ${report.storiesFailed} of ${report.storiesProcessed} Stories failed.` : `Done — ${report.storiesSuccess} Stories, ${report.tasksCreated} Work Items created.`}
                  </div>
                  {rowsList(report.results)}
                </div>
              );
            })()}
          </Match>
        </Switch>
      </Show>
    </div>
  );
}
