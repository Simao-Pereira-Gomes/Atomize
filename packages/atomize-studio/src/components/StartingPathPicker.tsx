import { createSignal, For, Match, Show, Switch, type Accessor } from "solid-js";
import { listAzureDevOpsProfiles, type AzureDevOpsProfile } from "../connections/connection-client";
import { loadGroundedFieldOptions } from "../grounding/grounding-service";
import { cancelAIDraft, generateAIDraft, listCatalogTemplates, SidecarRequestError } from "../sidecar/sidecar-client";
import { parseAIDraftResponse } from "../starting-paths/ai-draft";
import { createAIDraftLifecycle } from "../starting-paths/ai-draft-lifecycle";
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
type AIState = "idle" | "form" | "grounding-error" | "generating" | "auth-error" | "error";

export function StartingPathPicker(props: {
  onScratch: () => void;
  onCatalogClone: (item: CatalogTemplateItem) => void;
  onAIDraft: (template: ReturnType<typeof parseAIDraftResponse>) => void;
  catalogAvailable?: Accessor<boolean>;
}) {
  const [catalog, setCatalog] = createSignal<CatalogState>({ kind: "idle" });
  const [aiState, setAiState] = createSignal<AIState>("idle");
  const [prose, setProse] = createSignal("");
  const [profiles, setProfiles] = createSignal<AzureDevOpsProfile[]>([]);
  const [profile, setProfile] = createSignal("");
  const [aiError, setAiError] = createSignal("");
  const [draftId, setDraftId] = createSignal("");
  const draftLifecycle = createAIDraftLifecycle();
  const [theme, setTheme] = createSignal<"light" | "dark">(
    window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );

  const openCatalog = async () => {
    if (props.catalogAvailable?.() === false) return;
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
  const openAI = async () => {
    if (props.catalogAvailable?.() === false) return;
    setProfiles(await listAzureDevOpsProfiles().catch(() => []));
    setAiState("form"); setAiError("");
  };
  const generate = async (withoutProject = false) => {
    if (!prose().trim()) { setAiError("Describe the Template you want to draft."); return; }
    const id = draftLifecycle.begin(); setDraftId(id); setAiState("generating"); setAiError("");
    try {
      const grounding = !withoutProject && profile() ? await loadGroundedFieldOptions(profile()) : undefined;
      if (!draftLifecycle.isActive(id)) return;
      const result = await generateAIDraft(id, prose(), grounding);
      if (!draftLifecycle.isActive(id)) return;
      props.onAIDraft(parseAIDraftResponse(result));
    } catch (error) {
      if (!draftLifecycle.isActive(id)) return;
      const code = error instanceof SidecarRequestError ? error.code : "";
      if (code.startsWith("GROUNDING_") || error instanceof Error && error.name === "ProjectConnectionError") setAiState("grounding-error");
      else if (code === "COPILOT_AUTH_REQUIRED") setAiState("auth-error");
      else if (code === "AI_DRAFT_CANCELLED") setAiState("form");
      else { setAiState("error"); setAiError(error instanceof Error ? error.message : "We could not create a draft."); }
    }
  };
  const cancel = async () => {
    const id = draftId();
    draftLifecycle.cancel(id);
    setDraftId("");
    try {
      if (id) await cancelAIDraft(id);
      setAiState("form");
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "We could not cancel that AI draft.");
      setAiState("error");
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
          <Match when={aiState() !== "idle"}>
            <div class="mt-8 max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <button class="text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400" type="button" disabled={aiState() === "generating"} onClick={() => setAiState("idle")}>← Back to starting paths</button>
              <Switch>
                <Match when={aiState() === "generating"}><h2 class="mt-6 text-xl font-bold">Creating your AI draft…</h2><p class="mt-2 text-sm text-slate-600 dark:text-slate-300">Copilot is preparing a Template. Your description remains private to this session.</p><button class="mt-5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700" type="button" onClick={() => void cancel()}>Cancel draft</button></Match>
                <Match when={aiState() === "grounding-error"}><h2 class="mt-6 text-xl font-bold">Could not load work-project context</h2><p class="mt-2 text-sm text-slate-600 dark:text-slate-300">Your description is unchanged. Retry the project connection, or explicitly continue without project context.</p><div class="mt-5 flex gap-3"><button class="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white" type="button" onClick={() => void generate()}>Retry</button><button class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700" type="button" onClick={() => void generate(true)}>Draft without project context</button></div></Match>
                <Match when={aiState() === "auth-error"}><h2 class="mt-6 text-xl font-bold">Sign in to GitHub Copilot</h2><p class="mt-2 text-sm text-slate-600 dark:text-slate-300">Complete Copilot sign-in on this computer, then retry your preserved draft.</p><button class="mt-5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white" type="button" onClick={() => void generate()}>Retry after sign-in</button></Match>
                <Match when={aiState() === "form" || aiState() === "error"}><h2 class="mt-6 text-xl font-bold">Draft a Template with AI</h2><p class="mt-2 text-sm text-slate-600 dark:text-slate-300">Describe the work and task breakdown you want. This prose is used only for this draft.</p><label class="mt-5 block text-sm font-semibold">Description<textarea class="mt-2 min-h-36 w-full rounded-lg border border-slate-300 p-3 dark:border-slate-700 dark:bg-slate-950" value={prose()} onInput={(event) => setProse(event.currentTarget.value)} placeholder="For example: a backend API feature with design, implementation, tests, and review." /></label><label class="mt-4 block text-sm font-semibold">Work project (optional)<select class="mt-2 w-full rounded-lg border border-slate-300 p-3 dark:border-slate-700 dark:bg-slate-950" value={profile()} onChange={(event) => setProfile(event.currentTarget.value)}><option value="">Use without a project</option><For each={profiles()}>{(item) => <option value={item.name}>{item.project} · {item.team}</option>}</For></select></label><Show when={aiError()}><p class="mt-3 text-sm text-rose-600">{aiError()}</p></Show><button class="mt-5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white" type="button" onClick={() => void generate()}>Generate draft</button></Match>
              </Switch>
            </div>
          </Match>
          <Match when={catalog().kind === "idle"}>
            <div class="mt-8 grid gap-4 md:grid-cols-3">
              <button class="rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-indigo-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900" type="button" onClick={props.onScratch}>
                <p class="text-lg font-bold">Start from scratch</p>
                <p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Begin with empty fields and standard settings.</p>
              </button>
              <button class="rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-indigo-400 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900" type="button" disabled={props.catalogAvailable?.() === false} title={props.catalogAvailable?.() === false ? "Catalog Clone is unavailable while the companion process recovers." : undefined} onClick={openCatalog}>
                <p class="text-lg font-bold">Clone from Catalog</p>
                <p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Use an existing Template as a fully editable starting point.</p>
              </button>
              <button class="rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-indigo-400 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900" type="button" disabled={props.catalogAvailable?.() === false} title={props.catalogAvailable?.() === false ? "AI draft is unavailable while the companion process recovers." : undefined} onClick={() => void openAI()}><p class="text-lg font-bold">AI draft</p><p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Generate a first Template draft from a prose description.</p></button>
            </div>
          </Match>
          <Match when={catalog().kind !== "idle"}>
            <div class="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <button class="text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400" type="button" onClick={() => setCatalog({ kind: "idle" })}>← Back to starting paths</button>
              <Switch>
                <Match when={catalog().kind === "loading"}><p class="mt-6 text-slate-600 dark:text-slate-300">Loading Catalog Templates…</p></Match>
                <Match when={catalog().kind === "empty"}><div class="mt-6"><h2 class="text-xl font-bold">No Templates available</h2><p class="mt-2 text-slate-600 dark:text-slate-300">Install or create a Template, then try again.</p><button class="mt-4 text-sm font-semibold text-indigo-600 hover:underline disabled:opacity-50 dark:text-indigo-400" type="button" disabled={props.catalogAvailable?.() === false} onClick={openCatalog}>Retry</button></div></Match>
                <Match when={catalog().kind === "error"}><div class="mt-6"><h2 class="text-xl font-bold">Could not load the Catalog</h2><p class="mt-2 text-slate-600 dark:text-slate-300">{(catalog() as Extract<CatalogState, { kind: "error" }>).message}</p><button class="mt-4 text-sm font-semibold text-indigo-600 hover:underline disabled:opacity-50 dark:text-indigo-400" type="button" disabled={props.catalogAvailable?.() === false} onClick={openCatalog}>Retry</button></div></Match>
                <Match when={catalog().kind === "ready"}><div class="mt-6"><h2 class="text-xl font-bold">Choose a Template</h2><div class="mt-4 space-y-3"><For each={(catalog() as Extract<CatalogState, { kind: "ready" }>).items}>{(item) => <button class="w-full rounded-xl border border-slate-200 p-4 text-left hover:border-indigo-400 dark:border-slate-700" type="button" onClick={() => props.onCatalogClone(item)}><p class="font-semibold">{item.displayName}</p><p class="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.description}</p><p class="mt-2 text-xs text-slate-500 dark:text-slate-400">{item.ref} · {item.scope}</p></button>}</For></div></div></Match>
              </Switch>
            </div>
          </Match>
        </Switch>
      </section>
    </main>
  );
}
