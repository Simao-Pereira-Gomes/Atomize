export function GenerateSourcePicker(props: { active: "catalog" | "file"; onSelect: (mode: "catalog" | "file") => void }) {
  return <div class="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
    <p class="border-b border-slate-100 px-5 py-3 text-xs font-bold tracking-widest text-slate-400 uppercase dark:border-slate-800">Where does this Template live?</p>
    <SourceRow icon="📚" kicker="Shared workspace" title="Browse the Catalog" detail="Use a saved Template installed for this user or project." active={props.active === "catalog"} onClick={() => props.onSelect("catalog")} />
    <SourceRow icon="↗" kicker="One-off preview" title="Open a local YAML file" detail="Preview a Template without installing or editing it." active={props.active === "file"} onClick={() => props.onSelect("file")} />
  </div>;
}

function SourceRow(props: { icon: string; kicker: string; title: string; detail: string; active: boolean; onClick: () => void }) {
  return <button class={`flex w-full items-center gap-4 px-5 py-4 text-left transition ${props.active ? "bg-indigo-50 dark:bg-indigo-950/30" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`} type="button" onClick={props.onClick}><span class="grid size-10 place-items-center rounded-xl bg-slate-100 text-lg dark:bg-slate-800">{props.icon}</span><span class="flex-1"><span class="block text-xs font-bold tracking-widest text-slate-400 uppercase">{props.kicker}</span><span class="mt-1 block font-bold text-slate-950 dark:text-white">{props.title}</span><span class="mt-1 block text-sm font-normal text-slate-500 dark:text-slate-400">{props.detail}</span></span><span class="text-indigo-600 dark:text-indigo-300">{props.active ? "✓" : "→"}</span></button>;
}
