import { createMemo, createSignal, For, type JSX, Show } from "solid-js";
import type { GroundedFieldOptions } from "../../grounding/grounding-service";
import { previewEstimation } from "../../stores/estimation-preview";
import {
  type BasicInfoStore,
  buildConversion,
  type ConversionKind,
  type EstimationStore,
  type FilterStore,
  type TasksStore,
} from "../../stores/sections";
import { MultiSelectField, SelectField, TextField, ToggleField } from "../fields";

type Rounding = EstimationStore["fields"]["rounding"];
type Policy = "warn" | "skip" | "use-default";

const NUMBER_KEY = /^(?:\d+(?:\.\d+)?|\.\d+)$/;

export function EstimationSection(props: {
  store: EstimationStore;
  basicInfo: BasicInfoStore;
  filter: FilterStore;
  tasks: TasksStore;
  grounding: () => GroundedFieldOptions | undefined;
}) {
  const s = props.store;
  const estimation = () => props.grounding()?.estimation;
  const connected = () => estimation() !== undefined;
  const unit = () => (s.fields.targetMode === "custom" && s.fields.targetFields.length > 0 ? "" : " h");

  const storyFields = createMemo(() => {
    const grounded = estimation();
    if (!grounded) return [];
    const selectedTypes = props.filter.fields.workItemTypes;
    const types = selectedTypes.length ? selectedTypes : Object.keys(grounded.storyEstimateFieldsByWorkItemType);
    const defaultChain = new Set(grounded.defaults.storyEstimateFields);
    const byRef = new Map(
      types
        .flatMap((type) => grounded.storyEstimateFieldsByWorkItemType[type] ?? [])
        .filter((field) => !defaultChain.has(field.referenceName))
        .map((field) => [field.referenceName, field]),
    );
    return [...byRef.values()];
  });
  const sourceField = () => storyFields().find((field) => field.referenceName === s.fields.source);
  const conversion = () => buildConversion(s.fields);
  const table = () => conversion()?.table ?? {};
  const pickListValues = () => (s.fields.conversionKind === "table" ? sourceField()?.allowedValues ?? [] : []);
  const uncovered = () => pickListValues().filter((value) => !Object.hasOwn(table(), value) && !coveredByMultiplier(value));
  const coveredByMultiplier = (value: string) =>
    s.fields.multipliers && Object.keys(table()).some((key) => value !== key && value.endsWith(key) && NUMBER_KEY.test(value.slice(0, -key.length).trim()));
  const notInPicklist = (key: string) => pickListValues().length > 0 && key.trim() !== "" && !pickListValues().includes(key.trim()) && !usedThroughMultiplier(key.trim());
  const usedThroughMultiplier = (key: string) => s.fields.multipliers && pickListValues().some((value) => value !== key && value.endsWith(key));

  const change = <K extends keyof EstimationStore["fields"]>(key: K, value: EstimationStore["fields"][K]) => {
    s.set(key, value);
    s.validate();
  };
  const setRow = (index: number, key: "key" | "hours", value: string) => {
    s.set("tableRows", index, key, value);
    s.validate();
  };
  const addRow = (key = "") => change("tableRows", [...s.fields.tableRows, { key, hours: "" }]);
  const removeRow = (index: number) => change("tableRows", s.fields.tableRows.filter((_, i) => i !== index));
  const policy = (): Policy => s.fields.ifParentHasNoEstimation || "warn";

  return (
    <div class="pl-3.5">
      <Stage n={1} title="Read the Story Estimate" hint="Which Story field holds the size.">
        <Show
          when={connected()}
          fallback={
            <TextField
              label="Story field reference name"
              value={s.fields.source}
              placeholder="Platform default, or e.g. Custom.TShirtSize"
              onInput={(v) => change("source", v)}
            />
          }
        >
          <SelectField
            label="Story field"
            value={s.fields.source}
            options={[
              { value: "", label: "Platform default (Story Points → Effort → Size)" },
              ...storyFields().map((field) => ({ value: field.referenceName, label: `${field.name} (${field.referenceName})` })),
              ...(s.fields.source && !sourceField() ? [{ value: s.fields.source, label: s.fields.source }] : []),
            ]}
            onInput={(v) => change("source", v)}
          />
        </Show>
      </Stage>

      <Stage n={2} title="Convert it to Task hours" hint="Applied before the percentage split.">
        <Segmented<ConversionKind>
          label="Conversion"
          value={s.fields.conversionKind}
          options={[
            { value: "none", label: "One-to-one" },
            { value: "factor", label: "Factor" },
            { value: "table", label: "Table" },
          ]}
          onChange={(kind) => {
            if (kind === "table" && s.fields.tableRows.length === 0) {
              const seeded = (sourceField()?.allowedValues ?? []).map((key) => ({ key, hours: "" }));
              s.set("tableRows", seeded.length ? seeded : [{ key: "", hours: "" }]);
            }
            // Validation waits for the first edit, so switching modes doesn't flash errors on empty rows.
            s.set("conversionKind", kind);
          }}
        />
        <div class="mt-4 space-y-4">
          <Show when={s.fields.conversionKind === "factor"}>
            <div class="max-w-xs">
              <TextField label="Hours per unit of Story Estimate" value={s.fields.factor} error={s.errors.factor} placeholder="e.g. 4" onInput={(v) => change("factor", v)} />
            </div>
          </Show>
          <Show when={s.fields.conversionKind === "table"}>
            <div class="space-y-2">
              <Show when={pickListValues().length > 0}>
                <p class="text-xs text-slate-500">
                  {pickListValues().length - uncovered().length} of {pickListValues().length} {sourceField()?.name} values covered
                </p>
              </Show>
              <table class="w-full max-w-xl text-sm">
                <thead>
                  <tr class="text-left text-xs uppercase tracking-widest text-slate-400">
                    <th class="py-1 font-semibold">Value</th>
                    <th class="font-semibold">Hours</th>
                    <th class="font-semibold">A 20% task gets</th>
                    <th><span class="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  <For each={s.fields.tableRows}>
                    {(row, index) => (
                      <tr class="border-t border-slate-100 align-top dark:border-slate-800">
                        <td class="py-1.5 pr-2">
                          <input aria-label="Story Estimate value" class={`ui-input !w-28${s.errors[`tableRows.${index()}.key`] ? " ui-input--error" : ""}`} value={row.key} onInput={(e) => setRow(index(), "key", e.currentTarget.value)} />
                          <Show when={s.errors[`tableRows.${index()}.key`]}><p class="ui-error">{s.errors[`tableRows.${index()}.key`]}</p></Show>
                        </td>
                        <td class="py-1.5 pr-2">
                          <input aria-label={`Hours for ${row.key || "this value"}`} class={`ui-input !w-20${s.errors[`tableRows.${index()}.hours`] ? " ui-input--error" : ""}`} value={row.hours} inputMode="decimal" onInput={(e) => setRow(index(), "hours", e.currentTarget.value)} />
                          <Show when={s.errors[`tableRows.${index()}.hours`]}><p class="ui-error">{s.errors[`tableRows.${index()}.hours`]}</p></Show>
                        </td>
                        <td class="py-3 font-mono text-slate-500">{row.hours.trim() && !Number.isNaN(Number(row.hours)) ? `${Math.round(Number(row.hours) * 20) / 100} h` : "—"}</td>
                        <td class="py-2.5 text-right">
                          <Show when={notInPicklist(row.key)}>
                            <span class="mr-2 whitespace-nowrap rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800" title={`Not one of the ${sourceField()?.name} values, so it will never match`}>
                              not in picklist
                            </span>
                          </Show>
                          <button type="button" class="text-slate-400 hover:text-red-600" aria-label={`Remove ${row.key || "row"}`} onClick={() => removeRow(index())}>✕</button>
                        </td>
                      </tr>
                    )}
                  </For>
                  <For each={uncovered()}>
                    {(value) => (
                      <tr class="border-t border-dashed border-amber-300">
                        <td class="py-2 pl-2 font-semibold text-amber-800 dark:text-amber-200">{value}</td>
                        <td colspan="3" class="py-2 text-sm text-amber-800 dark:text-amber-200">
                          No conversion — Stories sized {value} get blank estimates.{" "}
                          <button type="button" class="font-semibold underline" onClick={() => addRow(value)}>Add hours</button>
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
              <Show when={s.errors.tableRows}><p class="ui-error">{s.errors.tableRows}</p></Show>
              <button type="button" class="text-sm font-semibold text-indigo-600 dark:text-indigo-300" onClick={() => addRow()}>+ Add value</button>
            </div>
            <Show when={Object.keys(table()).some((key) => !NUMBER_KEY.test(key))}>
              <ToggleField
                label="Allow fractional sizes (e.g. 0.3XL)"
                description={fractionalSizeExample(table())}
                checked={s.fields.multipliers}
                onChange={(v) => change("multipliers", v)}
              />
            </Show>
          </Show>

          <div class="!mt-8 space-y-2">
            <p class="text-xs font-bold uppercase tracking-widest text-slate-400">Each task's hours</p>
            <div class="flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
              <Segmented<Rounding>
                label="Round to"
                inline
                value={s.fields.rounding}
                options={[
                  { value: "none", label: "Exact" },
                  { value: "nearest", label: "Nearest ½ h" },
                  { value: "up", label: "Up to ½ h" },
                  { value: "down", label: "Down to ½ h" },
                ]}
                onChange={(v) => change("rounding", v)}
              />
              <label class="flex items-center gap-2">
                Never less than
                <input class={`ui-input !w-16${s.errors.minimumTaskEstimate ? " ui-input--error" : ""}`} value={s.fields.minimumTaskEstimate} placeholder="0" inputMode="decimal" onInput={(e) => change("minimumTaskEstimate", e.currentTarget.value)} />
                {unit()}
              </label>
            </div>
            <Show when={s.errors.minimumTaskEstimate}><p class="ui-error">{s.errors.minimumTaskEstimate}</p></Show>
          </div>

          <div class="!mt-8">
            <WorkedExample store={s} tasks={props.tasks} unit={unit()} conversion={conversion()} />
          </div>
        </div>
      </Stage>

      <Stage n={3} title="Write the Task Estimates" hint="What each created task is, and where its hours go.">
        <WriteTarget store={s} basicInfo={props.basicInfo} grounding={props.grounding} />
      </Stage>

      <Stage n={4} title="When a Story's estimate can't be used" hint="Missing, or not covered by the conversion.">
        <div class="flex flex-wrap items-start gap-4">
          <Segmented<Policy>
            label="When a Story's estimate can't be used"
            hideLabel
            value={policy()}
            options={[
              { value: "warn", label: "Blank estimates + warning" },
              { value: "skip", label: "Skip the Story" },
              { value: "use-default", label: "Assume a default" },
            ]}
            onChange={(v) => change("ifParentHasNoEstimation", v === "warn" ? "" : v)}
          />
          <Show when={policy() === "use-default"}>
            <div class="w-48">
              <TextField
                label="Default Story Estimate"
                value={s.fields.defaultParentEstimation}
                error={s.errors.defaultParentEstimation}
                placeholder="e.g. 5 or M"
                onInput={(v) => change("defaultParentEstimation", v)}
              />
            </div>
          </Show>
        </div>
      </Stage>
    </div>
  );
}

function Stage(props: { n: number; title: string; hint: string; children: JSX.Element }) {
  return (
    <section class="relative border-l-2 border-indigo-200 pb-8 pl-7 last:pb-0 dark:border-indigo-900">
      <span class="absolute -left-3.5 top-0 flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white" aria-hidden="true">
        {props.n}
      </span>
      <h3 class="font-bold">{props.title}</h3>
      <p class="mb-3 text-sm text-slate-500">{props.hint}</p>
      {props.children}
    </section>
  );
}

function Segmented<T extends string>(props: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  inline?: boolean;
  hideLabel?: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div class={props.inline ? "flex items-center gap-2" : ""} role="radiogroup" aria-label={props.label}>
      <Show when={!props.hideLabel && props.inline}><span>{props.label}</span></Show>
      <div class="mode-toggle mode-toggle--compact">
        <For each={props.options}>
          {(option) => (
            <button
              type="button"
              role="radio"
              aria-checked={props.value === option.value}
              class={`mode-btn${props.value === option.value ? " mode-btn--active" : ""}`}
              onClick={() => props.onChange(option.value)}
            >
              {option.label}
            </button>
          )}
        </For>
      </div>
    </div>
  );
}

function fractionalSizeExample(table: Record<string, number>): string {
  const largest = Object.entries(table)
    .filter(([key, hours]) => !NUMBER_KEY.test(key) && hours > 0)
    .sort(([, a], [, b]) => a - b)
    .pop();
  const rule = "A value listed in the table is always used as-is.";
  if (!largest) return `A number before a size scales it, e.g. 0.3XL = 0.3 × the XL hours. ${rule}`;
  const [key, hours] = largest;
  return `A number before a size scales it: 0.3${key} = 0.3 × ${hours} h = ${Math.round(hours * 30) / 100} h. ${rule}`;
}

function WorkedExample(props: {
  store: EstimationStore;
  tasks: TasksStore;
  unit: string;
  conversion: ReturnType<typeof buildConversion>;
}) {
  const s = props.store;
  const [sample, setSample] = createSignal<string>();
  const defaultSample = () => {
    const keys = Object.keys(props.conversion?.table ?? {});
    return keys[Math.floor(keys.length / 2)] ?? "5";
  };
  const value = () => sample() ?? defaultSample();
  const tasks = () =>
    props.tasks.fields.items
      .map((task) => ({ title: task.fields.title.trim() || "Untitled task", percent: Number(task.fields.estimationPercent) || 0 }))
      .filter((task) => task.percent > 0);
  const result = () =>
    previewEstimation(value(), tasks(), {
      conversion: props.conversion,
      rounding: s.fields.rounding,
      minimumTaskEstimate: Number(s.fields.minimumTaskEstimate) || 0,
      ifParentHasNoEstimation: s.fields.ifParentHasNoEstimation || undefined,
      defaultParentEstimation: s.fields.defaultParentEstimation.trim() || undefined,
    });

  return (
    <aside class="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-900" aria-live="polite">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs font-bold uppercase tracking-widest text-slate-400">Worked example</span>
        <input aria-label="Sample Story Estimate" class="ui-input !w-24" value={value()} onInput={(e) => setSample(e.currentTarget.value)} />
        <span class="text-xs text-slate-500">sample Story Estimate</span>
      </div>
      <Show when={tasks().length > 0} fallback={<p class="text-slate-500">Add tasks with an estimation percentage to see how a Story's estimate is split.</p>}>
        {(() => {
          const r = result();
          if (r.kind === "skipped") return <p class="text-amber-800 dark:text-amber-200">“{value()}” can't be converted — this Story would be skipped.</p>;
          if (r.kind === "blank") return <p class="text-amber-800 dark:text-amber-200">“{value()}” can't be converted — tasks would be created with blank estimates.</p>;
          return (
            <>
              <Show when={r.usedDefault}><p class="text-amber-800 dark:text-amber-200">“{value()}” can't be converted — using the default Story Estimate.</p></Show>
              <p class="font-semibold">Story total: {r.total}{props.unit}</p>
              <ul class="space-y-0.5">
                <For each={r.tasks}>
                  {(task) => (
                    <li class="flex justify-between gap-4">
                      <span class="truncate">{task.title} · {task.percent}%</span>
                      <span class="font-mono">{task.hours}{props.unit}</span>
                    </li>
                  )}
                </For>
              </ul>
            </>
          );
        })()}
      </Show>
    </aside>
  );
}

function WriteTarget(props: {
  store: EstimationStore;
  basicInfo: BasicInfoStore;
  grounding: () => GroundedFieldOptions | undefined;
}) {
  const s = props.store;
  const defaults = () => props.grounding()?.estimation?.defaults;
  const defaultType = () => defaults()?.taskWorkItemType ?? "Task";
  const taskType = () => props.basicInfo.advanced.taskType ?? defaultType();
  const workItemTypes = () => props.grounding()?.workItemTypes ?? [];
  const numericFields = () =>
    (props.grounding()?.fieldsByWorkItemType[taskType()] ?? [])
      .filter((field) => !field.isReadOnly && (field.type === "integer" || field.type === "decimal"))
      .map((field) => field.referenceName);
  const setTaskType = (value: string) => {
    props.basicInfo.setAdvanced("taskType", value && value !== defaultType() ? value : undefined);
    s.set("targetFields", []);
  };
  const choose = (mode: "default" | "custom") => {
    s.set("targetMode", mode);
    if (mode === "default") {
      props.basicInfo.setAdvanced("taskType", undefined);
      s.set("targetFields", []);
    }
  };

  return (
    <div class="space-y-4">
      <div class="flex flex-col gap-3 sm:flex-row" role="radiogroup" aria-label="Where Task Estimates are written">
        <TargetCard
          active={s.fields.targetMode === "default"}
          title="Platform defaults"
          body={`${defaultType()} · ${defaults() ? "Remaining Work + Original Estimate" : "the platform's estimate fields"}, in hours`}
          onSelect={() => choose("default")}
        />
        <TargetCard
          active={s.fields.targetMode === "custom"}
          title="Custom"
          body="Another work item type, or other numeric fields"
          onSelect={() => choose("custom")}
        />
      </div>
      <Show when={s.fields.targetMode === "custom"}>
        <div class="grid gap-4 rounded-xl border border-slate-200 p-4 sm:grid-cols-2 dark:border-slate-700">
          <Show
            when={workItemTypes().length > 0}
            fallback={<TextField label="Create tasks as" value={taskType()} placeholder="e.g. Task or Sub-task" onInput={setTaskType} />}
          >
            <SelectField
              label="Create tasks as"
              value={taskType()}
              options={workItemTypes().map((type) => ({ value: type, label: type === defaultType() ? `${type} (platform default)` : type }))}
              onInput={setTaskType}
            />
          </Show>
          <MultiSelectField
            label="Write the estimate to"
            selected={s.fields.targetFields}
            options={numericFields()}
            placeholder="Platform default fields"
            allowCustom={numericFields().length === 0}
            onChange={(v) => s.set("targetFields", v)}
          />
          <p class="text-xs text-slate-500 sm:col-span-2">
            {s.fields.targetFields.length
              ? "Custom fields receive the number exactly as calculated, with no unit, and Completed Work is not set."
              : "Leave empty to keep the platform's default fields for this work item type."}
          </p>
        </div>
      </Show>
    </div>
  );
}

function TargetCard(props: { active: boolean; title: string; body: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={props.active}
      onClick={props.onSelect}
      class={`flex-1 rounded-xl border p-4 text-left transition ${props.active ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/30 dark:bg-indigo-950/40" : "border-slate-200 hover:border-slate-300 dark:border-slate-700"}`}
    >
      <span class="flex items-center gap-2 font-semibold">
        <span class={`h-4 w-4 rounded-full border-2 ${props.active ? "border-indigo-600 bg-indigo-600 shadow-[inset_0_0_0_3px_white]" : "border-slate-400"}`} aria-hidden="true" />
        {props.title}
      </span>
      <span class="mt-1 block pl-6 text-sm text-slate-500">{props.body}</span>
    </button>
  );
}
