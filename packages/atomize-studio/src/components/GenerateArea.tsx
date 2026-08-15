import { type Accessor, createSignal, For, Match, onMount, Show, Switch } from "solid-js";
import { type CatalogItem, parseCatalogItems } from "../catalog/catalog-item";
import { pickLocalFile } from "../files/pick-local-file";
import { buildMockStoryJson, type InspectResult, type PreviewResult, type PreviewSource, parseInspectResult, parsePreviewResult, previewSourceLabel, previewSourceValue } from "../generate/preview";
import { inspectPreview, listCatalogItems, runMockPreview, SidecarRequestError } from "../sidecar/sidecar-client";
import type { GroundingSession } from "./GroundingSettings";
import { GenerateLiveArea } from "./GenerateLiveArea";
import { GenerateMockPreview } from "./GeneratePreviewVariants";
import { GenerateModeToggle, type GenerateMode } from "./GenerateModeToggle";
import { GenerateSourcePicker } from "./GenerateSourcePicker";

type CatalogTemplateItem = Extract<CatalogItem, { kind: "template" }>;

type CatalogPickerState =
  | { kind: "loading" }
  | { kind: "ready"; items: CatalogTemplateItem[] }
  | { kind: "empty" }
  | { kind: "error"; message: string };

type InspectState =
  | { kind: "loading" }
  | { kind: "ready"; result: InspectResult }
  | { kind: "error"; message: string };

type RunState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; result: PreviewResult }
  | { kind: "error"; message: string };

export function GenerateArea(props: { sidecarAvailable: Accessor<boolean>; grounding: GroundingSession }) {
  const [source, setSource] = createSignal<PreviewSource>();
  const [pickerMode, setPickerMode] = createSignal<"catalog" | "file">("catalog");
  const [catalog, setCatalog] = createSignal<CatalogPickerState>({ kind: "loading" });
  const [filePickError, setFilePickError] = createSignal("");
  const [picking, setPicking] = createSignal(false);

  const [inspect, setInspect] = createSignal<InspectState>({ kind: "loading" });
  const [formValues, setFormValues] = createSignal<Record<string, string>>({});
  const [run, setRun] = createSignal<RunState>({ kind: "idle" });
  const [generateMode, setGenerateMode] = createSignal<GenerateMode>("mock");

  const loadCatalog = async () => {
    if (!props.sidecarAvailable()) return;
    setCatalog({ kind: "loading" });
    try {
      // Mixins can't stand alone as a Preview Source — the resolver itself rejects them.
      const items = parseCatalogItems(await listCatalogItems()).filter((item): item is CatalogTemplateItem => item.kind === "template");
      setCatalog(items.length === 0 ? { kind: "empty" } : { kind: "ready", items });
    } catch (error) {
      setCatalog({ kind: "error", message: error instanceof Error ? error.message : "Unable to load the Catalog." });
    }
  };
  onMount(() => { void loadCatalog(); });

  const selectSource = async (next: PreviewSource) => {
    setSource(next);
    setRun({ kind: "idle" });
    setFormValues({});
    setGenerateMode("mock");
    setInspect({ kind: "loading" });
    try {
      const result = parseInspectResult(await inspectPreview(previewSourceValue(next)));
      setInspect({ kind: "ready", result });
    } catch (error) {
      setInspect({ kind: "error", message: error instanceof Error ? error.message : "We could not inspect this Template." });
    }
  };

  const pickFile = async () => {
    if (picking()) return;
    setFilePickError("");
    setPicking(true);
    try {
      const picked = await pickLocalFile();
      if (!picked) return;
      await selectSource({ kind: "file", path: picked.path });
    } catch (error) {
      setFilePickError(error instanceof Error ? error.message : "We could not open that file.");
    } finally {
      setPicking(false);
    }
  };

  const changeSource = () => { setSource(undefined); setInspect({ kind: "loading" }); setRun({ kind: "idle" }); };

  const runPreview = async () => {
    const current = source();
    const currentInspect = inspect();
    if (!current || currentInspect.kind !== "ready") return;
    setRun({ kind: "loading" });
    try {
      const mockStory = buildMockStoryJson(currentInspect.result.fields, formValues());
      const result = parsePreviewResult(await runMockPreview(previewSourceValue(current), mockStory));
      setRun({ kind: "ready", result });
    } catch (error) {
      const message = error instanceof SidecarRequestError && error.code === "MOCK_STORY_INVALID"
        ? "Your mock Story values don't look right — check them and try again."
        : error instanceof Error ? error.message : "We could not run Mock Preview.";
      setRun({ kind: "error", message });
    }
  };

  return (
    <div class="p-6 lg:p-8">
      <section class="mx-auto max-w-4xl">
        <h1 class="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">Generate</h1>
        <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
          {generateMode() === "live"
            ? "Preview against real Stories, then execute to create real Work Items in Azure DevOps."
            : "Run Mock Preview against a Template — offline, without connecting to a platform."}
        </p>

        <Show when={source()}>
          {(current) => {
            const selectedSource = current();
            return <div class="mt-6">
              <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900" title={selectedSource.kind === "file" ? selectedSource.path : undefined}>
                <div class="flex min-w-0 items-center gap-2">
                  <span class="grid size-6 shrink-0 place-items-center rounded-md bg-indigo-50 text-xs text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">{selectedSource.kind === "catalog" ? "📚" : "↗"}</span>
                  <p class="truncate text-sm font-bold text-slate-950 dark:text-white">{previewSourceLabel(selectedSource)}</p>
                  <button class="shrink-0 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400" type="button" onClick={changeSource}>Change</button>
                </div>
                <GenerateModeToggle mode={generateMode()} onChange={setGenerateMode} />
              </div>

              <Switch>
                <Match when={inspect().kind === "loading"}>
                  <p class="mt-6 text-slate-600 dark:text-slate-300">Inspecting Template…</p>
                </Match>
                <Match when={inspect().kind === "error"}>
                  <p class="mt-6 text-sm text-rose-600">{(inspect() as Extract<InspectState, { kind: "error" }>).message}</p>
                </Match>
                <Match when={inspect().kind === "ready"}>
                  <div class="contents">
                    <Show when={(inspect() as Extract<InspectState, { kind: "ready" }>).result.fields.length === 0}>
                      <p class="mt-6 text-sm text-slate-600 dark:text-slate-300">This Template references no Story fields.</p>
                    </Show>
                    <Show when={generateMode() === "mock"}>
                      <GenerateMockPreview inspect={(inspect() as Extract<InspectState, { kind: "ready" }>).result} formValues={formValues} setFormValues={setFormValues} run={run} onRun={() => void runPreview()} />
                    </Show>
                    <Show when={generateMode() === "live"}>
                      <Show
                        when={props.grounding.selectedProfile()}
                        fallback={<p class="mt-6 text-sm text-slate-600 dark:text-slate-300">Choose a Work Project in the header before running Live Preview or Execute.</p>}
                      >
                        {(profile) => <GenerateLiveArea source={selectedSource} profile={profile} />}
                      </Show>
                    </Show>
                  </div>
                </Match>
              </Switch>
            </div>;
          }}
        </Show>

        <Show when={!source()}>
          <div class="mt-8 max-w-3xl">
            <div>
              <p class="text-xs font-bold tracking-widest text-indigo-600 uppercase">Preview source</p>
              <h2 class="mt-1 text-xl font-bold tracking-tight text-slate-950 dark:text-white">Choose the Template to simulate</h2>
              <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">The selected Template stays separate from anything you are editing in the Templates Area.</p>
            </div>
            <GenerateSourcePicker active={pickerMode()} onSelect={setPickerMode} />
            <Show
              when={pickerMode() === "catalog"}
              fallback={
                <div class="mt-5 rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-900">
                  <p class="text-xs font-bold tracking-widest text-slate-400 uppercase">Local Template</p>
                  <h3 class="mt-1 text-base font-bold text-slate-950 dark:text-white">Choose an Atomize YAML File</h3>
                  <p class="mt-2 max-w-xl text-sm text-slate-500 dark:text-slate-400">The file is used only as this Mock Preview’s source. It is not opened in the Templates Area or installed anywhere.</p>
                  <button
                    class="mt-5 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
                    type="button"
                    disabled={picking()}
                    onClick={() => void pickFile()}
                  >
                    {picking() ? "Opening…" : "Choose a local Atomize YAML File"}
                  </button>
                  <Show when={filePickError()}>
                    <p class="mt-3 text-sm text-rose-600">{filePickError()}</p>
                  </Show>
                </div>
              }
            >
              <Switch>
                <Match when={!props.sidecarAvailable()}>
                  <div class="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">The Catalog is unavailable while the companion process recovers. You can still choose a local file.</div>
                </Match>
                <Match when={catalog().kind === "loading"}>
                  <div class="mt-5 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Loading Catalog Templates…</div>
                </Match>
                <Match when={catalog().kind === "empty"}>
                  <div class="mt-5 rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">No Catalog Templates are available yet. Choose a local file, or install a Template from the Catalog Area.</div>
                </Match>
                <Match when={catalog().kind === "error"}>
                  <div class="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-5 dark:border-rose-900 dark:bg-rose-950/30">
                    <p class="text-sm text-rose-700 dark:text-rose-200">{(catalog() as Extract<CatalogPickerState, { kind: "error" }>).message}</p>
                    <button class="mt-3 text-sm font-semibold text-indigo-700 hover:underline dark:text-indigo-300" type="button" onClick={() => void loadCatalog()}>Retry loading Catalog</button>
                  </div>
                </Match>
                <Match when={catalog().kind === "ready"}>
                  <div class="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                    <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                      <div><p class="text-xs font-bold tracking-widest text-slate-400 uppercase">Available Templates</p><p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Pick one to provide the generation rules.</p></div>
                      <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{(catalog() as Extract<CatalogPickerState, { kind: "ready" }>).items.length}</span>
                    </div>
                    <div class="p-2">
                    <For each={(catalog() as Extract<CatalogPickerState, { kind: "ready" }>).items}>
                      {(item) => (
                        <button
                          class="block w-full rounded-xl p-4 text-left hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                          type="button"
                          onClick={() => void selectSource({ kind: "catalog", ref: item.ref, displayName: item.displayName })}
                        >
                          <div class="flex items-center justify-between gap-4"><div><p class="font-semibold text-slate-950 dark:text-white">{item.displayName}</p><p class="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.ref}</p></div><span class="text-indigo-600 dark:text-indigo-300">→</span></div>
                        </button>
                      )}
                    </For>
                    </div>
                  </div>
                </Match>
              </Switch>
            </Show>
          </div>
        </Show>
      </section>
    </div>
  );
}
