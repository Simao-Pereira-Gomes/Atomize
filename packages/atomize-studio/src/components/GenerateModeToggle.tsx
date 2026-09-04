export type GenerateMode = "mock" | "live";

export function GenerateModeToggle(props: { mode: GenerateMode; onChange: (mode: GenerateMode) => void }) {
  return (
    <div class="flex shrink-0 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-800" title="Mock Preview: offline, made-up Story. Live Preview & Execute: real Stories, Execute creates real Work Items.">
      <button
        type="button"
        class={`rounded-md px-2.5 py-1 text-xs font-bold !border-0 !shadow-none ${props.mode === "mock" ? "bg-white text-slate-950 dark:bg-slate-950 dark:text-white" : "text-slate-500 hover:text-slate-700 dark:text-slate-400"}`}
        onClick={() => props.onChange("mock")}
      >
        🧪 Mock
      </button>
      <button
        type="button"
        class={`rounded-md px-2.5 py-1 text-xs font-bold !border-0 !shadow-none ${props.mode === "live" ? "bg-white text-slate-950 dark:bg-slate-950 dark:text-white" : "text-slate-500 hover:text-slate-700 dark:text-slate-400"}`}
        onClick={() => props.onChange("live")}
      >
        🚀 Live
      </button>
    </div>
  );
}
