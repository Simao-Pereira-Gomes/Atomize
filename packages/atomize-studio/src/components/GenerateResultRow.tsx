// One collapsible Story section per Generate result — mirrors the VS Code extension's
// execStoryResult (generate-html.ts): task rows link out to the real created Work Item.
import { For, Show } from "solid-js";
import type { GenerateResultRow as GenerateResultRowData } from "../generate/live";

export function GenerateResultRow(props: { row: GenerateResultRowData; open: boolean; onToggleOpen: () => void }) {
  const failed = () => !props.row.success;
  return (
    <div class={`mb-2 overflow-hidden rounded-xl border ${failed() ? "border-rose-200 dark:border-rose-900" : "border-slate-100 dark:border-slate-800"}`}>
      <button
        type="button"
        class="flex w-full items-center gap-2 !border-0 !bg-transparent px-3 py-2.5 text-left !shadow-none"
        onClick={props.onToggleOpen}
        aria-expanded={props.open}
      >
        <span class={`shrink-0 text-[10px] text-slate-400 transition-transform duration-150 ${props.open ? "rotate-90" : ""}`}>▸</span>
        <span class={failed() ? "text-rose-600" : "text-emerald-600"}>{failed() ? "✗" : "✓"}</span>
        <span class="flex-1 truncate text-sm font-semibold text-slate-950 dark:text-white">{props.row.story.title}</span>
        <Show when={props.row.story.url} fallback={<span class="shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">{props.row.story.id}</span>}>
          <a
            href={props.row.story.url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            class="shrink-0 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
          >
            {props.row.story.id} ↗
          </a>
        </Show>
        <span class={`shrink-0 text-xs font-semibold ${failed() ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"}`}>
          {failed() ? "failed" : `${props.row.tasksCreated.length} created`}
        </span>
      </button>
      <Show when={props.open}>
        <div class="px-3 pb-3">
          <Show
            when={!failed()}
            fallback={<div class="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">{props.row.error}</div>}
          >
            <For each={props.row.tasksCreated}>
              {(task) => (
                <div class="flex items-center gap-2 py-1 text-sm">
                  <span class="shrink-0 text-emerald-600">✓</span>
                  <Show when={task.url} fallback={<span class="shrink-0 font-semibold text-slate-500 dark:text-slate-400">#{task.id}</span>}>
                    <a href={task.url} target="_blank" rel="noreferrer" class="shrink-0 font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
                      #{task.id}
                    </a>
                  </Show>
                  <span class="truncate text-slate-600 dark:text-slate-300">{task.title}</span>
                </div>
              )}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  );
}
