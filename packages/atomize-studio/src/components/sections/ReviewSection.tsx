import { createSignal, type JSX, Show } from "solid-js";
import { stringify } from "yaml";
import { downloadTemplate, saveTemplateToPath, slugifyTemplateName } from "../../download/download-service";
import { type CatalogInstallScope, installCatalogItem, SidecarRequestError } from "../../sidecar/sidecar-client";
import type { AuthoringStore } from "../../stores/sections";

async function revealInFolder(path: string) {
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
}

/** Shared toolbar for both the inline YAML preview and its maximized overlay — kept as one
 * component so the two surfaces can never drift out of sync on which actions are available. */
function ReviewToolbar(props: {
  fileName: string;
  zoom: number;
  onZoomOut: () => void;
  onZoomIn: () => void;
  onCopy: () => void;
  openFilePath?: string;
  downloading: boolean;
  onExport: () => void;
  onSave: () => void;
  onInstall: () => void;
  trailing: JSX.Element;
}) {
  return (
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-t-xl border border-b-0 border-slate-800 bg-slate-900 px-4 py-2.5">
      <span class="truncate font-mono text-xs text-slate-400">{props.fileName}</span>
      <div class="flex flex-wrap items-center justify-end gap-2">
        <div class="flex overflow-hidden rounded-md border border-slate-700">
          <button type="button" class="grid size-7 place-items-center text-sm font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-40" disabled={props.zoom <= 70} onClick={props.onZoomOut} aria-label="Decrease YAML zoom" title="Decrease YAML zoom">−</button>
          <span class="grid min-w-10 place-items-center border-x border-slate-700 px-1 text-xs text-slate-300" aria-live="polite">{props.zoom}%</span>
          <button type="button" class="grid size-7 place-items-center text-sm font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-40" disabled={props.zoom >= 160} onClick={props.onZoomIn} aria-label="Increase YAML zoom" title="Increase YAML zoom">+</button>
        </div>
        <button type="button" class="rounded-md px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800" onClick={props.onCopy}>
          Copy YAML
        </button>
        <Show
          when={props.openFilePath}
          fallback={
            <button
              type="button"
              class="rounded-md !border-0 !bg-emerald-600 px-2.5 py-1 text-xs font-semibold !text-white !shadow-none hover:!bg-emerald-500 disabled:opacity-60"
              disabled={props.downloading}
              onClick={props.onExport}
            >
              {props.downloading ? "Exporting…" : "Export file…"}
            </button>
          }
        >
          <button
            type="button"
            class="rounded-md !border-0 !bg-emerald-600 px-2.5 py-1 text-xs font-semibold !text-white !shadow-none hover:!bg-emerald-500 disabled:opacity-60"
            disabled={props.downloading}
            onClick={props.onSave}
          >
            {props.downloading ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            class="rounded-md border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-60"
            disabled={props.downloading}
            onClick={props.onExport}
          >
            {props.downloading ? "Exporting…" : "Export as copy…"}
          </button>
        </Show>
        <button
          type="button"
          class="rounded-md border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-800"
          onClick={props.onInstall}
        >
          Install to Catalog…
        </button>
        {props.trailing}
      </div>
    </div>
  );
}

export function ReviewSection(props: { store: AuthoringStore; canReview: boolean; openFilePath?: string }) {
  const [downloading, setDownloading] = createSignal(false);
  const [downloadError, setDownloadError] = createSignal("");
  const [saved, setSaved] = createSignal<{ name: string; path: string }>();
  const [copied, setCopied] = createSignal(false);
  const [yamlMaximized, setYamlMaximized] = createSignal(false);
  const [yamlZoom, setYamlZoom] = createSignal(100);

  const [installOpen, setInstallOpen] = createSignal(false);
  const [installScope, setInstallScope] = createSignal<CatalogInstallScope>("user");
  const [installing, setInstalling] = createSignal(false);
  const [installError, setInstallError] = createSignal("");
  const [installCollision, setInstallCollision] = createSignal(false);
  const [installed, setInstalled] = createSignal<{ name: string; scope: CatalogInstallScope }>();

  const fileName = () => `${slugifyTemplateName(props.store["basic-info"].fields.name)}.atomize.yaml`;
  const decreaseZoom = () => setYamlZoom((zoom) => Math.max(70, zoom - 10));
  const increaseZoom = () => setYamlZoom((zoom) => Math.min(160, zoom + 10));
  const yamlFontSize = () => `${(14 * yamlZoom()) / 100}px`;
  const copyYaml = () => navigator.clipboard.writeText(props.store.serialise());

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

  const openInstall = () => {
    setInstallOpen(true);
    setInstallScope("user");
    setInstallError("");
    setInstallCollision(false);
  };
  const closeInstall = () => {
    if (installing()) return;
    setInstallOpen(false);
  };

  const runInstall = async (overwrite: boolean) => {
    const name = slugifyTemplateName(props.store["basic-info"].fields.name);
    // A Catalog item is a new canonical copy, not tied to whatever it was cloned or opened
    // from — strip origin the same way "Export as copy…" detaches (ADR-0037/0048, ADR-0052).
    const { origin: _origin, ...template } = props.store.toTemplate();
    const content = stringify(template, { lineWidth: 0 });

    setInstalling(true);
    setInstallError("");
    try {
      await installCatalogItem(content, name, installScope(), overwrite);
      setInstallCollision(false);
      setInstallOpen(false);
      setInstalled({ name, scope: installScope() });
      setTimeout(() => setInstalled(undefined), 6000);
    } catch (error) {
      if (error instanceof SidecarRequestError && error.code === "CATALOG_ITEM_ALREADY_EXISTS") {
        setInstallCollision(true);
        setInstallError(`A template named "${name}" already exists in ${installScope() === "project" ? "the project" : "your"} Catalog.`);
      } else {
        setInstallCollision(false);
        setInstallError(error instanceof Error ? error.message : "We could not install this template.");
      }
    } finally {
      setInstalling(false);
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
      {props.canReview ? (
        <div class="space-y-0">
          <ReviewToolbar
            fileName={fileName()}
            zoom={yamlZoom()}
            onZoomOut={decreaseZoom}
            onZoomIn={increaseZoom}
            onCopy={copyYaml}
            openFilePath={props.openFilePath}
            downloading={downloading()}
            onExport={download}
            onSave={save}
            onInstall={openInstall}
            trailing={
              <button
                type="button"
                class="grid size-7 place-items-center rounded-md text-lg font-semibold text-slate-300 hover:bg-slate-800"
                onClick={() => setYamlMaximized(true)}
                aria-label="Maximize YAML preview"
                title="Maximize YAML preview"
              >
                ⛶
              </button>
            }
          />
          <pre class="overflow-x-auto rounded-b-xl bg-slate-950 p-5 leading-6 text-slate-100" style={{ "font-size": yamlFontSize() }}>
            <code>{props.store.serialise()}</code>
          </pre>
          <Show when={yamlMaximized()}>
            <div class="fixed inset-0 z-[850] flex flex-col bg-slate-950/90 p-4 sm:p-7" role="dialog" aria-modal="true" aria-label="Maximized YAML preview">
              <div class="mx-auto w-full max-w-7xl">
                <ReviewToolbar
                  fileName={fileName()}
                  zoom={yamlZoom()}
                  onZoomOut={decreaseZoom}
                  onZoomIn={increaseZoom}
                  onCopy={copyYaml}
                  openFilePath={props.openFilePath}
                  downloading={downloading()}
                  onExport={download}
                  onSave={save}
                  onInstall={openInstall}
                  trailing={
                    <button
                      type="button"
                      class="rounded-md bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-600"
                      onClick={() => setYamlMaximized(false)}
                      aria-label="Close maximized YAML preview"
                    >
                      Close
                    </button>
                  }
                />
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

          <Show when={installed()}>
            <div class="fixed top-5 right-5 z-[900] w-80 rounded-xl border border-slate-200 bg-white p-4 shadow-lg dark:border-slate-700 dark:bg-slate-800">
              <div class="flex items-start gap-2.5">
                <span class="grid size-6 shrink-0 place-items-center rounded-full bg-emerald-600 text-xs font-bold text-white">✓</span>
                <div class="min-w-0 flex-1">
                  <p class="text-sm font-semibold text-slate-900 dark:text-white">
                    Installed to {installed()?.scope === "project" ? "the project" : "your"} Catalog
                  </p>
                  <p class="mt-1 truncate font-mono text-xs text-slate-500 dark:text-slate-400">{installed()?.name}</p>
                </div>
                <button type="button" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" onClick={() => setInstalled(undefined)} aria-label="Dismiss">
                  ✕
                </button>
              </div>
            </div>
          </Show>

          <Show when={installOpen()}>
            <div class="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-5" role="presentation">
              <section
                class="w-full max-w-lg rounded-2xl bg-white shadow-xl dark:bg-slate-900"
                role="dialog"
                aria-modal="true"
                aria-labelledby="install-catalog-title"
              >
                <div class="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
                  <h2 id="install-catalog-title" class="text-lg font-bold text-slate-950 dark:text-white">
                    Install to Catalog
                  </h2>
                  <p class="mt-1 truncate font-mono text-xs text-slate-500 dark:text-slate-400">{fileName()}</p>
                </div>
                <div class="px-6 py-5">
                  <p class="text-sm leading-6 text-slate-600 dark:text-slate-300">
                    Makes this Template available via <code class="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs dark:bg-slate-800">atomize template list</code> and the Catalog section.
                  </p>
                  <div class="mt-5">
                    <p class="text-sm font-semibold text-slate-700 dark:text-slate-200">Install to</p>
                    <div class="mt-2 grid grid-cols-2 overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700">
                      <button
                        type="button"
                        aria-pressed={installScope() === "user"}
                        class={`px-3 py-2.5 text-sm font-semibold transition-colors ${installScope() === "user" ? "bg-indigo-600 text-white" : "bg-transparent text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"}`}
                        disabled={installing()}
                        onClick={() => { setInstallScope("user"); setInstallCollision(false); setInstallError(""); }}
                      >
                        My Catalog
                      </button>
                      <button
                        type="button"
                        aria-pressed={installScope() === "project"}
                        class={`border-l border-slate-300 px-3 py-2.5 text-sm font-semibold transition-colors dark:border-slate-700 ${installScope() === "project" ? "bg-indigo-600 text-white" : "bg-transparent text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"}`}
                        disabled={installing()}
                        onClick={() => { setInstallScope("project"); setInstallCollision(false); setInstallError(""); }}
                      >
                        Project Catalog
                      </button>
                    </div>
                  </div>
                  <Show when={installError()}>
                    <p class="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{installError()}</p>
                  </Show>
                </div>
                <div class="flex justify-end gap-2 border-t border-slate-100 px-6 py-4 dark:border-slate-800">
                  <button
                    type="button"
                    class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                    disabled={installing()}
                    onClick={closeInstall}
                  >
                    Cancel
                  </button>
                  <Show
                    when={installCollision()}
                    fallback={
                      <button
                        type="button"
                        class="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        disabled={installing()}
                        onClick={() => void runInstall(false)}
                      >
                        {installing() ? "Installing…" : "Install"}
                      </button>
                    }
                  >
                    <button
                      type="button"
                      class="rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      disabled={installing()}
                      onClick={() => void runInstall(true)}
                    >
                      {installing() ? "Overwriting…" : "Overwrite"}
                    </button>
                  </Show>
                </div>
              </section>
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
