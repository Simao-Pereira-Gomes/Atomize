import type { TaskTemplate } from "@sppg2001/atomize-schema";
import { type Accessor, createMemo, For, type JSX, Match, Show, Switch } from "solid-js";
import { diffTemplates, type FieldChange, type TaskChange } from "../../diff/diff-templates";
import type { OriginBaselineState } from "../../diff/origin-baseline";

function formatValue(value: unknown): string {
  if (value === undefined) return "—";
  if (value === null) return "null";
  if (typeof value === "string") return value === "" ? '""' : value;
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}

function movedLabel(moved: { fromIndex: number; toIndex: number }): string {
  const delta = moved.toIndex - moved.fromIndex;
  return delta < 0 ? `Moved ↑${-delta}` : `Moved ↓${delta}`;
}

function summaryText(diff: { fieldChanges: FieldChange[]; taskChanges: TaskChange[] }): string {
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  const parts: string[] = [];
  if (diff.fieldChanges.length) parts.push(plural(diff.fieldChanges.length, "field change"));
  const added = diff.taskChanges.filter((c) => c.status === "added").length;
  const removed = diff.taskChanges.filter((c) => c.status === "removed").length;
  const changed = diff.taskChanges.filter((c) => c.status === "modified" && c.fields.length > 0).length;
  const moved = diff.taskChanges.filter((c) => c.moved).length;
  if (added) parts.push(`${plural(added, "task")} added`);
  if (removed) parts.push(`${plural(removed, "task")} removed`);
  if (changed) parts.push(`${plural(changed, "task")} changed`);
  if (moved) parts.push(`${plural(moved, "task")} moved`);
  return parts.join(" · ");
}

const BADGE: Record<TaskChange["status"], string> = {
  added: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
  removed: "bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300",
  modified: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
};

function FieldChangeRow(props: { change: FieldChange }) {
  return (
    <li class="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-1.5">
      <code class="font-mono text-xs text-violet-700 dark:text-violet-300">{props.change.path.join(".")}</code>
      <span class="font-mono text-xs text-rose-600 line-through dark:text-rose-400">{formatValue(props.change.before)}</span>
      <span aria-hidden="true" class="text-slate-400">→</span>
      <span class="font-mono text-xs text-emerald-700 dark:text-emerald-400">{formatValue(props.change.after)}</span>
    </li>
  );
}

function TaskCard(props: { change: TaskChange }) {
  const task = () => props.change.after ?? props.change.before;
  const label = () =>
    props.change.status === "added" ? "Added" : props.change.status === "removed" ? "Removed" : "Changed";
  return (
    <li class="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <div class="flex flex-wrap items-center gap-2">
        <span class={`rounded-md px-2 py-0.5 text-xs font-semibold ${BADGE[props.change.status]}`}>{label()}</span>
        <Show when={props.change.moved}>
          {(moved) => (
            <span class="rounded-md bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800 dark:bg-sky-950/50 dark:text-sky-300">
              {movedLabel(moved())}
            </span>
          )}
        </Show>
        <span
          class={`text-sm font-semibold ${
            props.change.status === "removed"
              ? "text-slate-500 line-through dark:text-slate-500"
              : "text-slate-900 dark:text-slate-100"
          }`}
        >
          {task()?.title}
        </span>
      </div>
      <Show when={props.change.fields.length > 0}>
        <ul class="mt-2 divide-y divide-slate-100 border-t border-slate-100 pt-1 dark:divide-slate-800 dark:border-slate-800">
          <For each={props.change.fields}>{(field) => <FieldChangeRow change={field} />}</For>
        </ul>
      </Show>
    </li>
  );
}

function StatusPanel(props: { tone?: "info" | "error"; action?: JSX.Element; children: JSX.Element }) {
  return (
    <div
      class={`flex flex-col gap-3 rounded-xl border p-5 text-sm leading-6 sm:flex-row sm:items-center sm:justify-between ${
        (props.tone ?? "info") === "error"
          ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200"
          : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
      }`}
    >
      <p>{props.children}</p>
      <Show when={props.action}>
        <span class="shrink-0">{props.action}</span>
      </Show>
    </div>
  );
}

function RefreshButton(props: { onRefresh: () => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      class="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
      disabled={props.disabled}
      onClick={props.onRefresh}
    >
      {props.label ?? "Refresh"}
    </button>
  );
}

export function TemplateDiffView(props: {
  state: OriginBaselineState;
  current: Accessor<TaskTemplate | undefined>;
  onRefresh: () => void;
  sidecarAvailable: Accessor<boolean>;
}) {
  const diff = createMemo(() => {
    const current = props.current();
    return props.state.phase === "resolved" && current ? diffTemplates(props.state.baseline, current) : undefined;
  });
  const changes = createMemo(() => {
    const d = diff();
    return d && !d.identical ? d : undefined;
  });

  return (
    <div class="space-y-4">
      <Switch>
        <Match when={props.state.phase === "idle" || props.state.phase === "loading"}>
          <div
            class="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            role="status"
          >
            <span
              class="size-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600 dark:border-slate-600 dark:border-t-slate-200"
              aria-hidden="true"
            />
            Loading the original from your Catalog…
          </div>
        </Match>

        <Match when={props.state.phase === "error"}>
          <StatusPanel
            tone="error"
            action={<RefreshButton onRefresh={props.onRefresh} disabled={!props.sidecarAvailable()} label="Retry" />}
          >
            {!props.sidecarAvailable()
              ? "Comparison is unavailable while the companion process recovers."
              : props.state.phase === "error"
                ? props.state.message
                : "We could not load the original to compare against."}
          </StatusPanel>
        </Match>

        <Match when={props.state.phase === "not-in-catalog" && props.state}>
          {(state) => (
            <StatusPanel action={<RefreshButton onRefresh={props.onRefresh} disabled={!props.sidecarAvailable()} />}>
              {`This Template records its origin as ${(state() as { ref: string }).ref}, but no such Template is in your Catalog now — it may have been removed or renamed. There is nothing to compare against.`}
            </StatusPanel>
          )}
        </Match>

        <Match when={props.state.phase === "resolved" && !props.current()}>
          <StatusPanel tone="error">
            This Template doesn't validate as a whole, even though every section above checks out — there's nothing to compare against until that's fixed.
          </StatusPanel>
        </Match>

        <Match when={props.state.phase === "resolved" && props.current() && props.state}>
          {(state) => (
            <>
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  Compared against <code class="font-mono">{(state() as { ref: string }).ref}</code>
                </p>
                <RefreshButton onRefresh={props.onRefresh} disabled={!props.sidecarAvailable()} />
              </div>

              <Show
                when={changes()}
                fallback={
                  <div class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                    No changes since the original.
                  </div>
                }
              >
                {(d) => (
                  <div class="space-y-4">
                    <p class="text-sm font-semibold text-slate-700 dark:text-slate-200">{summaryText(d())}</p>

                    <Show when={d().fieldChanges.length > 0}>
                      <section>
                        <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Fields changed
                        </h3>
                        <ul class="mt-1 divide-y divide-slate-100 rounded-xl border border-slate-200 px-3 dark:divide-slate-800 dark:border-slate-800">
                          <For each={d().fieldChanges}>{(field) => <FieldChangeRow change={field} />}</For>
                        </ul>
                      </section>
                    </Show>

                    <Show when={d().taskChanges.length > 0}>
                      <section>
                        <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Tasks
                        </h3>
                        <ul class="mt-1 space-y-2">
                          <For each={d().taskChanges}>{(change) => <TaskCard change={change} />}</For>
                        </ul>
                      </section>
                    </Show>
                  </div>
                )}
              </Show>
            </>
          )}
        </Match>
      </Switch>
    </div>
  );
}
