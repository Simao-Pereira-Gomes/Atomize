import { For } from "solid-js";
import { documentLabel } from "../grounding/grounding-summary";
import type { DocumentGrounding } from "../references/reference-documents";

/**
 * Asked before sending when Reference Documents won't fit in one AI request: send them shortened,
 * go back and leave some out, or stop.
 */
export function ShorteningChoice(props: { shortened: DocumentGrounding["documents"]; onContinue: () => void; onLeaveOut: () => void; onCancel: () => void }) {
  return (
    <section class="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100" role="alert">
      <p class="font-bold">{props.shortened.length === 1 ? "1 Reference Document won't fit in full" : `${props.shortened.length} Reference Documents won't fit in full`}</p>
      <p class="mt-1 text-xs leading-5">Copilot would see the start of each of these, shortened to fit one AI request:</p>
      <ul class="mt-1 list-disc pl-5 text-xs leading-5">
        <For each={props.shortened}>{(document) => <li class="break-all">{documentLabel(document.ref)}</li>}</For>
      </ul>
      <div class="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" class="rounded-lg !bg-amber-700 px-3 py-1.5 text-sm font-semibold !text-white hover:!bg-amber-800" onClick={props.onContinue}>Continue shortened</button>
        <button type="button" class="rounded-lg border border-amber-400 px-3 py-1.5 text-sm font-semibold dark:border-amber-700" onClick={props.onLeaveOut}>Leave some out</button>
        <button type="button" class="px-2 text-sm font-semibold underline" onClick={props.onCancel}>Cancel</button>
      </div>
    </section>
  );
}
