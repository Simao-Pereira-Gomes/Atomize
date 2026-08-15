import type { TaskTemplate } from "@sppg2001/atomize-schema";
import { type Accessor, createSignal, For, Match, Show, Switch } from "solid-js";
import { type CatalogItem, parseCatalogItems } from "../catalog/catalog-item";
import { type AzureDevOpsProfile, listAzureDevOpsProfiles } from "../connections/connection-client";
import { openLocalFile } from "../files/open";
import { type GroundedFieldOptions, loadGroundedFieldOptions } from "../grounding/grounding-service";
import { cancelAIDraft, generateAIDraft, listCatalogItems, listenAIDraftProgress, SidecarRequestError } from "../sidecar/sidecar-client";
import { parseAIDraftResponse } from "../starting-paths/ai-draft";
import { createAIDraftLifecycle } from "../starting-paths/ai-draft-lifecycle";

type CatalogTemplateItem = Extract<CatalogItem, { kind: "template" }>;

type CatalogState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; items: CatalogTemplateItem[] }
  | { kind: "empty" }
  | { kind: "error"; message: string };
type AIState = "idle" | "form" | "grounding-error" | "generating" | "cancelling" | "auth-error" | "error";

export function StartingPathPicker(props: {
  onScratch: () => void;
  onCatalogClone: (item: CatalogTemplateItem) => void;
  onAIDraft: (template: ReturnType<typeof parseAIDraftResponse>, workProject: string, grounding?: GroundedFieldOptions) => void;
  onOpen: (template: TaskTemplate, path: string) => void;
  catalogAvailable?: Accessor<boolean>;
}) {
  const [catalog, setCatalog] = createSignal<CatalogState>({ kind: "idle" });
  const [aiState, setAiState] = createSignal<AIState>("idle");
  const [opening, setOpening] = createSignal(false);
  const [openError, setOpenError] = createSignal("");
  const [prose, setProse] = createSignal("");
  const [profiles, setProfiles] = createSignal<AzureDevOpsProfile[]>([]);
  const [profile, setProfile] = createSignal("");
  const [aiError, setAiError] = createSignal("");
  const [draftId, setDraftId] = createSignal("");
  const [streamLength, setStreamLength] = createSignal(0);
  // Diminishing-returns curve over streamed character count: honest ("still working,
  // getting close") without ever claiming completion before the sidecar call resolves.
  const progressPercent = () => streamLength() === 0 ? 8 : Math.min(92, Math.round((streamLength() / (streamLength() + 400)) * 100));
  const draftLifecycle = createAIDraftLifecycle();

  const openCatalog = async () => {
    if (props.catalogAvailable?.() === false) return;
    setCatalog({ kind: "loading" });
    try {
      const items = parseCatalogItems(await listCatalogItems()).filter((item): item is CatalogTemplateItem => item.kind === "template");
      setCatalog(items.length === 0 ? { kind: "empty" } : { kind: "ready", items });
    } catch (error) {
      setCatalog({
        kind: "error",
        message: error instanceof Error ? error.message : "Unable to load the Catalog.",
      });
    }
  };
  const openFile = async () => {
    if (opening()) return;
    setOpenError("");
    setOpening(true);
    try {
      const result = await openLocalFile();
      if (result.kind === "cancelled") return;
      if (result.kind === "wrong-format") { setOpenError(result.message); return; }
      props.onOpen(result.template, result.path);
    } catch (error) {
      setOpenError(error instanceof Error ? error.message : "We could not open that file.");
    } finally {
      setOpening(false);
    }
  };
  const openAI = async () => {
    if (props.catalogAvailable?.() === false) return;
    setProfiles(await listAzureDevOpsProfiles().catch(() => []));
    setAiState("form"); setAiError("");
  };
  const generate = async (withoutProject = false) => {
    if (!prose().trim()) { setAiError("Describe the Template you want to draft."); return; }
    const id = draftLifecycle.begin(); setDraftId(id); setAiState("generating"); setAiError(""); setStreamLength(0);
    const unlisten = await listenAIDraftProgress((progress) => { if (progress.draftId === id) setStreamLength(progress.length); });
    try {
      const grounding = !withoutProject && profile() ? await loadGroundedFieldOptions(profile()) : undefined;
      if (!draftLifecycle.isActive(id)) return;
      const result = await generateAIDraft(id, prose(), grounding);
      if (!draftLifecycle.isActive(id)) return;
      props.onAIDraft(parseAIDraftResponse(result), withoutProject ? "" : profile(), grounding);
    } catch (error) {
      if (!draftLifecycle.isActive(id)) return;
      const code = error instanceof SidecarRequestError ? error.code : "";
      if (code.startsWith("GROUNDING_") || error instanceof Error && error.name === "ProjectConnectionError") setAiState("grounding-error");
      else if (code === "COPILOT_AUTH_REQUIRED") setAiState("auth-error");
      else if (code === "AI_DRAFT_CANCELLED") setAiState("form");
      else { setAiState("error"); setAiError(error instanceof Error ? error.message : "We could not create a draft."); }
    } finally {
      unlisten();
    }
  };
  const cancel = async () => {
    const id = draftId();
    draftLifecycle.cancel(id);
    setDraftId("");
    setAiState("cancelling");
    try {
      if (id) await cancelAIDraft(id);
      setAiState("form");
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "We could not cancel that AI draft.");
      setAiState("error");
    }
  };

  return (
    <div class="px-5 py-10 sm:px-8">
      <section class="mx-auto max-w-4xl">
        <Show when={aiState() === "idle" && catalog().kind === "idle"} fallback={<button class="mt-5 text-sm font-semibold text-indigo-600 hover:underline disabled:opacity-50 dark:text-indigo-400" type="button" disabled={aiState() === "generating" || aiState() === "cancelling"} onClick={() => { setAiState("idle"); setCatalog({ kind: "idle" }); }}>← Back to starting paths</button>}>
          <h1 class="mt-2 text-4xl font-bold tracking-tight text-slate-950 dark:text-white">Choose a starting path</h1>
          <p class="mt-3 max-w-2xl text-slate-600 dark:text-slate-300">
            Start fresh, use an existing template as a starting point, or let AI help you create a first draft.
          </p>
        </Show>

        <Switch>
          <Match when={aiState() !== "idle"}>
            <div class="mt-8 grid max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 md:grid-cols-[minmax(0,1.3fr)_minmax(19rem,.7fr)]">
              <div class="min-w-0 p-6">
                <h2 class="text-3xl font-bold tracking-tight">AI draft</h2>
                <p class="mt-2 max-w-xl text-sm leading-6 text-slate-600 dark:text-slate-300">Describe the work and task breakdown you want. Copilot creates a reviewable first Template draft.</p>
                <label class="mt-6 block text-sm font-semibold">Template brief<textarea class="mt-2 min-h-64 w-full rounded-lg border border-slate-300 bg-white p-4 font-normal leading-6 dark:border-slate-700 dark:bg-slate-950" value={prose()} disabled={aiState() === "generating" || aiState() === "cancelling"} onInput={(event) => setProse(event.currentTarget.value)} placeholder="For example: a backend API feature with design, implementation, tests, documentation, and review." /></label>
                <p class="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">Your description is used only for this draft and remains private to this session.</p>
                <Show when={aiError()}><p class="mt-3 text-sm text-rose-600">{aiError()}</p></Show>
                <Show when={aiState() === "form" || aiState() === "error"}><button class="mt-5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700" type="button" onClick={() => void generate()}>Create draft</button></Show>
              </div>
              <aside class="min-w-0 border-t border-slate-200 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-950 md:border-t-0 md:border-l">
                <p class="text-sm font-bold">Draft context</p>
                <label class="mt-4 block min-w-0 text-sm font-semibold">Work Project <span class="font-normal text-slate-500 dark:text-slate-400">(optional)</span><select class="mt-2 block w-full min-w-0 max-w-full truncate rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal dark:border-slate-700 dark:bg-slate-950" value={profile()} disabled={aiState() === "generating" || aiState() === "cancelling"} onChange={(event) => setProfile(event.currentTarget.value)}><option value="">No Work Project</option><For each={profiles()}>{(item) => <option value={item.name}>{item.project}</option>}</For></select></label>
                <p class="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">A selected Work Project contributes curated field options, never its credentials.</p>
                <Switch>
                  <Match when={aiState() === "grounding-error"}><section class="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-50"><p class="font-bold">Couldn’t load Work Project context</p><p class="mt-1 text-sm leading-6">Your description is unchanged. Retry the connection, or explicitly continue without project context.</p><div class="mt-4 flex flex-wrap gap-2"><button class="rounded-lg bg-amber-800 px-3 py-2 text-sm font-semibold text-white" type="button" onClick={() => void generate()}>Retry connection</button><button class="rounded-lg border border-amber-300 px-3 py-2 text-sm font-semibold dark:border-amber-700" type="button" onClick={() => void generate(true)}>Draft without project context</button></div></section></Match>
                  <Match when={aiState() === "auth-error"}><section class="mt-6 rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/50"><p class="font-bold text-indigo-950 dark:text-indigo-50">Sign in to GitHub Copilot</p><p class="mt-1 text-sm leading-6 text-indigo-900 dark:text-indigo-100">Complete Copilot sign-in on this computer, then retry your preserved draft. Atomize does not store a Copilot token.</p><button class="mt-4 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white" type="button" onClick={() => void generate()}>Retry after sign-in</button></section></Match>
                  <Match when={aiState() === "generating" || aiState() === "cancelling"}><section class="mt-6 rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/50"><p class="font-bold text-indigo-950 dark:text-indigo-50">{aiState() === "cancelling" ? "Cancelling draft…" : "Creating your AI draft…"}</p><p class="mt-1 text-sm leading-6 text-indigo-900 dark:text-indigo-100">{aiState() === "cancelling" ? "Waiting for Copilot to acknowledge cancellation." : "Copilot is preparing a Template. Output will open in the authoring surface for review."}</p><div class="mt-4 h-1.5 overflow-hidden rounded-full bg-indigo-200 dark:bg-indigo-950"><div class="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${progressPercent()}%` }} /></div><Show when={aiState() === "generating"}><button class="mt-4 rounded-lg border border-indigo-300 px-3 py-2 text-sm font-semibold text-indigo-800 dark:border-indigo-700 dark:text-indigo-100" type="button" onClick={() => void cancel()}>Cancel draft</button></Show></section></Match>
                </Switch>
              </aside>
            </div>
          </Match>
          <Match when={catalog().kind === "idle"}>
            <div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <button class="rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-indigo-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900" type="button" onClick={props.onScratch}>
                <p class="text-lg font-bold">Start from scratch</p>
                <p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Begin with empty fields and standard settings.</p>
              </button>
              <button class="rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-indigo-400 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900" type="button" disabled={props.catalogAvailable?.() === false} title={props.catalogAvailable?.() === false ? "Catalog Clone is unavailable while the companion process recovers." : undefined} onClick={openCatalog}>
                <p class="text-lg font-bold">Clone from Catalog</p>
                <p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Use an existing Template as a fully editable starting point.</p>
              </button>
              <button class="rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-indigo-400 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900" type="button" disabled={opening()} onClick={() => void openFile()}>
                <p class="text-lg font-bold">{opening() ? "Opening…" : "Open"}</p>
                <p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Load a local Atomize YAML File — save your edits back to it, or export a separate copy.</p>
              </button>
              <button class="rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-indigo-400 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900" type="button" disabled={props.catalogAvailable?.() === false} title={props.catalogAvailable?.() === false ? "AI draft is unavailable while the companion process recovers." : undefined} onClick={() => void openAI()}><p class="text-lg font-bold">AI draft</p><p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Generate a first Template draft from a prose description.</p></button>
            </div>
            <Show when={openError()}>
              <p class="ui-error mt-4">{openError()}</p>
            </Show>
          </Match>
          <Match when={catalog().kind !== "idle"}>
            <div class="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
    </div>
  );
}
