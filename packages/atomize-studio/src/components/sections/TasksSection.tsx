import type { Condition, ConditionOperator } from "@sppg2001/atomize-schema";
import { createSortable, DragDropProvider, DragDropSensors, SortableProvider } from "@thisbeyond/solid-dnd";
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { reconcile } from "solid-js/store";
import { Portal } from "solid-js/web";
import { coerceGroundedTaskValue, editableTaskFields, type GroundedTaskField, activityField as groundedActivityField, conditionFields as groundedConditionFields, statesForTypes } from "../../grounding/grounding-service";
import type { EditableTask, TasksStore } from "../../stores/sections";
import { operatorsForCondition } from "./condition-operators";
import { MultiSelectField, TagChipInput, TextareaField, TextField } from "../fields";
import type { GroundingSession } from "../GroundingSettings";

type Scalar = string | number | boolean;
type ConditionKind = "clause" | "all" | "any";
const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  equals: "is",
  "not-equals": "is not",
  contains: "includes",
  "not-contains": "does not include",
  gt: "is greater than",
  lt: "is less than",
  gte: "is at least",
  lte: "is at most",
};
const STORY_CONDITION_FIELDS = [
  ["tags", "Tags"], ["title", "Title"], ["state", "State"],
  ["estimation", "Estimation"], ["priority", "Priority"], ["description", "Description"],
  ["assignedTo", "Assigned to"], ["type", "Work item type"], ["areaPath", "Area path"], ["iteration", "Iteration"],
] as const;
type StoryFieldGroundedOptions = { type: string[]; state: string[]; areaPath: string[]; iteration: string[] };

function conditionKind(condition: Condition): ConditionKind {
  if ("all" in condition) return "all";
  if ("any" in condition) return "any";
  return "clause";
}

function newCondition(kind: ConditionKind): Condition {
  if (kind === "all") return { all: [{ field: "type", operator: "equals", value: "" }] };
  if (kind === "any") return { any: [{ field: "type", operator: "equals", value: "" }] };
  return { field: "type", operator: "equals", value: "" };
}

function changeConditionKind(condition: Condition, kind: ConditionKind): Condition {
  if (kind === "clause") return "all" in condition ? condition.all[0] ?? newCondition("clause") : "any" in condition ? condition.any[0] ?? newCondition("clause") : condition;
  if (kind === "all") return { all: "any" in condition ? condition.any : "all" in condition ? condition.all : [{ ...condition }] };
  return { any: "all" in condition ? condition.all : "any" in condition ? condition.any : [{ ...condition }] };
}

const DATE_MACRO_LABELS: Record<string, string> = {
  "@Today": "Today", "@StartOfWeek": "Start of this week", "@StartOfMonth": "Start of this month", "@StartOfYear": "Start of this year",
};

// Renders a datetime field's value for display — either a friendly date or, for one of the
// @Today/@StartOfWeek/@StartOfMonth/@StartOfYear macros custom-field-verifier.ts validates,
// its plain-English label.
function friendlyDate(value: string): string {
  const macroLabel = DATE_MACRO_LABELS[value];
  if (macroLabel !== undefined) return macroLabel;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function conditionValueSummary(condition: Extract<Condition, { operator: ConditionOperator }>, groundedFields?: GroundedTaskField[]): string {
  if ("customField" in condition) {
    const field = groundedFields?.find((item) => item.referenceName === condition.customField);
    if (field?.type === "datetime" && typeof condition.value === "string") return friendlyDate(condition.value);
  }
  return String(condition.value);
}

function conditionSummary(condition?: Condition, groundedFields?: GroundedTaskField[]): string {
  if (!condition) return "Always generate this Task";
  if ("all" in condition) return `When all ${condition.all.length} rule${condition.all.length === 1 ? "" : "s"} match`;
  if ("any" in condition) return `When any ${condition.any.length} rule${condition.any.length === 1 ? "" : "s"} matches`;
  const subject = "customField" in condition ? condition.customField : `Story ${condition.field}`;
  return `When ${subject} ${OPERATOR_LABELS[condition.operator]} ${conditionValueSummary(condition, groundedFields)}`;
}

function ConditionEditor(props: { condition: Condition; onChange: (condition: Condition) => void; groundedFields?: GroundedTaskField[]; storyFieldOptions?: StoryFieldGroundedOptions; depth?: number }) {
  const kind = () => conditionKind(props.condition);
  const depth = props.depth ?? 0;
  const updateClause = (patch: Partial<Extract<Condition, { field: string } | { customField: string }>>) => {
    const current = props.condition;
    if ("all" in current || "any" in current) return;
    props.onChange({ ...current, ...patch } as Condition);
  };
  const compoundItems = () => ("all" in props.condition ? props.condition.all : "any" in props.condition ? props.condition.any : []);
  const clause = () => props.condition as Extract<Condition, { operator: ConditionOperator }>;
  const clauseField = () => {
    const current = clause();
    return "customField" in current ? current.customField : current.field;
  };
  const groundedField = () => {
    const current = clause();
    return "customField" in current ? props.groundedFields?.find((field) => field.referenceName === current.customField) : undefined;
  };
  const storyOptions = () => {
    const current = clause();
    if (!("field" in current)) return undefined;
    const list = props.storyFieldOptions?.[current.field as keyof StoryFieldGroundedOptions];
    return list && list.length > 0 ? list : undefined;
  };
  const fieldTarget = () => {
    const current = clause();
    if ("field" in current) return `story:${current.field}`;
    return groundedField() ? `project:${current.customField}` : "manual";
  };
  const selectField = (target: string) => {
    const current = clause();
    if (target.startsWith("story:")) {
      const field = target.slice("story:".length);
      props.onChange({ field, operator: field === "tags" ? "contains" : "equals", value: current.value });
    }
    else if (target.startsWith("project:")) props.onChange({ customField: target.slice("project:".length), operator: "equals", value: current.value });
    else props.onChange({ customField: "Custom.", operator: "equals", value: current.value });
  };
  const operators = () => operatorsForCondition(clause(), props.groundedFields);
  const updateItem = (index: number, next: Condition) => {
    if ("all" in props.condition) props.onChange({ all: props.condition.all.map((item, itemIndex) => itemIndex === index ? next : item) });
    if ("any" in props.condition) props.onChange({ any: props.condition.any.map((item, itemIndex) => itemIndex === index ? next : item) });
  };
  const addItem = () => {
    if ("all" in props.condition) props.onChange({ all: [...props.condition.all, newCondition("clause")] });
    if ("any" in props.condition) props.onChange({ any: [...props.condition.any, newCondition("clause")] });
  };

  return (
    <div class={`rounded-lg border border-slate-200 p-3 dark:border-slate-700 ${depth > 0 ? "bg-slate-50 dark:bg-slate-800/60" : ""}`}>
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Rule type</span>
        <select
          class="rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-900"
          value={kind()}
          onInput={(event) => props.onChange(changeConditionKind(props.condition, event.currentTarget.value as ConditionKind))}
        >
          <option value="clause">Field comparison</option>
          <option value="all">All of these (AND)</option>
          <option value="any">Any of these (OR)</option>
        </select>
      </div>
      <Show
        when={kind() === "clause"}
        fallback={
          <div class="mt-3 space-y-2">
            <For each={compoundItems()}>{(item, index) => (
              <div class="flex gap-2">
                <div class="min-w-0 flex-1"><ConditionEditor condition={item} onChange={(next) => updateItem(index(), next)} groundedFields={props.groundedFields} storyFieldOptions={props.storyFieldOptions} depth={depth + 1} /></div>
                <button class="self-start rounded px-2 py-1 text-sm text-rose-700 hover:bg-rose-50 dark:text-rose-300" type="button" aria-label="Remove condition" onClick={() => {
                  const items = compoundItems().filter((_, itemIndex) => itemIndex !== index());
                  if ("all" in props.condition) props.onChange({ all: items });
                  if ("any" in props.condition) props.onChange({ any: items });
                }}>×</button>
              </div>
            )}</For>
            <button class="text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-300" type="button" onClick={addItem}>+ Add rule</button>
          </div>
        }
      >
        <div class="mt-3 grid gap-2 sm:grid-cols-3">
          <select class="rounded border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" aria-label="Condition field" value={fieldTarget()} onChange={(event) => selectField(event.currentTarget.value)}>
            <optgroup label="Story fields"><For each={STORY_CONDITION_FIELDS}>{([value, label]) => <option value={`story:${value}`}>{label}</option>}</For></optgroup>
            <Show when={props.groundedFields?.length}><optgroup label="Connected project fields"><For each={props.groundedFields}>{(field) => <option value={`project:${field.referenceName}`}>{field.name}</option>}</For></optgroup></Show>
            <option value="manual">Enter a field reference manually…</option>
          </select>
          <Show when={fieldTarget() === "manual"}><input class="rounded border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" aria-label="Custom field reference" value={clauseField()} placeholder="Custom.Field" onInput={(event) => updateClause({ customField: event.currentTarget.value })} /></Show>
          <select class="rounded border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={clause().operator} onInput={(event) => updateClause({ operator: event.currentTarget.value as ConditionOperator })}>
            <For each={operators()}>{(operator) => <option value={operator}>{OPERATOR_LABELS[operator]}</option>}</For>
          </select>
          <Show
            when={groundedField()}
            keyed
            fallback={
              <Show
                when={storyOptions()}
                fallback={<input class="rounded border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={String(clause().value)} placeholder="Value" onInput={(event) => updateClause({ value: event.currentTarget.value })} />}
              >
                <select class="rounded border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={String(clause().value)} onInput={(event) => updateClause({ value: event.currentTarget.value })}>
                  <For each={storyOptions()}>{(option) => <option value={option}>{option}</option>}</For>
                </select>
              </Show>
            }
          >
            {(field) => <GroundedValueInput field={field} value={clause().value} onCommit={(value) => updateClause({ value })} />}
          </Show>
        </div>
      </Show>
    </div>
  );
}

function monthMatrix(year: number, month: number): Array<number | undefined> {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | undefined> = Array.from({ length: firstWeekday }, () => undefined);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);
  return cells;
}

const DATE_POPOVER_WIDTH = 256;
const DATE_POPOVER_HEIGHT_ESTIMATE = 380;

function DatePicker(props: { value: string; onChange: (next: string) => void }) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const isMacro = () => props.value in DATE_MACRO_LABELS;
  const selected = () => (props.value && !isMacro() ? new Date(`${props.value}T00:00:00`) : undefined);
  const [open, setOpen] = createSignal(false);
  const [coords, setCoords] = createSignal({ top: 0, left: 0 });
  const [viewYear, setViewYear] = createSignal(selected()?.getFullYear() ?? new Date().getFullYear());
  const [viewMonth, setViewMonth] = createSignal(selected()?.getMonth() ?? new Date().getMonth());
  let triggerRef: HTMLButtonElement | undefined;
  let popoverRef: HTMLDivElement | undefined;
  const formatted = () => (props.value ? friendlyDate(props.value) : "Set date");
  const shiftMonth = (delta: number) => { const next = new Date(viewYear(), viewMonth() + delta, 1); setViewYear(next.getFullYear()); setViewMonth(next.getMonth()); };
  const pickDay = (day: number) => { props.onChange(`${viewYear()}-${pad(viewMonth() + 1)}-${pad(day)}`); setOpen(false); };
  const isSelected = (day: number) => {
    const selectedDate = selected();
    return selectedDate?.getFullYear() === viewYear() && selectedDate.getMonth() === viewMonth() && selectedDate.getDate() === day;
  };
  const openPicker = () => {
    const rect = triggerRef?.getBoundingClientRect();
    if (rect) {
      const container = triggerRef?.closest('[role="dialog"]')?.getBoundingClientRect();
      const minLeft = (container?.left ?? 0) + 8;
      const maxLeft = (container?.right ?? window.innerWidth) - DATE_POPOVER_WIDTH - 8;
      const left = Math.min(Math.max(minLeft, rect.left), Math.max(minLeft, maxLeft));
      const top = rect.bottom + DATE_POPOVER_HEIGHT_ESTIMATE + 4 > window.innerHeight ? Math.max(8, rect.top - DATE_POPOVER_HEIGHT_ESTIMATE - 4) : rect.bottom + 4;
      setCoords({ top, left });
    }
    setOpen(true);
  };
  const reposition = () => {
    const rect = triggerRef?.getBoundingClientRect();
    const popRect = popoverRef?.getBoundingClientRect();
    if (!rect || !popRect) return;
    const container = triggerRef?.closest('[role="dialog"]')?.getBoundingClientRect();
    const minLeft = (container?.left ?? 0) + 8;
    const maxLeft = (container?.right ?? window.innerWidth) - popRect.width - 8;
    const left = Math.min(Math.max(minLeft, rect.left), Math.max(minLeft, maxLeft));
    const fitsBelow = popRect.height + 4 <= window.innerHeight - rect.bottom;
    const top = fitsBelow ? rect.bottom + 4 : Math.max(8, rect.top - popRect.height - 4);
    setCoords({ top, left });
  };
  createEffect(() => {
    if (!open()) return;
    viewMonth(); viewYear(); // re-measure when navigating to a month with a different row count
    queueMicrotask(reposition);
  });
  createEffect(() => {
    if (!open()) return;
    const dismiss = () => setOpen(false);
    const clickOutside = (event: MouseEvent) => { const target = event.target as Node; if (!triggerRef?.contains(target) && !popoverRef?.contains(target)) dismiss(); };
    document.addEventListener("mousedown", clickOutside, true);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    onCleanup(() => { document.removeEventListener("mousedown", clickOutside, true); window.removeEventListener("scroll", dismiss, true); window.removeEventListener("resize", dismiss); });
  });
  return (
    <>
      <button ref={triggerRef} type="button" class="flex w-full items-center gap-2 rounded border border-slate-300 bg-white px-2 py-2 text-left text-sm dark:border-slate-600 dark:bg-slate-900" onClick={() => (open() ? setOpen(false) : openPicker())}>
        <span aria-hidden="true">📅</span>{formatted()}
      </button>
      <Show when={open()}>
        <Portal>
          <div
            ref={popoverRef}
            role="dialog"
            class="fixed z-50 w-64 rounded-lg border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); } }}
            style={{ top: `${coords().top}px`, left: `${coords().left}px` }}
          >
            <div class="flex items-center justify-between">
              <button type="button" class="rounded px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Previous month" onClick={() => shiftMonth(-1)}>‹</button>
              <span class="text-sm font-semibold">{new Date(viewYear(), viewMonth(), 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
              <button type="button" class="rounded px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Next month" onClick={() => shiftMonth(1)}>›</button>
            </div>
            <div class="mt-2 grid grid-cols-7 gap-1 text-center text-xs">
              <For each={["S", "M", "T", "W", "T", "F", "S"]}>{(d) => <span class="py-1 font-semibold text-slate-400">{d}</span>}</For>
              <For each={monthMatrix(viewYear(), viewMonth())}>{(day) => (
                <Show when={day} keyed fallback={<span />}>
                  {(selectedDay) => <button type="button" class={`rounded py-1 text-sm ${isSelected(selectedDay) ? "bg-indigo-600 font-bold text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`} onClick={() => pickDay(selectedDay)}>{selectedDay}</button>}
                </Show>
              )}</For>
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-3 dark:border-slate-800">
              <For each={Object.keys(DATE_MACRO_LABELS)}>{(macro) => (
                <button
                  type="button"
                  class={`rounded-full px-2 py-1 text-xs font-semibold ${props.value === macro ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"}`}
                  title={props.value === macro ? "Click to remove this macro and pick a date below" : undefined}
                  onClick={() => {
                    const next = props.value === macro ? "" : macro;
                    props.onChange(next);
                    if (next) setOpen(false);
                  }}
                >
                  {DATE_MACRO_LABELS[macro]}
                </button>
              )}</For>
              <Show when={props.value}>
                <button
                  type="button"
                  class="ml-auto rounded-full px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
                  onClick={() => props.onChange("")}
                >
                  Clear
                </button>
              </Show>
            </div>
          </div>
        </Portal>
      </Show>
    </>
  );
}

function GroundedValueInput(props: { field: GroundedTaskField; value: Scalar; onCommit: (value: Scalar) => void }) {
  const [draft, setDraft] = createSignal(props.field.type === "datetime" ? String(props.value).split("T")[0] ?? "" : String(props.value));
  const commit = () => props.onCommit(coerceGroundedTaskValue(props.field, draft()));
  if (props.field.allowedValues?.length) return <select class="rounded border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={String(props.value)} onInput={(event) => props.onCommit(coerceGroundedTaskValue(props.field, event.currentTarget.value))}><For each={props.field.allowedValues}>{(option) => <option value={option}>{option}</option>}</For></select>;
  if (props.field.type === "boolean") return <select class="rounded border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={String(props.value)} onInput={(event) => props.onCommit(coerceGroundedTaskValue(props.field, event.currentTarget.value))}><option value="true">Yes</option><option value="false">No</option></select>;
  if (props.field.type === "datetime") return <DatePicker value={draft()} onChange={(next) => { setDraft(next); props.onCommit(coerceGroundedTaskValue(props.field, next)); }} />;
  return <input class="rounded border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" type={props.field.type === "integer" || props.field.type === "decimal" ? "number" : "text"} step={props.field.type === "decimal" ? "any" : undefined} value={draft()} onInput={(event) => setDraft(event.currentTarget.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />;
}

// Human labels for the field-type badge below. allowedValues takes priority over the raw
// schema type: a picklist field is still typed "string" in Azure DevOps, but its control
// (a <select>, via GroundedValueInput) is what users need to recognize at a glance.
const GROUNDED_TYPE_LABELS: Record<GroundedTaskField["type"], string> = {
  string: "String", integer: "Integer", decimal: "Decimal", boolean: "Boolean", identity: "Identity", datetime: "Date & time",
};
function groundedFieldKindLabel(field: GroundedTaskField): string {
  return field.allowedValues?.length ? "Picklist" : GROUNDED_TYPE_LABELS[field.type];
}

function CustomFieldRow(props: { name: string; value: () => Scalar; field?: GroundedTaskField; options: string[]; onChange: (name: string, value: Scalar) => void; onRename: (name: string, nextName: string) => void; onRemove: (name: string) => void }) {
  const value = () => props.value();
  return <div class="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[1fr_8rem_1fr_auto] dark:border-slate-700"><Show when={props.field} fallback={<><input class="rounded border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={props.name} placeholder="Custom.Field" onInput={(event) => props.onRename(props.name, event.currentTarget.value)} /><select class="rounded border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={typeof value()} onInput={(event) => { const type = event.currentTarget.value; props.onChange(props.name, type === "number" ? Number(value()) || 0 : type === "boolean" ? value() === true : String(value())); }}><option value="string">String</option><option value="number">Number</option><option value="boolean">Boolean</option></select><Show when={props.options.length} fallback={<input class="rounded border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" type={typeof value() === "number" ? "number" : "text"} value={String(value())} onInput={(event) => props.onChange(props.name, typeof value() === "number" ? Number(event.currentTarget.value) : event.currentTarget.value)} />}><select class="rounded border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" value={String(value())} onInput={(event) => props.onChange(props.name, event.currentTarget.value)}><For each={props.options}>{(option) => <option value={option}>{option}</option>}</For></select></Show></>}>
    {(field) => <><div class="rounded border border-slate-200 bg-slate-50 px-2 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"><span class="block font-medium">{field().name}</span><span class="block truncate text-xs text-slate-500">{field().referenceName}</span></div><div class="flex items-center"><span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{groundedFieldKindLabel(field())}</span></div><GroundedValueInput field={field()} value={value()} onCommit={(next) => props.onChange(props.name, next)} /></>}
  </Show><button class="rounded px-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300" type="button" onClick={() => props.onRemove(props.name)}>Remove</button></div>;
}

function CustomFieldsEditor(props: { task: () => EditableTask; groundedFields: GroundedTaskField[]; groundedFieldOptions: Record<string, string[]>; onChange: (fields: Record<string, Scalar> | undefined) => void }) {
  const fields = () => props.task().advanced.customFields ?? {};
  const [adding, setAdding] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  const update = (name: string, value: Scalar) => props.onChange({ ...fields(), [name]: value });
  const groundedField = (referenceName: string) => props.groundedFields.find((field) => field.referenceName === referenceName);
  const rename = (name: string, nextName: string) => { const value = fields()[name]; if (value === undefined) return; const next = { ...fields() }; delete next[name]; next[nextName] = value; props.onChange(next); };
  const remove = (name: string) => { const next = { ...fields() }; delete next[name]; props.onChange(Object.keys(next).length ? next : undefined); };
  // A single entry point replaces the old two-block layout (a big "connected project"
  // callout plus a separate "add manually" button): typing a name that matches a
  // connected field (via the datalist) adds it grounded; anything else becomes a manual
  // Custom.* field, same as before but named up front instead of renamed after adding.
  const commitAdd = () => {
    const raw = draft().trim();
    setDraft(""); setAdding(false);
    if (!raw) return;
    const matched = props.groundedFields.find((field) => field.name.toLowerCase() === raw.toLowerCase() || field.referenceName.toLowerCase() === raw.toLowerCase());
    if (matched) { update(matched.referenceName, matched.type === "boolean" ? false : matched.type === "integer" || matched.type === "decimal" ? 0 : ""); return; }
    update(raw.startsWith("Custom.") ? raw : `Custom.${raw}`, "");
  };
  return <div class="space-y-2">
    <For each={Object.keys(fields())}>{(name) => <CustomFieldRow name={name} value={() => fields()[name] ?? ""} field={groundedField(name)} options={props.groundedFieldOptions[name] ?? []} onChange={update} onRename={rename} onRemove={remove} />}</For>
    <Show when={adding()} fallback={<button type="button" class="text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-300" onClick={() => setAdding(true)}>+ Add field</button>}>
      <input
        autofocus
        list="custom-field-suggestions"
        class="w-full rounded-lg border border-indigo-300 px-3 py-2 text-sm outline-none dark:border-indigo-700 dark:bg-slate-900"
        placeholder={props.groundedFields.length ? "Search connected fields or type a new one..." : "Type a field name..."}
        value={draft()}
        onInput={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitAdd(); } if (event.key === "Escape") { setDraft(""); setAdding(false); } }}
        onBlur={commitAdd}
      />
      <datalist id="custom-field-suggestions"><For each={props.groundedFields.filter((field) => !(field.referenceName in fields()))}>{(field) => <option value={field.name} />}</For></datalist>
    </Show>
  </div>;
}

function TaskDialog(props: { store: TasksStore; index: () => number; onClose: () => void; groundedFields: GroundedTaskField[]; conditionFields: GroundedTaskField[]; storyFieldOptions: StoryFieldGroundedOptions; groundedFieldOptions: Record<string, string[]>; activityField?: GroundedTaskField; autoNormalize: boolean }) {
  const s = props.store;
  let dialog: HTMLElement | undefined;
  const task = () => s.fields.items[props.index()];
  // Do not read the Task through Show's child accessor: it only tracks whether
  // a Task exists, so nested store updates (such as condition kind) can leave
  // this editor rendering the previously selected Task snapshot.
  const current = () => {
    const value = task();
    if (!value) throw new Error("Task editor requires a task");
    return value;
  };
  onMount(() => dialog?.focus());
  const setAdvanced = <K extends keyof EditableTask["advanced"]>(key: K, value: EditableTask["advanced"][K]) => s.set("items", props.index(), "advanced", key, value);
  // The store setter merges plain-object values into the existing nested object instead of
  // replacing it, so switching a Condition between clause/all/any left stale keys (e.g. a
  // leftover "all") behind forever. reconcile() forces a full, shape-aware replacement.
  const setCondition = (condition: Condition | undefined) => {
    if (condition === undefined) setAdvanced("condition", undefined);
    else s.set("items", props.index(), "advanced", "condition", reconcile(condition));
  };
  const move = (direction: -1 | 1) => s.moveTask(props.index(), props.index() + direction);
  const remove = () => {
    const current = task(); if (!current) return;
    const references = current.fields.id ? s.fields.items.filter((item) => item.advanced.dependsOn?.includes(current.fields.id)).length : 0;
    if (references > 0 && !window.confirm(`Remove this Task and ${references} affected dependency reference${references === 1 ? "" : "s"}?`)) return;
    s.removeTask(props.index()); s.validate(); props.onClose();
  };
  const [showRules, setShowRules] = createSignal(false);
  const [showConditionalRules, setShowConditionalRules] = createSignal(false);
  createEffect(() => { props.index(); setShowRules(false); setShowConditionalRules(false); });
  return <div class="fixed inset-0 z-50 grid place-items-center bg-slate-950/55 p-4" role="dialog" onMouseDown={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
    <section ref={dialog} tabindex="-1" role="dialog" aria-modal="true" aria-label="Edit task" onKeyDown={(event) => { if (event.key === "Escape") props.onClose(); }} class="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl outline-none dark:border-slate-700 dark:bg-slate-900 sm:p-8">
      <Show when={task()}>
        <header class="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 pb-5 dark:border-slate-800"><div><p class="text-xs font-bold tracking-widest text-indigo-600 uppercase dark:text-indigo-300">Editing Task {props.index() + 1}</p><h2 class="mt-1 text-2xl font-bold">{current().fields.title || "Untitled task"}</h2></div><div class="flex flex-wrap items-center gap-2"><button class="grid size-9 place-items-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800" type="button" aria-label="Move task up" title="Move up" disabled={props.index() <= 0} onClick={() => move(-1)}>↑</button><button class="grid size-9 place-items-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800" type="button" aria-label="Move task down" title="Move down" disabled={props.index() >= s.fields.items.length - 1} onClick={() => move(1)}>↓</button><button class="rounded-lg px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40" type="button" onClick={remove}>Remove</button><button class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500" type="button" onClick={props.onClose}>Done</button></div></header>
        <div class="mt-6 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
          <div class="space-y-7">
            <section><h3 class="text-sm font-bold">Basic</h3><div class="mt-4"><TextField label="Title" value={current().fields.title} error={s.errors[`tasks.${props.index()}.title`]} required onInput={(value) => { s.set("items", props.index(), "fields", "title", value); s.validate(); }} onBlur={s.validate} placeholder="Task title" /><TextField label="Task ID" value={current().fields.id} onInput={(value) => s.updateTaskId(props.index(), value)} placeholder="task-id" /><TextareaField label="Description" value={current().fields.description} onInput={(value) => s.set("items", props.index(), "fields", "description", value)} placeholder="What this task involves..." /><TagChipInput label="Tags" value={current().fields.tags} onChange={(value) => s.set("items", props.index(), "fields", "tags", value)} placeholder="dev, test..." /></div></section>
            <section class="border-t border-slate-100 pt-6 dark:border-slate-800"><h3 class="text-sm font-bold">Work item fields</h3><p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Set who should receive the Task and any Azure DevOps fields it needs.</p><div class="mt-4 grid gap-5 sm:grid-cols-2"><div><TextField label="Assignee" listId="task-assignee-directives" value={current().advanced.assignTo ?? ""} onInput={(value) => setAdvanced("assignTo", value || undefined)} placeholder="@ParentAssignee, @Me, or email" /><datalist id="task-assignee-directives"><option value="@ParentAssignee">Inherit the parent Story assignee</option><option value="@Me">Assign to the connected user</option><option value="@Unassigned">Leave unassigned</option></datalist><TextField label="Priority" value={current().advanced.priority === undefined ? "" : String(current().advanced.priority)} onInput={(value) => setAdvanced("priority", value.trim() === "" ? undefined : Number(value))} placeholder="1" />
              <Show
                when={props.activityField}
                keyed
                fallback={<TextField label="Activity" value={current().advanced.activity ?? ""} onInput={(value) => setAdvanced("activity", value || undefined)} placeholder="Development" />}
              >
                {(field) => <div class="ui-field"><span class="ui-label">Activity</span><GroundedValueInput field={field} value={current().advanced.activity ?? ""} onCommit={(value) => setAdvanced("activity", value === "" ? undefined : String(value))} /></div>}
              </Show>
            </div><div><TagChipInput
              label="Acceptance criteria"
              value={current().advanced.acceptanceCriteria ?? []}
              onChange={(value) => setAdvanced("acceptanceCriteria", value.length ? value : undefined)}
              placeholder="Press Enter for each criterion"
              labelExtra={
                <button
                  type="button"
                  class={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${current().advanced.acceptanceCriteriaAsChecklist ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`}
                  title="Formats each acceptance criterion as a markdown checklist item in the generated Task description."
                  onClick={() => setAdvanced("acceptanceCriteriaAsChecklist", !(current().advanced.acceptanceCriteriaAsChecklist ?? false) || undefined)}
                >
                  <span aria-hidden="true">☑</span> Checklist
                </button>
              }
            /></div></div><div class="mt-5"><p class="mb-2 text-sm font-semibold">Custom fields</p><CustomFieldsEditor task={current} groundedFields={props.groundedFields} groundedFieldOptions={props.groundedFieldOptions} onChange={(fields) => setAdvanced("customFields", fields)} /></div></section>
          </div>
          <aside class="space-y-5 rounded-2xl border border-indigo-200 bg-indigo-50/60 p-5 dark:border-indigo-900 dark:bg-indigo-950/30">
            <div><p class="text-xs font-bold tracking-widest text-indigo-700 uppercase dark:text-indigo-300">Rules & estimates</p>
              <div class="mt-3">
                <button type="button" class="flex w-full items-center justify-between text-left" onClick={() => setShowRules(!showRules())}>
                  <p class="text-sm font-semibold">When</p>
                  <span class="text-xs font-semibold text-indigo-600 dark:text-indigo-300">{showRules() ? "Collapse" : "Expand"}</span>
                </button>
                <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">{conditionSummary(current().advanced.condition, props.conditionFields)}</p>
                <Show when={showRules()}><Show when={current().advanced.condition} keyed fallback={<button class="mt-2 text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-300" type="button" onClick={() => setCondition(newCondition("clause"))}>+ Add condition</button>}>{(condition) => <div class="mt-3 space-y-2"><ConditionEditor condition={condition} onChange={setCondition} groundedFields={props.conditionFields} storyFieldOptions={props.storyFieldOptions} /><button class="text-sm font-semibold text-rose-700 hover:underline dark:text-rose-300" type="button" onClick={() => setCondition(undefined)}>Remove condition</button></div>}</Show></Show>
              </div>
            </div>
            <MultiSelectField label="Depends on" selected={current().advanced.dependsOn ?? []} options={s.fields.items.filter((item) => item.key !== current().key && item.fields.id).map((item) => item.fields.id)} allowCustom onChange={(value) => setAdvanced("dependsOn", value.length ? value : undefined)} />
            <div><span class="text-sm font-semibold">Estimation</span><div class="estimation-mode-row mt-2 grid grid-cols-2 gap-2"><select class="rounded border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" aria-label="Estimation mode" value={current().advanced.estimationFixed !== undefined ? "fixed" : current().advanced.estimationFormula ? "formula" : "percentage"} onInput={(event) => { const mode = event.currentTarget.value; if (mode === "percentage") { setAdvanced("estimationFixed", undefined); setAdvanced("estimationFormula", undefined); } if (mode === "fixed") { s.set("items", props.index(), "fields", "estimationPercent", ""); setAdvanced("estimationFixed", current().advanced.estimationFixed ?? 0); setAdvanced("estimationFormula", undefined); } if (mode === "formula") { s.set("items", props.index(), "fields", "estimationPercent", ""); setAdvanced("estimationFixed", undefined); setAdvanced("estimationFormula", current().advanced.estimationFormula ?? ""); } }}><option value="percentage">Percentage of parent</option><option value="fixed">Fixed estimate</option><option value="formula">Formula</option></select><Show when={current().advanced.estimationFixed !== undefined} fallback={<Show when={current().advanced.estimationFormula !== undefined} fallback={<TextField label="Percentage" hideLabel value={current().fields.estimationPercent} error={s.errors[`tasks.${props.index()}.estimationPercent`]} onInput={(value) => { s.updatePercentage(props.index(), value, props.autoNormalize); s.validate(); }} onBlur={s.validate} placeholder="20" />}><TextField label="Formula" hideLabel value={current().advanced.estimationFormula ?? ""} onInput={(value) => setAdvanced("estimationFormula", value)} placeholder="parent * 0.2 + 1" /></Show>}><TextField label="Fixed estimate" hideLabel value={String(current().advanced.estimationFixed ?? "")} onInput={(value) => setAdvanced("estimationFixed", Number(value))} placeholder="3" /></Show></div></div>
            <div class="rounded-lg border border-dashed border-indigo-300 p-3 dark:border-indigo-800">
              <button type="button" class="flex w-full items-center justify-between text-left" onClick={() => setShowConditionalRules(!showConditionalRules())}>
                <span class="text-sm font-semibold">Conditional percentage rules{(current().advanced.estimationPercentCondition ?? []).length > 0 ? ` (${(current().advanced.estimationPercentCondition ?? []).length})` : ""}</span>
                <span class="text-xs font-semibold text-indigo-600 dark:text-indigo-300">{showConditionalRules() ? "Collapse" : "Expand"}</span>
              </button>
              <Show when={showConditionalRules()}>
                <div class="mt-3"><For each={current().advanced.estimationPercentCondition ?? []}>{(rule, ruleIndex) => <div class="mt-3 space-y-2 border-t border-indigo-100 pt-3 first:mt-0 first:border-0 first:pt-0 dark:border-indigo-900"><ConditionEditor condition={rule.condition} onChange={(condition) => setAdvanced("estimationPercentCondition", (current().advanced.estimationPercentCondition ?? []).map((item, itemIndex) => itemIndex === ruleIndex() ? { ...item, condition } : item))} groundedFields={props.conditionFields} storyFieldOptions={props.storyFieldOptions} /><div class="flex items-center justify-between gap-3"><input class="w-24 rounded border border-slate-300 bg-white px-2 py-2 text-sm dark:border-slate-600 dark:bg-slate-900" type="number" min="0" max="100" value={rule.percent} aria-label="Conditional percentage" onInput={(event) => setAdvanced("estimationPercentCondition", (current().advanced.estimationPercentCondition ?? []).map((item, itemIndex) => itemIndex === ruleIndex() ? { ...item, percent: Number(event.currentTarget.value) } : item))} /><button class="text-sm font-semibold text-rose-700 hover:underline dark:text-rose-300" type="button" onClick={() => setAdvanced("estimationPercentCondition", (current().advanced.estimationPercentCondition ?? []).filter((_, itemIndex) => itemIndex !== ruleIndex()) || undefined)}>Remove rule</button></div></div>}</For><button class="mt-3 text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-300" type="button" onClick={() => setAdvanced("estimationPercentCondition", [...(current().advanced.estimationPercentCondition ?? []), { condition: newCondition("clause"), percent: 0 }])}>+ Add conditional percentage</button></div>
              </Show>
            </div>
          </aside>
        </div>
      </Show>
    </section>
  </div>;
}

function SortableTaskOutlineItem(props: { store: TasksStore; taskKey: string; index: () => number; selected: boolean; onSelect: () => void; conditionFields: GroundedTaskField[] }) {
  const sortable = createSortable(props.taskKey);
  const task = () => props.store.fields.items.find((item) => item.key === props.taskKey);
  const percent = () => Math.min(100, Math.max(0, Number(task()?.fields.estimationPercent) || 0));
  return <div ref={sortable} class={`flex rounded-lg will-change-transform ${sortable.isActiveDraggable ? "" : "transition-transform duration-150 ease-out"} ${props.selected ? "bg-white shadow-sm ring-1 ring-indigo-100 dark:bg-slate-800 dark:ring-indigo-900" : "hover:bg-white/70 dark:hover:bg-slate-800/60"}`}>
    <button type="button" {...sortable.dragActivators} class="w-9 shrink-0 cursor-grab touch-none text-slate-400 active:cursor-grabbing" aria-label={`Drag ${task()?.fields.title || "Task"} to reorder`}>⠿</button>
    <button type="button" class="min-w-0 flex-1 px-2 py-3 text-left" onClick={props.onSelect}>
      <span class="flex items-center gap-2"><span class="min-w-0 flex-1 truncate text-sm font-semibold">{task()?.fields.title || "Untitled task"}</span><span class="text-xs font-bold text-indigo-600 dark:text-indigo-300">{task()?.fields.estimationPercent ? `${task()?.fields.estimationPercent}%` : "—"}</span></span>
      <span class="mt-1 block truncate text-xs text-slate-500">{task()?.fields.id || "No task ID"} · {conditionSummary(task()?.advanced.condition, props.conditionFields)}</span>
      <Show when={task()?.fields.estimationPercent !== ""}><span class="mt-2 block h-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"><span class="block h-full rounded-full bg-indigo-500" style={{ width: `${percent()}%` }} /></span></Show>
    </button>
  </div>;
}

export function TasksSection(props: { store: TasksStore; grounding?: GroundingSession; conditionWorkItemTypes: string[]; autoNormalize: boolean; onAutoNormalizeChange: () => void }) {
  const s = props.store;
  const [selectedKey, setSelectedKey] = createSignal("");
  const selectedIndex = createMemo(() => s.fields.items.findIndex((task) => task.key === selectedKey()));
  const percentageTotal = createMemo(() => s.fields.items.reduce((sum, task) => sum + (Number(task.fields.estimationPercent) || 0), 0));
  const select = (index: number) => setSelectedKey(s.fields.items[index]?.key ?? "");
  const add = () => { s.addTask(); select(s.fields.items.length - 1); };
  const idCount = createMemo(() => s.fields.items.filter((task) => task.fields.id.trim()).length);
  const dependencyCount = createMemo(() => s.fields.items.reduce((total, task) => total + (task.advanced.dependsOn?.length ?? 0), 0));
  const groundedFields = createMemo(() => editableTaskFields(props.grounding?.options()));
  const conditionFields = createMemo(() => groundedConditionFields(props.grounding?.options(), props.conditionWorkItemTypes));
  const activityField = createMemo(() => groundedActivityField(props.grounding?.options()));
  const storyFieldOptions = createMemo<StoryFieldGroundedOptions>(() => {
    const options = props.grounding?.options();
    return {
      type: options?.workItemTypes ?? [],
      state: statesForTypes(options, props.conditionWorkItemTypes),
      areaPath: options?.areaPaths ?? [],
      iteration: options?.iterationPaths ?? [],
    };
  });
  const groundedFieldOptions = createMemo<Record<string, string[]>>(() => Object.fromEntries((props.grounding?.options()?.taskFields ?? []).flatMap((field) => field.allowedValues?.length ? [[field.referenceName, field.allowedValues]] : [])));
  const reorder = (fromKey: string, toKey: string) => {
    const from = s.fields.items.findIndex((item) => item.key === fromKey);
    const to = s.fields.items.findIndex((item) => item.key === toKey);
    if (from >= 0 && to >= 0) s.moveTask(from, to);
  };

  return <div>
    <aside class="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
      <div class="mb-3 flex items-center justify-between px-1">
        <div><p class="text-xs font-bold tracking-widest text-slate-500 uppercase">Task outline</p><p class="mt-1 text-xs text-slate-500">Use the handle to arrange generation order.</p></div>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-bold ${props.autoNormalize ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200" : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"}`}
            aria-pressed={props.autoNormalize}
            aria-label={`Auto-normalise percentages: ${props.autoNormalize ? "on" : "off"}`}
            title="When you change one percentage, keep it and redistribute the other valid percentage Tasks so their total stays at 100%. This preference is not written to YAML."
            onClick={props.onAutoNormalizeChange}
          >
            <span class={`size-1.5 shrink-0 rounded-full ${props.autoNormalize ? "bg-indigo-600" : "bg-slate-400 dark:bg-slate-600"}`} aria-hidden="true" />
            Normalise
          </button>
          <button type="button" class="grid size-9 place-items-center rounded-lg text-xl font-bold text-indigo-600 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/40" onClick={add} aria-label="Add task">+</button>
        </div>
      </div>
      <DragDropProvider onDragEnd={({ draggable, droppable }) => { if (droppable) reorder(String(draggable.id), String(droppable.id)); }}>
        <DragDropSensors>
          <SortableProvider ids={s.fields.items.map((task) => task.key)}>
            <div class="space-y-1"><For each={s.fields.items}>{(task, index) => <SortableTaskOutlineItem store={s} taskKey={task.key} index={index} selected={selectedKey() === task.key} onSelect={() => select(index())} conditionFields={conditionFields()} />}</For></div>
          </SortableProvider>
        </DragDropSensors>
      </DragDropProvider>
      <Show when={s.fields.items.length === 0}><div class="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">No Tasks yet. Add one to begin.</div></Show>
      <div class="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 px-1 pt-3 text-xs dark:border-slate-800">
        <p><span class="block text-slate-500">Task IDs</span><span class="font-semibold text-emerald-600">{idCount()} set</span></p><p><span class="block text-slate-500">Dependencies</span><span class="font-semibold text-emerald-600">{dependencyCount()} linked</span></p><p><span class="block text-slate-500">Percentage total</span><span class="font-semibold text-amber-600">{percentageTotal()}%</span></p><p><span class="block text-slate-500">Grounding</span><span class="font-semibold text-slate-600 dark:text-slate-300">{props.grounding?.state?.() === "ready" ? "Connected" : "Offline ready"}</span></p>
      </div>
    </aside>
    <Show when={selectedIndex() >= 0}><TaskDialog store={s} index={selectedIndex} groundedFields={groundedFields()} conditionFields={conditionFields()} storyFieldOptions={storyFieldOptions()} groundedFieldOptions={groundedFieldOptions()} activityField={activityField()} autoNormalize={props.autoNormalize} onClose={() => setSelectedKey("")} /></Show>
  </div>;
}
