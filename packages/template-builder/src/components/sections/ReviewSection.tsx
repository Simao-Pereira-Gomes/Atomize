import type { AuthoringStore } from "../../stores/sections";

export function ReviewSection(props: { store: AuthoringStore; canReview: boolean }) {
  return (
    <div class="space-y-5">
      <p class="text-sm leading-6 text-slate-600 dark:text-slate-300">
        Review the generated Atomize YAML. Return to the highlighted sections to finish any required information.
      </p>
      {props.canReview ? (
        <pre class="overflow-x-auto rounded-xl bg-slate-950 p-5 text-sm leading-6 text-slate-100">
          <code>{props.store.serialise()}</code>
        </pre>
      ) : (
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          Complete the required fields in Basic Info and Tasks, and correct any invalid values, to preview the final YAML.
        </div>
      )}
    </div>
  );
}
