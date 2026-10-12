import type { TaskTemplate } from "@sppg2001/atomize-schema";
import { type Accessor, createSignal, For, type JSX, Match, Show, Switch } from "solid-js";
import { type AzureDevOpsProfile, listAzureDevOpsProfiles } from "../connections/connection-client";
import { openLocalFile } from "../files/open";
import { type GroundedFieldOptions, loadGroundedFieldOptions } from "../grounding/grounding-service";
import { documentLabel, documentsSummary, draftBriefPlaceholder, shortenedDocuments, storiesSummary } from "../grounding/grounding-summary";
import type { DocumentGrounding } from "../references/reference-documents";
import { cancelAIDraft, checkCopilotAuthStatus, generateAIDraft, listenAIDraftProgress, loadStoryGrounding, SidecarRequestError } from "../sidecar/sidecar-client";
import { parseAIDraftResponse } from "../starting-paths/ai-draft";
import { createAIDraftLifecycle } from "../starting-paths/ai-draft-lifecycle";
import type { StoryRow } from "../stories/story-browser-model";
import { ReferenceDocumentsPicker } from "./ReferenceDocumentsPicker";
import { ShorteningChoice } from "./ShorteningChoice";
import { StoryBrowser } from "./StoryBrowser";

type AIState = "idle" | "form" | "grounding-error" | "generating" | "cancelling" | "auth-error" | "error";

// Grounding first, so the brief can refer to the Stories and documents just chosen.
const DRAFT_STEPS = ["Work Project & Stories", "Reference Documents", "Brief", "Review & create"] as const;
const PROJECT_STEP = 0;
const DOCUMENTS_STEP = 1;
const BRIEF_STEP = 2;
const REVIEW_STEP = 3;

export function StartingPathPicker(props: {
  onScratch: () => void;
  onBrowseCatalog: () => void;
  onAIDraft: (template: ReturnType<typeof parseAIDraftResponse>, workProject: string, grounding?: GroundedFieldOptions) => void;
  onOpen: (template: TaskTemplate, path: string) => void;
  catalogAvailable?: Accessor<boolean>;
  /** A draft can be parked here (via Back) with no other way back to it — see ADR-0051 addendum. */
  hasActiveDraft?: Accessor<boolean>;
  activeDraftName?: Accessor<string>;
  onResumeDraft?: () => void;
}) {
  const [aiState, setAiState] = createSignal<AIState>("idle");
  const [opening, setOpening] = createSignal(false);
  const [openError, setOpenError] = createSignal("");
  const [prose, setProse] = createSignal("");
  const [profiles, setProfiles] = createSignal<AzureDevOpsProfile[]>([]);
  const [profile, setProfile] = createSignal("");
  const [aiError, setAiError] = createSignal("");
  const [draftId, setDraftId] = createSignal("");
  const [streamLength, setStreamLength] = createSignal(0);
  // Brief → Work Project & Stories → Reference Documents → Review & create; only the last step sends.
  const [step, setStep] = createSignal(0);
  const [confirmingShortened, setConfirmingShortened] = createSignal(false);
  // Optional example Stories (ADR-0069): only when a Work Project is chosen, never picked for the user.
  const [examples, setExamples] = createSignal<StoryRow[]>([]);
  const [includeSensitive, setIncludeSensitive] = createSignal(false);
  const [projectChoices, setProjectChoices] = createSignal<{ profile: string; options: GroundedFieldOptions } | undefined>();
  const [groundingMessage, setGroundingMessage] = createSignal("");
  const [documents, setDocuments] = createSignal<DocumentGrounding | null>(null);
  const [documentsLoading, setDocumentsLoading] = createSignal(false);
  const choicesFor = async (name: string) => {
    const cached = projectChoices();
    if (cached?.profile === name) return cached.options;
    const options = await loadGroundedFieldOptions(name);
    setProjectChoices({ profile: name, options });
    return options;
  };
  const chooseProfile = (name: string) => {
    setProfile(name);
    setExamples([]);
    setIncludeSensitive(false);
    // Loads the Story Browser's filter choices; a failure surfaces when the draft is created.
    if (name) void choicesFor(name).catch(() => {});
  };
  const busy = () => aiState() === "generating" || aiState() === "cancelling";
  const shortened = () => shortenedDocuments(documents());
  const stepSummary = (index: number) => {
    if (index === BRIEF_STEP) return prose().trim() ? "Written" : "Not written yet";
    if (index === PROJECT_STEP) return profile() ? `${profile()} · ${examples().length === 0 ? "No Stories" : examples().length === 1 ? "1 Story" : `${examples().length} Stories`}` : "No Work Project";
    if (index === DOCUMENTS_STEP) return documentsSummary(documents(), documentsLoading());
    return "";
  };
  // Shortened Reference Documents need an explicit Continue / Leave some out before sending.
  const requestCreate = () => {
    if (!prose().trim()) { setAiError("Describe the Template you want to draft."); return; }
    if (shortened().length > 0 && !confirmingShortened()) { setConfirmingShortened(true); return; }
    setConfirmingShortened(false);
    void generate();
  };
  // Diminishing-returns curve over streamed character count: honest ("still working,
  // getting close") without ever claiming completion before the sidecar call resolves.
  const progressPercent = () => streamLength() === 0 ? 8 : Math.min(92, Math.round((streamLength() / (streamLength() + 400)) * 100));
  const draftLifecycle = createAIDraftLifecycle();

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
  const openAI = () => {
    if (props.catalogAvailable?.() === false) return;
    setAiError("");
    // Opens the form immediately: checkCopilotAuthStatus spawns a fresh Copilot CLI process
    // to answer, which measured 0.9-5.5s on Windows — awaiting it here before showing anything
    // read as AI draft hanging, with no feedback. It still nudges toward sign-in, but from the
    // background so a slow or unreachable check never blocks getting to the form; a stale result
    // (e.g. the user already left this state) is ignored via the aiState() re-check.
    setAiState("form");
    void listAzureDevOpsProfiles().then(setProfiles).catch(() => setProfiles([]));
    void checkCopilotAuthStatus().then((status) => {
      if (!status.authenticated && aiState() === "form") setAiState("auth-error");
    }).catch(() => {});
  };
  const generate = async (withoutProject = false) => {
    if (!prose().trim()) { setAiError("Describe the Template you want to draft."); return; }
    const id = draftLifecycle.begin(); setDraftId(id); setAiState("generating"); setAiError(""); setStreamLength(0);
    const unlisten = await listenAIDraftProgress((progress) => { if (progress.draftId === id) setStreamLength(progress.length); });
    try {
      const grounding = !withoutProject && profile() ? await choicesFor(profile()) : undefined;
      if (!draftLifecycle.isActive(id)) return;
      const storyGrounding = grounding && examples().length > 0
        ? await loadStoryGrounding(profile(), examples().map((story) => story.id), includeSensitive())
        : undefined;
      if (!draftLifecycle.isActive(id)) return;
      const result = await generateAIDraft(id, prose(), grounding, storyGrounding, documents() ?? undefined);
      if (!draftLifecycle.isActive(id)) return;
      props.onAIDraft(parseAIDraftResponse(result), withoutProject ? "" : profile(), grounding);
    } catch (error) {
      if (!draftLifecycle.isActive(id)) return;
      const code = error instanceof SidecarRequestError ? error.code : "";
      if (code.startsWith("GROUNDING_") || error instanceof Error && error.name === "ProjectConnectionError") {
        setGroundingMessage(error instanceof Error ? error.message : "");
        setAiState("grounding-error");
      }
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
        <Show when={aiState() === "idle"} fallback={<button class="mt-5 text-sm font-semibold text-indigo-600 hover:underline disabled:opacity-50 dark:text-indigo-400" type="button" disabled={aiState() === "generating" || aiState() === "cancelling"} onClick={() => setAiState("idle")}>← Back to starting paths</button>}>
          <h1 class="mt-2 text-4xl font-bold tracking-tight text-slate-950 dark:text-white">Choose a starting path</h1>
          <p class="mt-3 max-w-2xl text-slate-600 dark:text-slate-300">
            Start fresh, use an existing template as a starting point, or let AI help you create a first draft.
          </p>
          <Show when={props.hasActiveDraft?.()}>
            <div class="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-5 dark:border-indigo-900 dark:bg-indigo-950/40">
              <div class="min-w-0">
                <p class="font-bold text-indigo-950 dark:text-indigo-50">Continue your in-progress Template</p>
                <p class="mt-1 truncate text-sm leading-6 text-indigo-900 dark:text-indigo-100">
                  {props.activeDraftName?.().trim() || "Untitled Template"} is still open — pick up where you left off, or start something new below.
                </p>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700"
                onClick={props.onResumeDraft}
              >
                Continue editing
              </button>
            </div>
          </Show>
        </Show>

        <Switch>
          <Match when={aiState() !== "idle"}>
            <div class="mt-8 max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div class="border-b border-slate-200 px-6 pt-6 dark:border-slate-800">
                <h2 class="text-3xl font-bold tracking-tight">AI draft</h2>
                <ol class="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  <For each={DRAFT_STEPS}>{(label, index) => (
                    <li>
                      <button
                        type="button"
                        class={`flex items-start gap-2 !rounded-none !border-0 !border-b-2 !border-solid !bg-transparent pb-3 text-left !shadow-none disabled:opacity-60 ${step() === index() ? "!border-indigo-600 text-indigo-700 dark:text-indigo-300" : "!border-transparent text-slate-500 dark:text-slate-400"}`}
                        disabled={busy()}
                        aria-current={step() === index() ? "step" : undefined}
                        onClick={() => setStep(index())}
                      >
                        <span class={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${step() === index() ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{index() + 1}</span>
                        <span class="min-w-0">
                          <span class={`block ${step() === index() ? "font-bold" : "font-semibold"}`}>{label}</span>
                          <Show when={stepSummary(index())}><span class="block max-w-48 truncate text-xs font-normal text-slate-500 dark:text-slate-400">{stepSummary(index())}</span></Show>
                        </span>
                      </button>
                    </li>
                  )}</For>
                </ol>
              </div>

              <div class="min-h-80 p-6">
                {/* Every step stays mounted so the Story Browser and Reference Documents keep their state. */}
                <div classList={{ hidden: step() !== PROJECT_STEP }}>
                  <label class="block max-w-md min-w-0 text-sm font-semibold">Work Project <span class="font-normal text-slate-500 dark:text-slate-400">(optional)</span><select class="mt-2 block w-full min-w-0 max-w-full truncate rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal dark:border-slate-700 dark:bg-slate-950" value={profile()} disabled={busy()} onChange={(event) => chooseProfile(event.currentTarget.value)}><option value="">No Work Project</option><For each={profiles()}>{(item) => <option value={item.name}>{item.name}</option>}</For></select></label>
                  <p class="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">A selected Work Project contributes curated field options.</p>
                  <Show when={profile()} fallback={<p class="mt-6 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">Choose a Work Project to add example Stories.</p>}>
                    <section class="mt-6">
                      <p class="text-sm font-semibold">Example Stories <span class="font-normal text-slate-500 dark:text-slate-400">(optional)</span></p>
                      <p class="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Stories your team broke down well. Copilot follows their Task naming, estimate splits, and review steps.</p>
                      <div class="mt-2">
                        <StoryBrowser
                          profile={profile}
                          choices={() => projectChoices()?.profile === profile() ? projectChoices()?.options : undefined}
                          selected={examples}
                          onChange={setExamples}
                          hasTasksByDefault
                          disabled={busy}
                        />
                      </div>
                      <Show when={examples().length > 0}>
                        <label class="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-700 dark:text-slate-200">
                          <input type="checkbox" class="mt-0.5" checked={includeSensitive()} disabled={busy()} onChange={(event) => setIncludeSensitive(event.currentTarget.checked)} />
                          Also send their descriptions and acceptance criteria. They can contain customer, personal, or internal details. Applies to this draft only.
                        </label>
                      </Show>
                    </section>
                  </Show>
                </div>

                <div classList={{ hidden: step() !== DOCUMENTS_STEP }}>
                  <ReferenceDocumentsPicker
                    profile={profile}
                    onChange={(grounding, loading) => { setDocuments(grounding); setDocumentsLoading(loading); setConfirmingShortened(false); }}
                    disabled={busy}
                  />
                </div>

                <div classList={{ hidden: step() !== BRIEF_STEP }}>
                  <p class="max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">Describe the work and task breakdown you want. Copilot creates a reviewable first Template draft.</p>
                  <Show when={examples().length > 0 || (documents()?.documents.length ?? 0) > 0}>
                    <div class="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                      <p class="font-semibold text-slate-700 dark:text-slate-200">Refer to what you chose by Story ID or document name</p>
                      <div class="mt-2 flex flex-wrap gap-1.5">
                        <For each={examples()}>{(story) => <span class="rounded-full border border-slate-200 bg-white px-2 py-0.5 dark:border-slate-700 dark:bg-slate-900">{story.id} · {story.title}</span>}</For>
                        <For each={documents()?.documents}>{(document) => <span class="rounded-full border border-slate-200 bg-white px-2 py-0.5 dark:border-slate-700 dark:bg-slate-900">{document.title}</span>}</For>
                      </div>
                    </div>
                  </Show>
                  <label class="mt-4 block text-sm font-semibold">Template brief<textarea class="mt-2 min-h-72 w-full rounded-lg border border-slate-300 bg-white p-4 font-normal leading-6 dark:border-slate-700 dark:bg-slate-950" value={prose()} disabled={busy()} onInput={(event) => setProse(event.currentTarget.value)} placeholder={draftBriefPlaceholder(examples(), documents())} /></label>
                  <p class="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">Your description is used only for this draft and remains private to this session.</p>
                </div>

                <Show when={step() === REVIEW_STEP}>
                  <p class="text-sm text-slate-600 dark:text-slate-300">This is everything Copilot will receive.</p>
                  <dl class="mt-3 divide-y divide-slate-200 dark:divide-slate-800">
                    <ReviewRow label="Work Project" onEdit={() => setStep(PROJECT_STEP)} disabled={busy()}>
                      {profile() || <span class="text-slate-500 dark:text-slate-400">None. No project field options.</span>}
                    </ReviewRow>
                    <ReviewRow label="Example Stories" onEdit={() => setStep(PROJECT_STEP)} disabled={busy()}>
                      <Show when={examples().length > 0} fallback={<span class="text-slate-500 dark:text-slate-400">{storiesSummary(examples(), includeSensitive())}</span>}>
                        <ul class="space-y-0.5"><For each={examples()}>{(story) => <li class="truncate">{story.id} · {story.title}</li>}</For></ul>
                        <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{includeSensitive() ? "Titles, Tasks, descriptions and acceptance criteria" : "Titles and Tasks only"}</p>
                      </Show>
                    </ReviewRow>
                    <ReviewRow label="Reference Documents" onEdit={() => setStep(DOCUMENTS_STEP)} disabled={busy()}>
                      <Show when={(documents()?.documents.length ?? 0) > 0 && !documentsLoading()} fallback={<span class="text-slate-500 dark:text-slate-400">{documentsSummary(documents(), documentsLoading())}</span>}>
                        <ul class="space-y-0.5">
                          <For each={documents()?.documents}>{(document) => <li class="truncate">{documentLabel(document.ref)}<Show when={document.truncated}> <span class="rounded bg-amber-100 px-1.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">shortened</span></Show></li>}</For>
                        </ul>
                      </Show>
                    </ReviewRow>
                    <ReviewRow label="Brief" onEdit={() => setStep(BRIEF_STEP)} disabled={busy()}>
                      <Show when={prose().trim()} fallback={<span class="text-rose-600">Missing. Describe the Template first.</span>}><p class="line-clamp-3 whitespace-pre-wrap">{prose().trim()}</p></Show>
                    </ReviewRow>
                  </dl>
                </Show>

                <Show when={confirmingShortened()}>
                  <div class="mt-5"><ShorteningChoice shortened={shortened()} onContinue={requestCreate} onLeaveOut={() => { setConfirmingShortened(false); setStep(DOCUMENTS_STEP); }} onCancel={() => setConfirmingShortened(false)} /></div>
                </Show>
                <Show when={aiError()}><p class="mt-4 text-sm text-rose-600">{aiError()}</p></Show>
                <Switch>
                  <Match when={aiState() === "grounding-error"}><section class="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-50"><p class="font-bold">Couldn’t load Work Project context</p><Show when={groundingMessage()}><p class="mt-1 text-sm leading-6">{groundingMessage()}</p></Show><p class="mt-1 text-sm leading-6">Your description is unchanged. Retry the connection, or explicitly continue without project context.</p><div class="mt-4 flex flex-wrap gap-2"><button class="rounded-lg bg-amber-800 px-3 py-2 text-sm font-semibold text-white" type="button" onClick={() => void generate()}>Retry connection</button><button class="rounded-lg border border-amber-300 px-3 py-2 text-sm font-semibold dark:border-amber-700" type="button" onClick={() => void generate(true)}>Draft without project context</button></div></section></Match>
                  <Match when={aiState() === "auth-error"}><section class="mt-5 rounded-xl border border-indigo-200 bg-indigo-50 p-4 dark:border-indigo-900 dark:bg-indigo-950/50"><p class="font-bold text-indigo-950 dark:text-indigo-50">Sign in to GitHub Copilot</p><p class="mt-1 text-sm leading-6 text-indigo-900 dark:text-indigo-100">Run <code>gh auth login</code> in a terminal on this computer, then retry your preserved draft. Atomize does not store a Copilot token.</p><button class="mt-4 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white" type="button" onClick={() => void generate()}>Retry after sign-in</button></section></Match>
                </Switch>
              </div>

              <footer class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4 dark:border-slate-800 dark:bg-slate-950">
                <Show
                  when={!busy()}
                  fallback={
                    <div class="flex w-full flex-wrap items-center gap-4" role="status">
                      <div class="min-w-0 flex-1">
                        <p class="text-sm font-bold text-indigo-950 dark:text-indigo-50">{aiState() === "cancelling" ? "Cancelling draft…" : "Creating your AI draft…"}</p>
                        <p class="text-xs leading-5 text-slate-600 dark:text-slate-300">{aiState() === "cancelling" ? "Waiting for Copilot to acknowledge cancellation." : "Output will open in the authoring surface for review."}</p>
                        <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-indigo-200 dark:bg-indigo-950"><div class="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${progressPercent()}%` }} /></div>
                      </div>
                      <Show when={aiState() === "generating"}><button class="rounded-lg border border-indigo-300 px-3 py-2 text-sm font-semibold text-indigo-800 dark:border-indigo-700 dark:text-indigo-100" type="button" onClick={() => void cancel()}>Cancel draft</button></Show>
                    </div>
                  }
                >
                  <button class="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold disabled:opacity-50 dark:border-slate-700" type="button" disabled={step() === 0} onClick={() => setStep(step() - 1)}>Back</button>
                  <div class="flex items-center gap-3">
                    <Show when={step() < BRIEF_STEP}><button class="text-sm font-semibold text-slate-600 hover:underline dark:text-slate-300" type="button" onClick={() => setStep(BRIEF_STEP)}>Skip to brief</button></Show>
                    <Show when={step() === REVIEW_STEP} fallback={<button class="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700" type="button" onClick={() => setStep(step() + 1)}>Next →</button>}>
                      <Show when={aiState() === "form" || aiState() === "error"}><button class="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50" type="button" disabled={documentsLoading() || confirmingShortened()} onClick={requestCreate}>{documentsLoading() ? "Checking Reference Documents…" : "Create draft"}</button></Show>
                    </Show>
                  </div>
                </Show>
              </footer>
            </div>
          </Match>
          <Match when={aiState() === "idle"}>
            <div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <button class="rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-indigo-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900" type="button" onClick={props.onScratch}>
                <p class="text-lg font-bold">Start from scratch</p>
                <p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Begin with empty fields and standard settings.</p>
              </button>
              <button class="rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:border-indigo-400 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900" type="button" disabled={props.catalogAvailable?.() === false} title={props.catalogAvailable?.() === false ? "Catalog Clone is unavailable while the companion process recovers." : undefined} onClick={props.onBrowseCatalog}>
                <p class="text-lg font-bold">Clone from Catalog</p>
                <p class="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Browse the Catalog and use an existing Template as a fully editable starting point.</p>
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
        </Switch>
      </section>
    </div>
  );
}

function ReviewRow(props: { label: string; onEdit: () => void; disabled: boolean; children: JSX.Element }) {
  return (
    <div class="grid gap-1 py-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto] sm:gap-4">
      <dt class="text-sm font-semibold text-slate-500 dark:text-slate-400">{props.label}</dt>
      <dd class="min-w-0 text-sm">{props.children}</dd>
      <button type="button" class="justify-self-start text-sm font-semibold text-indigo-600 hover:underline disabled:opacity-50 dark:text-indigo-400" disabled={props.disabled} onClick={props.onEdit}>Edit</button>
    </div>
  );
}
