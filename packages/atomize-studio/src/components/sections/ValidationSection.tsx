import { createSignal, For, type JSXElement, Show } from "solid-js";
import type { ValidationStore } from "../../stores/sections";
import { SelectField, TextField } from "../fields";

const VALIDATION_MODES = ["", "strict", "lenient"] as const;
type ValidationModeValue = (typeof VALIDATION_MODES)[number];
type PolicyKey = "estimation" | "count" | "required";

function isValidationModeValue(value: string): value is ValidationModeValue {
  return VALIDATION_MODES.includes(value as ValidationModeValue);
}

function isConfigured(store: ValidationStore, policy: PolicyKey): boolean {
  if (policy === "estimation") {
    return [
      store.fields.totalEstimationMustBe,
      store.fields.totalEstimationRangeMin,
      store.fields.totalEstimationRangeMax,
      store.fields.taskEstimationRangeMin,
      store.fields.taskEstimationRangeMax,
    ].some(Boolean);
  }
  if (policy === "count") return Boolean(store.fields.minTasks || store.fields.maxTasks);
  return store.fields.requiredTasks.length > 0;
}

export function ValidationSection(props: { store: ValidationStore }) {
  const s = props.store;
  const [openPolicy, setOpenPolicy] = createSignal<PolicyKey | null>(null);
  const togglePolicy = (policy: PolicyKey) => setOpenPolicy((current) => current === policy ? null : policy);

  return (
    <div class="space-y-6">
      <div>
        <h2 class="text-xl font-bold text-slate-950 dark:text-white">Build a validation policy</h2>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Start without constraints. Turn on only the rules this Template needs.
        </p>
      </div>
      <section class="rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
        <SelectField
          label="Validation mode" value={s.fields.mode}
          options={[
            { value: "", label: "Inherit" },
            { value: "strict", label: "Strict" },
            { value: "lenient", label: "Lenient" },
          ]}
          onInput={(v) => { if (isValidationModeValue(v)) s.set("mode", v); }}
        />
        <p class="text-sm text-slate-500 dark:text-slate-400">Leave inherited unless warnings must block use.</p>
      </section>
      <div class="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
        <PolicyRow
          title="Estimation limits"
          description="Require total or individual task estimates to fit the ranges this Template expects. Totals may exceed 100% when tasks span roles."
          configured={isConfigured(s, "estimation")}
          open={openPolicy() === "estimation"}
          onToggle={() => togglePolicy("estimation")}
        >
          <div class="grid gap-4 sm:grid-cols-2">
            <TextField label="Total estimation must be (%)" value={s.fields.totalEstimationMustBe} error={s.errors.totalEstimationMustBe} onInput={(v) => { s.set("totalEstimationMustBe", v); s.validate(); }} onBlur={s.validate} placeholder="100 or 120" />
            <div />
            <TextField label="Total range minimum (%)" value={s.fields.totalEstimationRangeMin} error={s.errors.totalEstimationRangeMin} onInput={(v) => { s.set("totalEstimationRangeMin", v); s.validate(); }} onBlur={s.validate} placeholder="0" />
            <TextField label="Total range maximum (%)" value={s.fields.totalEstimationRangeMax} error={s.errors.totalEstimationRangeMax} onInput={(v) => { s.set("totalEstimationRangeMax", v); s.validate(); }} onBlur={s.validate} placeholder="100 or 120" />
            <TextField label="Per-task range minimum (%)" value={s.fields.taskEstimationRangeMin} error={s.errors.taskEstimationRangeMin} onInput={(v) => { s.set("taskEstimationRangeMin", v); s.validate(); }} onBlur={s.validate} placeholder="0" />
            <TextField label="Per-task range maximum (%)" value={s.fields.taskEstimationRangeMax} error={s.errors.taskEstimationRangeMax} onInput={(v) => { s.set("taskEstimationRangeMax", v); s.validate(); }} onBlur={s.validate} placeholder="100" />
          </div>
        </PolicyRow>
        <PolicyRow
          title="Task count"
          description="Keep generated work between a minimum and maximum number of tasks."
          configured={isConfigured(s, "count")}
          open={openPolicy() === "count"}
          onToggle={() => togglePolicy("count")}
        >
          <div class="grid gap-4 sm:grid-cols-2">
            <TextField label="Minimum tasks" value={s.fields.minTasks} error={s.errors.minTasks} onInput={(v) => { s.set("minTasks", v); s.validate(); }} onBlur={s.validate} placeholder="1" />
            <TextField label="Maximum tasks" value={s.fields.maxTasks} error={s.errors.maxTasks} onInput={(v) => { s.set("maxTasks", v); s.validate(); }} onBlur={s.validate} placeholder="12" />
          </div>
        </PolicyRow>
        <PolicyRow
          title="Required tasks"
          description="Name tasks that every valid Template must include."
          configured={isConfigured(s, "required")}
          open={openPolicy() === "required"}
          onToggle={() => togglePolicy("required")}
        >
          <div class="space-y-4">
            <For each={s.fields.requiredTasks}>
              {(task, index) => (
                <div class="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <TextField label="Task title" value={task.title} required error={s.errors[`requiredTasks.${index()}.title`]} onInput={(v) => { s.set("requiredTasks", index(), "title", v); s.validate(); }} onBlur={s.validate} />
                  <TextField label="Task ID (optional)" value={task.id} onInput={(v) => s.set("requiredTasks", index(), "id", v)} />
                  <button class="btn btn--secondary" type="button" onClick={() => s.removeRequiredTask(index())}>Remove required task</button>
                </div>
              )}
            </For>
            <button class="btn btn--secondary" type="button" onClick={s.addRequiredTask}>Add required task</button>
          </div>
        </PolicyRow>
      </div>
    </div>
  );
}

function PolicyRow(props: {
  title: string;
  description: string;
  configured: boolean;
  open: boolean;
  onToggle: () => void;
  children: JSXElement;
}) {
  return (
    <section class="p-5">
      <div class="flex items-start justify-between gap-5">
        <div>
          <h3 class="font-bold text-slate-950 dark:text-white">{props.title}</h3>
          <p class="mt-1 max-w-xl text-sm text-slate-500 dark:text-slate-400">{props.description}</p>
          <span class={`mt-3 inline-block text-xs font-semibold ${props.configured ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>
            {props.configured ? "Configured" : "Not configured"}
          </span>
        </div>
        <button class="shrink-0 rounded-lg border border-indigo-200 px-3 py-2 text-sm font-semibold text-indigo-700 dark:border-indigo-800 dark:text-indigo-300" type="button" onClick={props.onToggle}>
          {props.open ? "Done" : "Configure"}
        </button>
      </div>
      <Show when={props.open}><div class="mt-5 border-t border-slate-100 pt-4 dark:border-slate-800">{props.children}</div></Show>
    </section>
  );
}
