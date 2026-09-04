import { type Accessor, For, Match, Show, Switch } from "solid-js";
import { describeSkippedTaskReason, formatAllocationPercentage, type InspectResult, type PreviewResult } from "../generate/preview";

type RunState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; result: PreviewResult }
  | { kind: "error"; message: string };

type Props = {
  inspect: InspectResult;
  formValues: Accessor<Record<string, string>>;
  setFormValues: (update: (values: Record<string, string>) => Record<string, string>) => void;
  run: Accessor<RunState>;
  onRun: () => void;
};

function Field(props: Props & { field: InspectResult["fields"][number] }) {
  return <label class="block text-sm font-semibold text-slate-700 dark:text-slate-200">
    {props.field.name} <span class="font-normal text-slate-400">{props.field.required ? "required" : "optional"}</span>
    <Show when={props.field.type === "boolean"} fallback={<input class="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal dark:border-slate-700 dark:bg-slate-950" type={props.field.type === "number" ? "number" : "text"} placeholder={props.field.type === "string[]" ? "comma-separated" : undefined} value={props.formValues()[props.field.name] ?? ""} onInput={(event) => props.setFormValues((values) => ({ ...values, [props.field.name]: event.currentTarget.value }))} />}>
      <input class="mt-2 block size-4" type="checkbox" checked={props.formValues()[props.field.name] === "true"} onChange={(event) => props.setFormValues((values) => ({ ...values, [props.field.name]: event.currentTarget.checked ? "true" : "" }))} />
    </Show>
  </label>;
}

function RunButton(props: Props) {
  return <button class="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50" type="button" disabled={props.run().kind === "loading"} onClick={props.onRun}>{props.run().kind === "loading" ? "Resolving preview…" : "Run Mock Preview"}</button>;
}

function ReadyResults(props: { result: PreviewResult }) {
  const result = props.result;
  return <div class="space-y-4">
    <div class="grid divide-y divide-slate-200 rounded-xl border border-slate-200 bg-slate-50 text-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0 dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900">
      <div class="min-w-0 p-3"><p class="text-xs text-slate-500">Story estimate</p><p class="mt-1 font-bold text-slate-950 dark:text-white">{result.estimationSummary.storyEstimation}</p></div>
      <div class="min-w-0 p-3"><p class="text-xs text-slate-500">Task total</p><p class="mt-1 font-bold text-slate-950 dark:text-white">{result.estimationSummary.totalTaskEstimation}</p></div>
      <div class="min-w-0 p-3"><p class="text-xs text-slate-500">Allocated</p><p class={`mt-1 whitespace-nowrap font-bold tabular-nums ${result.estimationSummary.percentageUsed > 100 ? "text-amber-700 dark:text-amber-300" : "text-slate-950 dark:text-white"}`}>{formatAllocationPercentage(result.estimationSummary.percentageUsed)}%</p></div>
    </div>
    <Show when={result.tasks.length > 0} fallback={<p class="text-sm text-slate-500">No Tasks resolved.</p>}><section><div class="mb-2 flex items-center justify-between"><p class="text-xs font-bold tracking-widest text-slate-400 uppercase">Included Tasks</p><span class="text-xs font-semibold text-slate-500">{result.tasks.length}</span></div><ul class="max-h-96 space-y-1 overflow-y-auto pr-1"><For each={result.tasks}>{(task) => <li class="flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-3 py-2.5 text-sm dark:border-slate-700"><p class="min-w-0 truncate font-semibold text-slate-950 dark:text-white">{task.title}</p><p class="shrink-0 text-slate-500">{task.estimation}{task.estimationPercent !== undefined ? ` · ${task.estimationPercent}%` : ""}</p></li>}</For></ul></section></Show>
    <Show when={result.skippedTasks.length > 0}><details class="rounded-xl border border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/20"><summary class="cursor-pointer px-4 py-3 font-semibold text-amber-950 dark:text-amber-100">{result.skippedTasks.length} Task{result.skippedTasks.length === 1 ? "" : "s"} not included <span class="ml-1 text-sm font-normal text-amber-800 dark:text-amber-200">— their rules do not match this Mock Story</span></summary><ul class="border-t border-amber-200 px-4 py-3 dark:border-amber-900"><For each={result.skippedTasks}>{(task) => <li class="py-2 text-sm"><p class="font-semibold text-slate-800 dark:text-slate-100">{task.title}</p><p class="mt-1 text-slate-600 dark:text-slate-300">{describeSkippedTaskReason(task.reason)}</p></li>}</For></ul></details></Show>
  </div>;
}

function Results(props: Props) {
  return <Switch>
    <Match when={props.run().kind === "idle"}><div class="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">Your resolved Tasks will appear here after the mock run.</div></Match>
    <Match when={props.run().kind === "error"}><p class="text-sm text-rose-600">{(props.run() as Extract<RunState, { kind: "error" }>).message}</p></Match>
    <Match when={props.run().kind === "ready"}><ReadyResults result={(props.run() as Extract<RunState, { kind: "ready" }>).result} /></Match>
  </Switch>;
}

export function GenerateMockPreview(props: Props) {
  return <div class="mt-6 grid gap-8 lg:grid-cols-[minmax(17rem,0.8fr)_minmax(24rem,1.2fr)]"><aside class="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-900"><p class="text-xs font-bold tracking-widest text-indigo-600 uppercase">1 · Simulate the Story</p><h2 class="mt-2 text-lg font-bold">Mock Story inputs</h2><div class="mt-5 space-y-4"><For each={props.inspect.fields}>{(field) => <Field {...props} field={field} />}</For></div><div class="mt-6"><RunButton {...props} /></div></aside><main><div class="mb-4 flex items-end justify-between"><div><p class="text-xs font-bold tracking-widest text-indigo-600 uppercase">2 · Review outcome</p><h2 class="mt-1 text-lg font-bold">Resolved Tasks</h2></div><span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500 dark:bg-slate-800">{props.run().kind === "ready" ? `${(props.run() as Extract<RunState, { kind: "ready" }>).result.tasks.length} tasks` : "Awaiting run"}</span></div><Results {...props} /></main></div>;
}
