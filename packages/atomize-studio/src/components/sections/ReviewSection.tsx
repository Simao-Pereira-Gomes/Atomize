import { createSignal, Show } from "solid-js";
import { downloadTemplate, saveTemplateToPath, slugifyTemplateName } from "../../download/download-service";
import type { AuthoringStore } from "../../stores/sections";

async function revealInFolder(path: string) {
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
}

export function ReviewSection(props: { store: AuthoringStore; canReview: boolean; openFilePath?: string }) {
  const [downloading, setDownloading] = createSignal(false);
  const [downloadError, setDownloadError] = createSignal("");
  const [saved, setSaved] = createSignal<{ name: string; path: string }>();
  const [copied, setCopied] = createSignal(false);
  const [yamlMaximized, setYamlMaximized] = createSignal(false);
  const [yamlZoom, setYamlZoom] = createSignal(100);

  const fileName = () => `${slugifyTemplateName(props.store["basic-info"].fields.name)}.atomize.yaml`;
  const decreaseZoom = () => setYamlZoom((zoom) => Math.max(70, zoom - 10));
  const increaseZoom = () => setYamlZoom((zoom) => Math.min(160, zoom + 10));
  const yamlFontSize = () => `${(14 * yamlZoom()) / 100}px`;

  const download = async () => {
    if (downloading()) return;
    setDownloadError("");
    setDownloading(true);
    try {
      const name = fileName();
      const path = await downloadTemplate(props.store.serialise(), name);
      if (path) {
        setSaved({ name, path });
        setTimeout(() => setSaved(undefined), 6000);
      }
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "We could not save the template.");
    } finally {
      setDownloading(false);
    }
  };

  const save = async () => {
    const path = props.openFilePath;
    if (!path || downloading()) return;
    setDownloadError("");
    setDownloading(true);
    try {
      await saveTemplateToPath(path, props.store.serialise());
      setSaved({ name: fileName(), path });
      setTimeout(() => setSaved(undefined), 6000);
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "We could not save the template.");
    } finally {
      setDownloading(false);
    }
  };

  const copyPath = async () => {
    const current = saved();
    if (!current) return;
    await navigator.clipboard.writeText(current.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div class="space-y-5">
      <p class="text-sm leading-6 text-slate-600 dark:text-slate-300">
        Review the generated Atomize YAML. Return to the highlighted sections to finish any required information.
      </p>
      {props.canReview ? (
        <div class="space-y-0">
          <div class="flex items-center justify-between gap-3 rounded-t-xl border border-b-0 border-slate-800 bg-slate-900 px-4 py-2.5">
            <span class="truncate font-mono text-xs text-slate-400">{fileName()}</span>
            <div class="flex shrink-0 items-center gap-2">
              <div class="flex overflow-hidden rounded-md border border-slate-700" aria-label="YAML font size controls">
                <button type="button" class="grid size-7 place-items-center text-sm font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-40" disabled={yamlZoom() <= 70} onClick={decreaseZoom} aria-label="Decrease YAML zoom" title="Decrease YAML zoom">−</button>
                <span class="grid min-w-10 place-items-center border-x border-slate-700 px-1 text-xs text-slate-300" aria-live="polite">{yamlZoom()}%</span>
                <button type="button" class="grid size-7 place-items-center text-sm font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-40" disabled={yamlZoom() >= 160} onClick={increaseZoom} aria-label="Increase YAML zoom" title="Increase YAML zoom">+</button>
              </div>
              <button
                type="button"
                class="rounded-md px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                onClick={() => navigator.clipboard.writeText(props.store.serialise())}
              >
                Copy YAML
              </button>
              <Show
                when={props.openFilePath}
                fallback={
                  <button
                    type="button"
                    class="rounded-md !border-0 !bg-emerald-600 px-2.5 py-1 text-xs font-semibold !text-white !shadow-none hover:!bg-emerald-500 disabled:opacity-60"
                    disabled={downloading()}
                    onClick={download}
                  >
                    {downloading() ? "Exporting…" : "Export file…"}
                  </button>
                }
              >
                <button
                  type="button"
                  class="rounded-md !border-0 !bg-emerald-600 px-2.5 py-1 text-xs font-semibold !text-white !shadow-none hover:!bg-emerald-500 disabled:opacity-60"
                  disabled={downloading()}
                  onClick={save}
                >
                  {downloading() ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  class="rounded-md border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-60"
                  disabled={downloading()}
                  onClick={download}
                >
                  {downloading() ? "Exporting…" : "Export as copy…"}
                </button>
              </Show>
              <button
                type="button"
                class="grid size-7 place-items-center rounded-md text-lg font-semibold text-slate-300 hover:bg-slate-800"
                onClick={() => setYamlMaximized(true)}
                aria-label="Maximize YAML preview"
                title="Maximize YAML preview"
              >
                ⛶
              </button>
            </div>
          </div>
          <pre class="overflow-x-auto rounded-b-xl bg-slate-950 p-5 leading-6 text-slate-100" style={{ "font-size": yamlFontSize() }}>
            <code>{props.store.serialise()}</code>
          </pre>
          <Show when={yamlMaximized()}>
            <div class="fixed inset-0 z-[850] flex flex-col bg-slate-950/90 p-4 sm:p-7" role="dialog" aria-modal="true" aria-label="Maximized YAML preview">
              <div class="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 rounded-t-xl border border-b-0 border-slate-700 bg-slate-900 px-4 py-3">
                <span class="truncate font-mono text-xs text-slate-400">{fileName()}</span>
                <div class="flex shrink-0 items-center gap-2">
                  <div class="flex overflow-hidden rounded-md border border-slate-700" aria-label="YAML font size controls">
                    <button type="button" class="grid size-7 place-items-center text-sm font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-40" disabled={yamlZoom() <= 70} onClick={decreaseZoom} aria-label="Decrease YAML zoom" title="Decrease YAML zoom">−</button>
                    <span class="grid min-w-10 place-items-center border-x border-slate-700 px-1 text-xs text-slate-300" aria-live="polite">{yamlZoom()}%</span>
                    <button type="button" class="grid size-7 place-items-center text-sm font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-40" disabled={yamlZoom() >= 160} onClick={increaseZoom} aria-label="Increase YAML zoom" title="Increase YAML zoom">+</button>
                  </div>
                  <button type="button" class="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800" onClick={() => navigator.clipboard.writeText(props.store.serialise())}>Copy YAML</button>
                  <button type="button" class="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-600" onClick={() => setYamlMaximized(false)} aria-label="Close maximized YAML preview">Close</button>
                </div>
              </div>
              <pre class="mx-auto min-h-0 w-full max-w-7xl flex-1 overflow-auto rounded-b-xl bg-slate-950 p-5 leading-6 text-slate-100" style={{ "font-size": yamlFontSize() }}><code>{props.store.serialise()}</code></pre>
            </div>
          </Show>
          <Show when={downloadError()}>
            <p class="ui-error mt-3">{downloadError()}</p>
          </Show>

          <Show when={saved()}>
            <div class="fixed top-5 right-5 z-[900] w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-800">
              <div class="flex items-start gap-2.5">
                <span class="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-600 text-xs font-bold text-white">✓</span>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold text-slate-900 dark:text-white">Saved {saved()?.name}</p>
                  <div class="mt-2 flex gap-3 text-xs font-semibold">
                    <button
                      type="button"
                      class="text-indigo-600 hover:underline dark:text-indigo-400"
                      onClick={() => {
                        const path = saved()?.path;
                        if (path) revealInFolder(path);
                      }}
                    >
                      Show in folder
                    </button>
                    <button type="button" class="text-indigo-600 hover:underline dark:text-indigo-400" onClick={copyPath}>
                      {copied() ? "Copied!" : "Copy path"}
                    </button>
                  </div>
                </div>
                <button type="button" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" onClick={() => setSaved(undefined)} aria-label="Dismiss">
                  ✕
                </button>
              </div>
            </div>
          </Show>
        </div>
      ) : (
        <div class="rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          Complete the required fields in Basic Info and Tasks, and correct any invalid values, to preview the final YAML.
        </div>
      )}
    </div>
  );
}
