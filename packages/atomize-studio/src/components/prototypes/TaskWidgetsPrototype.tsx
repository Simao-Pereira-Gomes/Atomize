/*
 * PROTOTYPE — throwaway UI for issue #113.
 * Three treatments of three specific pain points in the real TaskDialog, on
 * ?prototype=task-widgets&variant=a|b|c:
 *   1. Acceptance criteria / "Render as checklist" — currently a full toggle switch
 *      plus a 3-line description paragraph. Too bulky, over-explained.
 *   2. Custom fields entry — currently a big indigo callout box for "connected
 *      project" fields plus a separate dashed button for manual fields. Feels clunky.
 *   3. Grounded date values — currently a raw native <input type="datetime-local">
 *      (ugly OS-default widget), and the condition summary text leaks the raw ISO
 *      string instead of a human-readable date.
 * Note: TasksSection.tsx's shared field components (ToggleField, TagChipInput) use a
 * CSS-variable design system (.sk-*, .ui-*, App.css), while TaskDialog's own markup is
 * ad-hoc Tailwind (slate/indigo). That mismatch is likely part of why things read as
 * inconsistent — flagged here, not fixed, since unifying it is a bigger decision.
 */
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";

type VariantKey = "a" | "b" | "c";

const VARIANTS: Array<{ key: VariantKey; name: string }> = [
  { key: "a", name: "Inline compact" },
  { key: "b", name: "Table + popover" },
  { key: "c", name: "Ghost minimal" },
];

const SAMPLE_ISO = "2026-08-14T09:30:00.000Z";
function friendlyDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

const CALENDAR_DAYS = Array.from({ length: 30 }, (_, i) => i + 1);

function MiniCalendar(props: { selected?: number }) {
  return (
    <div class="grid grid-cols-7 gap-1 text-center text-xs">
      <For each={["S", "M", "T", "W", "T", "F", "S"]}>{(d) => <span class="py-1 font-semibold text-slate-400">{d}</span>}</For>
      <For each={CALENDAR_DAYS}>{(day) => (
        <span class={`rounded py-1 ${day === props.selected ? "bg-indigo-600 font-bold text-white" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}>{day}</span>
      )}</For>
    </div>
  );
}

/* ---------- Acceptance criteria / checklist ---------- */

function AcceptanceCriteriaA() {
  const [asChecklist, setAsChecklist] = createSignal(true);
  return (
    <div>
      <div class="flex items-center justify-between">
        <label class="text-xs font-semibold text-slate-600 dark:text-slate-300">Acceptance criteria</label>
        <button type="button" onClick={() => setAsChecklist(!asChecklist())} class={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${asChecklist() ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}`} title="Format as a markdown checklist in the generated Task">
          <span>☑</span> Checklist
        </button>
      </div>
      <div class="mt-1 flex flex-wrap gap-1 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
        <span class="rounded bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">API returns 200</span>
        <span class="rounded bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">Tests pass</span>
        <input class="min-w-24 flex-1 bg-transparent text-sm outline-none" placeholder="Add..." />
      </div>
    </div>
  );
}

function AcceptanceCriteriaB() {
  const [asChecklist, setAsChecklist] = createSignal(true);
  return (
    <div class="rounded-lg border border-slate-200 dark:border-slate-700">
      <div class="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-slate-800">
        <span class="text-xs font-semibold text-slate-600 dark:text-slate-300">Acceptance criteria</span>
        <label class="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400" title="Formats each criterion as a markdown checklist item">
          <input type="checkbox" checked={asChecklist()} onChange={() => setAsChecklist(!asChecklist())} /> as checklist
        </label>
      </div>
      <ul class="space-y-1 p-3 text-sm">
        <li class="flex items-center gap-2"><Show when={asChecklist()} fallback={<span class="text-slate-300">·</span>}><input type="checkbox" /></Show> API returns 200</li>
        <li class="flex items-center gap-2"><Show when={asChecklist()} fallback={<span class="text-slate-300">·</span>}><input type="checkbox" /></Show> Tests pass</li>
        <li class="text-slate-400">+ Add criterion</li>
      </ul>
    </div>
  );
}

function AcceptanceCriteriaC() {
  const [format, setFormat] = createSignal<"plain" | "checklist">("checklist");
  return (
    <div>
      <div class="flex items-center gap-2">
        <label class="text-xs font-semibold text-slate-600 dark:text-slate-300">Acceptance criteria</label>
        <select class="rounded border-none bg-transparent text-xs font-semibold text-indigo-600 outline-none dark:text-indigo-300" value={format()} onInput={(e) => setFormat(e.currentTarget.value as "plain" | "checklist")}>
          <option value="plain">as text</option>
          <option value="checklist">as checklist</option>
        </select>
      </div>
      <div class="mt-1 space-y-1 border-l-2 border-slate-100 pl-3 text-sm dark:border-slate-800">
        <p>{format() === "checklist" ? "☐" : "—"} API returns 200</p>
        <p>{format() === "checklist" ? "☐" : "—"} Tests pass</p>
        <p class="text-slate-400">+ Add criterion</p>
      </div>
    </div>
  );
}

/* ---------- Custom fields entry ---------- */

const EXAMPLE_FIELDS = [
  { name: "Client tier", ref: "Custom.ClientTier", badge: "Picklist", value: "Gold" },
  { name: "Launch date", ref: "Custom.LaunchDate", badge: "Date & time", value: friendlyDateTime(SAMPLE_ISO) },
];

function CustomFieldsA() {
  const [adding, setAdding] = createSignal(false);
  return (
    <div>
      <p class="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">Custom fields</p>
      <div class="space-y-1">
        <For each={EXAMPLE_FIELDS}>{(f) => (
          <div class="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
            <span class="font-medium">{f.name}</span>
            <span class="flex items-center gap-2 text-slate-500"><span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">{f.badge}</span>{f.value}</span>
          </div>
        )}</For>
      </div>
      <Show when={!adding()} fallback={<input autofocus class="mt-2 w-full rounded-lg border border-indigo-300 px-3 py-2 text-sm outline-none dark:border-indigo-700 dark:bg-slate-900" placeholder="Search connected fields or type a new one..." onBlur={() => setAdding(false)} />}>
        <button type="button" class="mt-2 text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-300" onClick={() => setAdding(true)}>+ Add field</button>
      </Show>
    </div>
  );
}

function CustomFieldsB() {
  const [adding, setAdding] = createSignal(false);
  return (
    <div class="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
      <p class="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300">Custom fields</p>
      <table class="w-full text-sm">
        <tbody>
          <For each={EXAMPLE_FIELDS}>{(f) => (
            <tr class="border-b border-slate-100 last:border-0 dark:border-slate-800">
              <td class="px-3 py-2 font-medium">{f.name}</td>
              <td class="px-3 py-2"><span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">{f.badge}</span></td>
              <td class="px-3 py-2 text-slate-500">{f.value}</td>
              <td class="px-3 py-2 text-right text-slate-400">⋮</td>
            </tr>
          )}</For>
          <tr>
            <td colspan={4} class="px-3 py-2">
              <Show when={!adding()} fallback={<input autofocus class="w-full rounded border border-slate-200 px-2 py-1.5 text-sm outline-none dark:border-slate-700 dark:bg-slate-900" placeholder="Field name — connected fields autocomplete" onBlur={() => setAdding(false)} />}>
                <button type="button" class="text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-300" onClick={() => setAdding(true)}>+ Field</button>
              </Show>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CustomFieldsC() {
  const [adding, setAdding] = createSignal(false);
  return (
    <div>
      <p class="mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">Custom fields</p>
      <div class="divide-y divide-slate-100 dark:divide-slate-800">
        <For each={EXAMPLE_FIELDS}>{(f) => (
          <div class="flex items-center justify-between py-2 text-sm">
            <span>{f.name} <span class="text-slate-400">· {f.badge}</span></span>
            <span class="text-slate-500">{f.value}</span>
          </div>
        )}</For>
        <div class="py-2">
          <Show when={!adding()} fallback={<input autofocus class="w-full border-b border-dashed border-slate-300 bg-transparent py-1 text-sm outline-none dark:border-slate-600" placeholder="Type a field name..." onBlur={() => setAdding(false)} />}>
            <button type="button" class="text-sm text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300" onClick={() => setAdding(true)}>+ field</button>
          </Show>
        </div>
      </div>
    </div>
  );
}

/* ---------- Rules value: date control + condition summary ---------- */

function RulesValueA() {
  const [open, setOpen] = createSignal(false);
  return (
    <div>
      <p class="text-sm"><span class="font-semibold">When</span> <span class="text-slate-500 dark:text-slate-400">Launch date is after {friendlyDateTime(SAMPLE_ISO)}</span></p>
      <div class="relative mt-2 inline-block">
        <button type="button" onClick={() => setOpen(!open())} class="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900">📅 {friendlyDateTime(SAMPLE_ISO)}</button>
        <Show when={open()}><div class="absolute z-10 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900"><MiniCalendar selected={14} /></div></Show>
      </div>
    </div>
  );
}

function RulesValueB() {
  return (
    <div>
      <p class="text-sm"><span class="font-semibold">When</span> <span class="text-slate-500 dark:text-slate-400">Launch date is after {friendlyDateTime(SAMPLE_ISO)}</span></p>
      <div class="mt-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
        <MiniCalendar selected={14} />
        <div class="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-xs dark:border-slate-800"><span class="text-slate-500">9:30 AM</span><button type="button" class="font-semibold text-indigo-600 dark:text-indigo-300">Now</button></div>
      </div>
    </div>
  );
}

function RulesValueC() {
  const [open, setOpen] = createSignal(false);
  return (
    <div>
      <p class="text-sm"><span class="font-semibold">When</span> <span class="text-slate-500 dark:text-slate-400">Launch date is after {friendlyDateTime(SAMPLE_ISO)}</span></p>
      <button type="button" onClick={() => setOpen(!open())} class="mt-2 border-b border-dashed border-slate-400 text-sm font-medium text-slate-700 dark:text-slate-200">{friendlyDateTime(SAMPLE_ISO)} ▾</button>
      <Show when={open()}><div class="mt-2 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900"><MiniCalendar selected={14} /></div></Show>
    </div>
  );
}

/* ---------- Variant shells ---------- */

function VariantShell(props: { title: string; note: string; children: unknown }) {
  return (
    <section class="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <p class="text-xs font-bold tracking-widest text-indigo-600 uppercase dark:text-indigo-300">{props.title}</p>
      <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">{props.note}</p>
      <div class="mt-5 space-y-6">{props.children as never}</div>
    </section>
  );
}

function VariantA() {
  return <VariantShell title="A — Inline compact" note="Toggle collapses into a small pill next to the label; add-field collapses two blocks into one search input; date becomes a button + calendar popover.">
    <AcceptanceCriteriaA /><div class="border-t border-slate-100 pt-6 dark:border-slate-800"><CustomFieldsA /></div><div class="border-t border-slate-100 pt-6 dark:border-slate-800"><RulesValueA /></div>
  </VariantShell>;
}
function VariantB() {
  return <VariantShell title="B — Table + popover" note="Checklist becomes a plain checkbox in a card header; custom fields become a real table with an inline add row; date shows the calendar open by default (always-visible picker, not native input).">
    <AcceptanceCriteriaB /><div class="border-t border-slate-100 pt-6 dark:border-slate-800"><CustomFieldsB /></div><div class="border-t border-slate-100 pt-6 dark:border-slate-800"><RulesValueB /></div>
  </VariantShell>;
}
function VariantC() {
  return <VariantShell title="C — Ghost minimal" note="No switches at all — a plain inline dropdown for format; custom fields are borderless rows with a ghost + link; date is a dashed-underline text button that opens a small calendar.">
    <AcceptanceCriteriaC /><div class="border-t border-slate-100 pt-6 dark:border-slate-800"><CustomFieldsC /></div><div class="border-t border-slate-100 pt-6 dark:border-slate-800"><RulesValueC /></div>
  </VariantShell>;
}

function PrototypeSwitcher(props: { variant: () => VariantKey; setVariant: (next: VariantKey) => void }) {
  const move = (delta: number) => { const current = VARIANTS.findIndex((variant) => variant.key === props.variant()); props.setVariant(VARIANTS[(current + delta + VARIANTS.length) % VARIANTS.length]!.key); };
  onMount(() => { const keydown = (event: KeyboardEvent) => { const target = event.target as HTMLElement | null; if (target?.matches("input, textarea, [contenteditable='true']")) return; if (event.key === "ArrowLeft") move(-1); if (event.key === "ArrowRight") move(1); }; window.addEventListener("keydown", keydown); onCleanup(() => window.removeEventListener("keydown", keydown)); });
  const label = () => VARIANTS.find((variant) => variant.key === props.variant())!;
  return <div class="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-slate-950 px-3 py-2 text-sm text-white shadow-2xl ring-1 ring-white/20"><button aria-label="Previous prototype" class="grid size-8 place-items-center rounded-full bg-white/10 hover:bg-white/20" type="button" onClick={() => move(-1)}>←</button><span class="min-w-40 text-center text-xs font-bold tracking-wide"><span class="text-indigo-300">{label().key.toUpperCase()}</span> — {label().name}</span><button aria-label="Next prototype" class="grid size-8 place-items-center rounded-full bg-white/10 hover:bg-white/20" type="button" onClick={() => move(1)}>→</button></div>;
}

export function TaskWidgetsPrototype() {
  const initial = new URLSearchParams(window.location.search).get("variant");
  const [variant, setVariantState] = createSignal<VariantKey>(initial === "b" || initial === "c" ? initial : "a");
  const setVariant = (next: VariantKey) => { const url = new URL(window.location.href); url.searchParams.set("variant", next); history.replaceState(null, "", url); setVariantState(next); };
  return (
    <main class="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-8">
      <header class="mx-auto mb-7 flex max-w-2xl flex-wrap items-end justify-between gap-3">
        <div><p class="text-xs font-bold tracking-widest text-indigo-600 uppercase dark:text-indigo-300">Throwaway UI prototype · issue #113</p><h1 class="mt-1 text-3xl font-bold tracking-tight">Task widget treatments</h1></div>
        <p class="max-w-md text-sm text-slate-500 dark:text-slate-400">Checklist toggle, custom fields entry, and date display — the three pain points called out on the real form. Use ←/→ to compare.</p>
      </header>
      <Show when={variant() === "a"}><VariantA /></Show>
      <Show when={variant() === "b"}><VariantB /></Show>
      <Show when={variant() === "c"}><VariantC /></Show>
      <PrototypeSwitcher variant={variant} setVariant={setVariant} />
    </main>
  );
}
