import { diffTemplates } from "@sppg2001/atomize-schema";
import { type Accessor, createEffect, createMemo, createSignal, For, Match, Show, Switch } from "solid-js";
import { type GroundedFieldOptions, loadGroundedFieldOptions } from "../grounding/grounding-service";
import { createImproveSession } from "../improve/improve-session";
import type { DocumentGrounding } from "../references/reference-documents";
import { cancelAIDraft, improveTemplateWithAI, listAppliedStories, listenAIDraftProgress, loadStoryGrounding } from "../sidecar/sidecar-client";
import type { SectionStores } from "../stores/sections";
import type { GroundingSession } from "./GroundingSettings";
import { ReferenceDocumentsPicker } from "./ReferenceDocumentsPicker";
import { StoryBrowser } from "./StoryBrowser";
import { TemplateChangesList } from "./sections/TemplateDiffView";

/**
 * "Improve with AI" for the Template in the builder, whichever Starting Path produced it. The
 * proposal is reviewed as a whole and only changes the Template on Accept (ADR-0062).
 */
export function ImproveWithAI(props: { stores: SectionStores; ready: Accessor<boolean>; sidecarAvailable: Accessor<boolean>; grounding: GroundingSession; openFilePath?: string }) {
  const [documents, setDocuments] = createSignal<DocumentGrounding | null>(null);
  const [documentsLoading, setDocumentsLoading] = createSignal(false);
  // Project metadata per Work Project: the one in Global Settings is already loaded; others load on demand.
  const [projectChoices, setProjectChoices] = createSignal<{ profile: string; options: GroundedFieldOptions } | undefined>();
  const choicesFor = async (profile: string): Promise<GroundedFieldOptions> => {
    if (profile === props.grounding.selectedProfile() && props.grounding.options()) return props.grounding.options() as GroundedFieldOptions;
    const cached = projectChoices();
    if (cached?.profile === profile) return cached.options;
    const options = await loadGroundedFieldOptions(profile);
    setProjectChoices({ profile, options });
    return options;
  };
  const session = createImproveSession({
    current: () => props.stores.toTemplate(),
    apply: (template) => props.stores.loadTemplate(template),
    improve: (id, template, guidance, grounding) => improveTemplateWithAI(id, template, guidance, { ...grounding, documents: documents() ?? undefined }),
    cancel: (id) => cancelAIDraft(id),
    listenProgress: (onProgress) => listenAIDraftProgress(onProgress),
    defaultProfile: () => props.grounding.selectedProfile(),
    // A Work Project always brings Project Grounding; chosen Stories add Story Grounding (ADR-0069).
    loadGrounding: async (choices) => ({
      project: await choicesFor(choices.profile),
      ...(choices.stories.length > 0
        ? { stories: await loadStoryGrounding(choices.profile, choices.stories.map((story) => story.id), choices.includeSensitive) }
        : {}),
    }),
  });
  const filterChoices = () => {
    const profile = session.choices().profile;
    if (profile === props.grounding.selectedProfile() && props.grounding.options()) return props.grounding.options();
    return projectChoices()?.profile === profile ? projectChoices()?.options : undefined;
  };
  createEffect(() => {
    const profile = session.choices().profile;
    if (state().phase === "form" && profile) void choicesFor(profile).catch(() => {});
  });
  const state = session.state;
  const review = createMemo(() => {
    const current = state();
    return current.phase === "review" ? { ...current, diff: diffTemplates(current.base, current.proposal) } : undefined;
  });
  const busy = () => state().phase === "running" || state().phase === "cancelling";
  const streamed = () => {
    const current = state();
    return current.phase === "running" ? current.streamed : 0;
  };
  // Diminishing-returns curve, as for AI drafts: honest progress without claiming completion early.
  const progressPercent = () => (streamed() === 0 ? 8 : Math.min(92, Math.round((streamed() / (streamed() + 400)) * 100)));
  const guidance = () => session.choices().guidance;
  const groundingMessage = () => {
    const current = state();
    return current.phase === "grounding-error" ? current.message : undefined;
  };

  return (
    <>
      <section class="rounded-2xl border border-violet-200 bg-violet-50 p-5 text-sm leading-6 text-violet-950 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-100">
        <p class="font-semibold">Improve with AI</p>
        <p class="mt-1 text-violet-800 dark:text-violet-200">Copilot reviews this Template and proposes changes you can accept or reject.</p>
        <button
          type="button"
          class="mt-3 rounded-lg bg-violet-600 px-3 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50"
          disabled={!props.sidecarAvailable()}
          title={props.ready() ? undefined : "Finish the highlighted sections first"}
          onClick={session.open}
        >
          ✨ Improve with AI
        </button>
        <Show when={!props.ready()}>
          <p class="mt-2 text-xs text-violet-700 dark:text-violet-300">Works on a complete Template — finish the highlighted sections first.</p>
        </Show>
      </section>

      <Show when={state().phase !== "closed"}>
        <div class="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-5" role="presentation">
          <section class="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900" role="dialog" aria-modal="true" aria-labelledby="improve-title">
            <header class="border-b border-slate-200 p-6 dark:border-slate-800">
              <h2 id="improve-title" class="text-xl font-bold text-slate-950 dark:text-white">Improve with AI</h2>
              <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">Nothing changes until you accept the proposal.</p>
            </header>

            <div class="min-h-0 flex-1 overflow-y-auto p-6">
              <Switch>
                <Match when={review()}>
                  {(current) => (
                    <div class="space-y-5">
                      <Show when={current().diff.identical}>
                        <p class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">Copilot proposed no changes.</p>
                      </Show>
                      <Show when={!current().diff.identical}>
                        <TemplateChangesList diff={current().diff} />
                      </Show>
                      <Show when={current().notes.length > 0}>
                        <section>
                          <h3 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Notes from Copilot</h3>
                          <ul class="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-200">
                            <For each={current().notes}>{(note) => <li>{note}</li>}</For>
                          </ul>
                        </section>
                      </Show>
                      <Show when={current().problems.length > 0}>
                        <section class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                          <p class="font-semibold">Copilot couldn't fix everything. Accepting loads the proposal so you can fix these yourself:</p>
                          <ul class="mt-2 list-disc space-y-1 pl-5">
                            <For each={current().problems}>{(problem) => <li>{problem}</li>}</For>
                          </ul>
                        </section>
                      </Show>
                    </div>
                  )}
                </Match>

                <Match when={busy()}>
                  <div role="status" class="space-y-3">
                    <p class="text-sm font-semibold text-slate-700 dark:text-slate-200">{state().phase === "cancelling" ? "Cancelling…" : "Copilot is reviewing your Template…"}</p>
                    <div class="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div class="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${progressPercent()}%` }} />
                    </div>
                  </div>
                </Match>

                <Match when={state().phase === "auth-error"}>
                  <p class="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                    GitHub Copilot isn't signed in. Run <code class="font-mono">gh auth login</code> in a terminal, then try again.
                  </p>
                </Match>

                <Match when={state().phase === "form"}>
                  <label class="block text-sm font-semibold">
                    What should the improvement focus on? <span class="font-normal text-slate-500">(optional)</span>
                    <textarea
                      class="mt-2 min-h-32 w-full rounded-lg border border-slate-300 bg-white p-3 font-normal leading-6 dark:border-slate-700 dark:bg-slate-950"
                      value={guidance()}
                      onInput={(event) => session.setGuidance(event.currentTarget.value)}
                      placeholder="For example: tighten the estimates, add security reviews. Leave empty for a general review."
                    />
                  </label>
                  <Show when={(() => { const current = state(); return current.phase === "form" ? current.error : undefined; })()}>
                    {(error) => <p class="mt-3 text-sm text-rose-600">{error()}</p>}
                  </Show>

                  <label class="mt-5 block text-sm font-semibold">
                    Work Project <span class="font-normal text-slate-500">(optional)</span>
                    <select
                      class="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal dark:border-slate-700 dark:bg-slate-950"
                      value={session.choices().profile}
                      onChange={(event) => session.setProfile(event.currentTarget.value)}
                    >
                      <option value="">No grounding — review the Template on its own</option>
                      <For each={props.grounding.profiles()}>{(item) => <option value={item.name}>{item.name}</option>}</For>
                    </select>
                  </label>
                  <p class="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">The project's types, fields, and saved queries keep Copilot to names that really exist. Its credentials are never sent.</p>

                  <Show when={session.choices().profile}>
                    <section class="mt-5">
                      <p class="text-sm font-semibold">Learn from Stories <span class="font-normal text-slate-500">(optional)</span></p>
                      <p class="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Tick Stories this Template was applied to. Copilot compares them with the Tasks they ended up with to see where the Template doesn't fit. Tick none to use project metadata only.</p>
                      <div class="mt-2">
                        <StoryBrowser
                          profile={() => session.choices().profile}
                          choices={filterChoices}
                          selected={() => session.choices().stories}
                          onChange={session.setStories}
                          hasTasksByDefault
                          defaultView={{
                            label: "Stories this Template was applied to",
                            load: () => listAppliedStories(session.choices().profile, props.stores.toTemplate().filter),
                          }}
                        />
                      </div>
                      <Show when={session.choices().stories.length > 0}>
                        <label class="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-700 dark:text-slate-200">
                          <input type="checkbox" class="mt-0.5" checked={session.choices().includeSensitive} onChange={(event) => session.setIncludeSensitive(event.currentTarget.checked)} />
                          Also send their descriptions and acceptance criteria. They can contain customer, personal, or internal details. Applies to this improvement only.
                        </label>
                      </Show>
                    </section>
                  </Show>

                  <div class="mt-5">
                    <ReferenceDocumentsPicker
                      profile={() => session.choices().profile}
                      startPath={() => props.openFilePath}
                      onChange={(grounding, loading) => { setDocuments(grounding); setDocumentsLoading(loading); }}
                    />
                  </div>
                </Match>

                <Match when={groundingMessage()}>
                  {(message) => (
                    <section class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-50">
                      <p class="font-bold">Couldn't load the Work Project's grounding</p>
                      <p class="mt-1 leading-6">{message()}</p>
                      <p class="mt-1 leading-6">Your Template is unchanged. Retry, or explicitly continue without grounding.</p>
                    </section>
                  )}
                </Match>
              </Switch>
            </div>

            <footer class="flex flex-wrap justify-end gap-3 border-t border-slate-200 p-4 dark:border-slate-800">
              <Switch>
                <Match when={state().phase === "review"}>
                  <button class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700" type="button" onClick={session.reject}>Reject</button>
                  <button class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50" type="button" disabled={review()?.diff.identical} onClick={session.accept}>Accept</button>
                </Match>
                <Match when={busy()}>
                  <button class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:border-slate-700" type="button" disabled={state().phase === "cancelling"} onClick={() => void session.cancel()}>Cancel</button>
                </Match>
                <Match when={state().phase === "grounding-error"}>
                  <button class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700" type="button" onClick={session.close}>Close</button>
                  <button class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700" type="button" onClick={() => void session.start({ ungrounded: true })}>Continue without grounding</button>
                  <button class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700" type="button" onClick={() => void session.start()}>Retry</button>
                </Match>
                <Match when={state().phase === "form" || state().phase === "auth-error"}>
                  <button class="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700" type="button" onClick={session.close}>Close</button>
                  <Show when={state().phase === "form"}>
                    <button class="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50" type="button" disabled={!props.sidecarAvailable() || documentsLoading()} onClick={() => void session.start()}>{documentsLoading() ? "Checking Reference Documents…" : "Improve"}</button>
                  </Show>
                </Match>
              </Switch>
            </footer>
          </section>
        </div>
      </Show>
    </>
  );
}
