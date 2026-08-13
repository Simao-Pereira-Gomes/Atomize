import { createSignal, For, Match, Switch } from "solid-js";
import { listCatalogTemplates } from "../cli/cli-bridge";
import {
  type CatalogTemplateItem,
  parseCatalogTemplates,
} from "../starting-paths/catalog-clone";

type CatalogState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; items: CatalogTemplateItem[] }
  | { kind: "empty" }
  | { kind: "error"; message: string };

export function StartingPathPicker(props: {
  onScratch: () => void;
  onCatalogClone: (item: CatalogTemplateItem) => void;
}) {
  const [catalog, setCatalog] = createSignal<CatalogState>({ kind: "idle" });
  const [theme, setTheme] = createSignal<"light" | "dark">(
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );

  const openCatalog = async () => {
    setCatalog({ kind: "loading" });
    try {
      const items = parseCatalogTemplates(await listCatalogTemplates());
      setCatalog(items.length === 0 ? { kind: "empty" } : { kind: "ready", items });
    } catch (error) {
      setCatalog({
        kind: "error",
        message: error instanceof Error ? error.message : "Unable to load the Catalog.",
      });
    }
  };

  return (
    <main class={`min-h-screen bg-slate-100 px-5 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:px-8 ${theme() === "dark" ? "dark" : ""}`} data-theme={theme()}>
      <section class="mx-auto max-w-4xl">
        <div class="flex items-center justify-between gap-4">
          <p class="text-sm font-semibold text-indigo-600 dark:text-indigo-400">Atomize Studio</p>
          <button
            class="grid size-9 place-items-center rounded-lg !border-0 !bg-slate-200 text-slate-700 !shadow-none hover:!bg-slate-300 dark:!bg-slate-800 dark:text-slate-200 dark:hover:!bg-slate-700"
            type="button"
            onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
            title="Toggle light/dark mode"
            aria-label="Toggle light/dark mode"
          >
            {theme() === "dark" ? "☀" : "☾"}
          </button>
        </div>
        <h1 class="mt-2 text-4xl font-bold tracking-tight text-slate-950 dark:text-white">Choose a starting path</h1>
        <p class="mt-3 max-w-2xl text-slate-600 dark:text-slate-300">
          Start fresh, use an existing template as a starting point, or let AI help you create a first draft.
        </p>

        <Switch>
          <Match when={catalog().kind === "idle"}>
            <div class="mt-8 grid gap-4 md:grid-cols-3">
              <button class="rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-indigo-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900" type="button" onClick={props.onScratch}>
                <p class="text-lg font-bold">Start from scratch</p>
                <p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Begin with empty fields and standard settings.</p>
              </button>
              <button class="rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-indigo-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900" type="button" onClick={openCatalog}>
                <p class="text-lg font-bold">Clone from Catalog</p>
                <p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Use an existing Template as a fully editable starting point.</p>
              </button>
              <div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-900/50">
                <p class="text-lg font-bold text-slate-500 dark:text-slate-400">AI draft</p>
                <p class="mt-2 text-sm leading-6 text-slate-500 dark:text-slate-400">Coming soon — generate a draft from a prose description.</p>
              </div>
            </div>
          </Match>
          <Match when={catalog().kind !== "idle"}>
            <div class="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <button class="text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400" type="button" onClick={() => setCatalog({ kind: "idle" })}>← Back to starting paths</button>
              <Switch>
                <Match when={catalog().kind === "loading"}><p class="mt-6 text-slate-600 dark:text-slate-300">Loading Catalog Templates…</p></Match>
                <Match when={catalog().kind === "empty"}><div class="mt-6"><h2 class="text-xl font-bold">No Templates available</h2><p class="mt-2 text-slate-600 dark:text-slate-300">Install or create a Template, then try again.</p><button class="mt-4 text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400" type="button" onClick={openCatalog}>Retry</button></div></Match>
                <Match when={catalog().kind === "error"}><div class="mt-6"><h2 class="text-xl font-bold">Could not load the Catalog</h2><p class="mt-2 text-slate-600 dark:text-slate-300">{(catalog() as Extract<CatalogState, { kind: "error" }>).message}</p><button class="mt-4 text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400" type="button" onClick={openCatalog}>Retry</button></div></Match>
                <Match when={catalog().kind === "ready"}><div class="mt-6"><h2 class="text-xl font-bold">Choose a Template</h2><div class="mt-4 space-y-3"><For each={(catalog() as Extract<CatalogState, { kind: "ready" }>).items}>{(item) => <button class="w-full rounded-xl border border-slate-200 p-4 text-left hover:border-indigo-400 dark:border-slate-700" type="button" onClick={() => props.onCatalogClone(item)}><p class="font-semibold">{item.displayName}</p><p class="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.description}</p><p class="mt-2 text-xs text-slate-500 dark:text-slate-400">{item.ref} · {item.scope}</p></button>}</For></div></div></Match>
              </Switch>
            </div>
          </Match>
        </Switch>
      </section>
    </main>
  );
}
