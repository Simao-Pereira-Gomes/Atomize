import { type Accessor, createEffect, createMemo, createSignal, For, on, onCleanup, onMount, Show } from "solid-js";
import {
  type DocumentGrounding,
  folderName,
  type LoadedReferences,
  localEntry,
  parseLoadedReferences,
  parseReferenceList,
  wikiEntry,
} from "../references/reference-documents";
import { listReferences, listWikiPages, listWikis, loadReferences, SidecarRequestError, saveReference } from "../sidecar/sidecar-client";

const LOAD_DEBOUNCE_MS = 400;

type Wiki = { id: string; name: string };

const message = (error: unknown, fallback: string) => (error instanceof SidecarRequestError || error instanceof Error ? error.message : fallback);

/**
 * Chooses the Reference Documents for an AI draft or improvement (ADR-0069, ADR-0070): the Project
 * Reference Documents saved in the project folder's `.atomize/ai.yaml` ticked, plus local files or
 * wiki pages added for this run and optionally saved for the project. The chosen documents are
 * loaded and fitted as they change, so any shortening shows before sending.
 */
export function ReferenceDocumentsPicker(props: {
  /** The Work Project; wiki pages need one. */
  profile: Accessor<string>;
  /** A file the Template came from, whose Workspace Root is the default project folder. */
  startPath?: Accessor<string | undefined>;
  /** Reports the fitted documents, and whether they're still being loaded. */
  onChange: (grounding: DocumentGrounding | null, loading: boolean) => void;
  disabled?: Accessor<boolean>;
}) {
  const [folder, setFolder] = createSignal<string>();
  const [saved, setSaved] = createSignal<string[]>([]);
  const [added, setAdded] = createSignal<string[]>([]);
  const [ticked, setTicked] = createSignal<Set<string>>(new Set());
  const [savedNow, setSavedNow] = createSignal<Set<string>>(new Set());
  const [problems, setProblems] = createSignal<string[]>([]);
  const [error, setError] = createSignal("");
  const [loaded, setLoaded] = createSignal<LoadedReferences>();
  const [loading, setLoading] = createSignal(false);
  const [wikis, setWikis] = createSignal<Wiki[]>();
  const [wiki, setWiki] = createSignal<Wiki>();
  const [pages, setPages] = createSignal<string[]>([]);
  const [pageFilter, setPageFilter] = createSignal("");
  const [pickedPages, setPickedPages] = createSignal<Set<string>>(new Set());
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(timer));
  // Callers often derive the profile from a larger object that changes on every keystroke
  // elsewhere; react only when the profile itself changes, or every keystroke reloads the documents.
  const profile = createMemo(() => props.profile());

  const useFolder = async (startPath: string) => {
    setError("");
    try {
      const list = parseReferenceList(await listReferences(startPath));
      setFolder(list.workspaceRoot);
      setSaved(list.entries);
      setAdded([]);
      setTicked(new Set(list.entries));
      setProblems(list.problems);
    } catch (caught) {
      setError(message(caught, "We could not read that project folder."));
    }
  };
  onMount(() => {
    const start = props.startPath?.();
    if (start) void useFolder(start);
  });

  const chooseFolder = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false, title: "Choose the project folder" });
    if (typeof selected === "string") await useFolder(selected);
  };

  const entries = () => [...saved(), ...added().filter((entry) => !saved().includes(entry))];
  const chosen = () => entries().filter((entry) => ticked().has(entry));
  const toggle = (entry: string) => {
    const next = new Set(ticked());
    if (next.has(entry)) next.delete(entry);
    else next.add(entry);
    setTicked(next);
  };
  const add = (newEntries: string[]) => {
    const fresh = newEntries.filter((entry) => !entries().includes(entry));
    setAdded([...added(), ...fresh]);
    setTicked(new Set([...ticked(), ...newEntries]));
  };

  const addLocalFiles = async () => {
    const root = folder();
    if (!root) return;
    setError("");
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ multiple: true, defaultPath: root, title: "Add Reference Documents", filters: [{ name: "Markdown or text", extensions: ["md", "txt"] }] });
    const paths = Array.isArray(selected) ? selected : typeof selected === "string" ? [selected] : [];
    const accepted = paths.map((path) => localEntry(root, path));
    if (accepted.some((entry) => entry === undefined)) setError("Reference Documents must be files inside the project folder.");
    add(accepted.filter((entry): entry is string => entry !== undefined));
  };

  const openWikiPicker = async () => {
    setError("");
    try {
      const list = (await listWikis(props.profile()) as { wikis?: Wiki[] }).wikis ?? [];
      setWikis(list);
      if (list.length === 1 && list[0]) await chooseWiki(list[0]);
      if (list.length === 0) setError("This project has no wikis.");
    } catch (caught) {
      setError(message(caught, "We could not read this project's wikis."));
    }
  };
  const chooseWiki = async (next: Wiki) => {
    setWiki(next);
    setPickedPages(new Set<string>());
    try {
      setPages((await listWikiPages(props.profile(), next.id) as { paths?: string[] }).paths ?? []);
    } catch (caught) {
      setError(message(caught, "We could not list that wiki's pages."));
    }
  };
  const addPages = () => {
    const chosenWiki = wiki();
    if (!chosenWiki) return;
    add([...pickedPages()].map((path) => wikiEntry(chosenWiki.name, path)));
    setWikis(undefined);
    setWiki(undefined);
  };

  const saveForProject = async (entry: string) => {
    const root = folder();
    if (!root) return;
    try {
      await saveReference(root, entry);
      setSavedNow(new Set([...savedNow(), entry]));
    } catch (caught) {
      setError(message(caught, "We could not save that to .atomize/ai.yaml."));
    }
  };

  // Load and fit the chosen documents whenever they or the Work Project change.
  createEffect(on([folder, ticked, profile], () => {
    clearTimeout(timer);
    const root = folder();
    const list = chosen();
    if (!root || list.length === 0) {
      setLoaded(undefined);
      setLoading(false);
      props.onChange(null, false);
      return;
    }
    setLoading(true);
    props.onChange(loaded()?.grounding ?? null, true);
    timer = setTimeout(async () => {
      const current = ++generation;
      try {
        const result = parseLoadedReferences(await loadReferences(root, list, profile()));
        if (current !== generation) return;
        setLoaded(result);
        setLoading(false);
        props.onChange(result.grounding, false);
      } catch (caught) {
        if (current !== generation) return;
        setLoaded(undefined);
        setLoading(false);
        setError(message(caught, "We could not load the Reference Documents."));
        props.onChange(null, false);
      }
    }, LOAD_DEBOUNCE_MS);
  }));

  const button = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-semibold disabled:opacity-50 dark:border-slate-700";

  return (
    <section>
      <p class="text-sm font-semibold">Reference Documents <span class="font-normal text-slate-500 dark:text-slate-400">(optional)</span></p>
      <p class="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Your team's written process sent to Copilot as reference material.</p>

      <div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
        <span>Project folder: <strong>{folder() ? folderName(folder() as string) : "not chosen"}</strong></span>
        <button type="button" class="font-semibold text-indigo-600 hover:underline disabled:opacity-50 dark:text-indigo-400" disabled={props.disabled?.()} onClick={() => void chooseFolder()}>
          {folder() ? "Change" : "Choose project folder"}
        </button>
      </div>

      <Show when={folder()}>
        <ul class="mt-2 space-y-1">
          <For each={entries()}>
            {(entry) => (
              <li class="flex flex-wrap items-start gap-2 text-sm">
                <label class="flex min-w-0 flex-1 items-start gap-2">
                  <input type="checkbox" class="mt-1" checked={ticked().has(entry)} disabled={props.disabled?.()} onChange={() => toggle(entry)} />
                  <span class="min-w-0 break-all">{entry}</span>
                </label>
                <Show
                  when={!saved().includes(entry)}
                  fallback={<span class="text-xs text-slate-500 dark:text-slate-400">saved for this project</span>}
                >
                  <Show
                    when={!savedNow().has(entry)}
                    fallback={<span class="text-xs text-emerald-700 dark:text-emerald-400">saved to .atomize/ai.yaml</span>}
                  >
                    <button type="button" class="text-xs font-semibold text-indigo-600 hover:underline disabled:opacity-50 dark:text-indigo-400" disabled={props.disabled?.()} onClick={() => void saveForProject(entry)}>
                      Also save for this project
                    </button>
                  </Show>
                </Show>
              </li>
            )}
          </For>
        </ul>
        <div class="mt-2 flex flex-wrap gap-2">
          <button type="button" class={button} disabled={props.disabled?.()} onClick={() => void addLocalFiles()}>Add local file…</button>
          <Show when={props.profile()}>
            <button type="button" class={button} disabled={props.disabled?.()} onClick={() => void openWikiPicker()}>Add wiki page…</button>
          </Show>
        </div>
      </Show>

      <Show when={wikis()}>
        {(list) => (
          <div class="mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <Show when={list().length > 1 && !wiki()}>
              <p class="text-xs font-semibold">Which wiki?</p>
              <div class="mt-2 flex flex-wrap gap-2">
                <For each={list()}>{(item) => <button type="button" class={button} onClick={() => void chooseWiki(item)}>{item.name}</button>}</For>
              </div>
            </Show>
            <Show when={wiki()}>
              {(chosenWiki) => (
                <>
                  <p class="text-xs text-slate-500 dark:text-slate-400">Pages from {chosenWiki().name}. Only each page itself is read, not its sub-pages.</p>
                  <input class="mt-2 w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800" placeholder="Filter page paths…" value={pageFilter()} onInput={(event) => setPageFilter(event.currentTarget.value)} />
                  <div class="mt-2 max-h-48 overflow-y-auto">
                    <For each={pages().filter((path) => path.toLowerCase().includes(pageFilter().toLowerCase()))}>
                      {(path) => (
                        <label class="flex items-center gap-2 py-0.5 text-sm">
                          <input
                            type="checkbox"
                            checked={pickedPages().has(path)}
                            onChange={() => {
                              const next = new Set(pickedPages());
                              if (next.has(path)) next.delete(path);
                              else next.add(path);
                              setPickedPages(next);
                            }}
                          />
                          {path}
                        </label>
                      )}
                    </For>
                  </div>
                  <div class="mt-2 flex gap-2">
                    <button type="button" class={button} disabled={pickedPages().size === 0} onClick={addPages}>Add {pickedPages().size || ""} page{pickedPages().size === 1 ? "" : "s"}</button>
                    <button type="button" class="text-sm font-semibold text-slate-600 hover:underline dark:text-slate-300" onClick={() => { setWikis(undefined); setWiki(undefined); }}>Cancel</button>
                  </div>
                </>
              )}
            </Show>
          </div>
        )}
      </Show>

      <Show when={loading()}>
        <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">Checking the Reference Documents…</p>
      </Show>
      <Show when={(loaded()?.notices.length ?? 0) > 0}>
        <div class="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs leading-5 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <p class="font-semibold">Too long for one AI request. Untick documents to send the rest in full, or continue with them shortened:</p>
          <ul class="mt-1 list-disc pl-4"><For each={loaded()?.notices}>{(notice) => <li>{notice}</li>}</For></ul>
        </div>
      </Show>
      <Show when={(loaded()?.skipped.length ?? 0) > 0 || problems().length > 0}>
        <ul class="mt-2 list-disc space-y-1 pl-4 text-xs leading-5 text-rose-700 dark:text-rose-300">
          <For each={problems()}>{(problem) => <li>{problem}</li>}</For>
          <For each={loaded()?.skipped}>{(skipped) => <li>Left out {skipped.entry}: {skipped.message}</li>}</For>
        </ul>
      </Show>
      <Show when={error()}>
        <p class="mt-2 text-xs text-rose-600">{error()}</p>
      </Show>
    </section>
  );
}
