import { createSignal, Show } from "solid-js";
import { downloadTemplate, slugifyTemplateName } from "../../download/download-service";
import type { AuthoringStore } from "../../stores/sections";

async function revealInFolder(path: string) {
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
}

export function ReviewSection(props: { store: AuthoringStore; canReview: boolean }) {
  const [downloading, setDownloading] = createSignal(false);
  const [downloadError, setDownloadError] = createSignal("");
  const [saved, setSaved] = createSignal<{ name: string; path: string }>();
  const [copied, setCopied] = createSignal(false);

  const fileName = () => `${slugifyTemplateName(props.store["basic-info"].fields.name)}.atomize.yaml`;

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
              <button
                type="button"
                class="rounded-md px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                onClick={() => navigator.clipboard.writeText(props.store.serialise())}
              >
                Copy YAML
              </button>
              <button
                type="button"
                class="rounded-md !border-0 !bg-emerald-600 px-2.5 py-1 text-xs font-semibold !text-white !shadow-none hover:!bg-emerald-500 disabled:opacity-60"
                disabled={downloading()}
                onClick={download}
              >
                {downloading() ? "Exporting…" : "Export file…"}
              </button>
            </div>
          </div>
          <pre class="overflow-x-auto rounded-b-xl bg-slate-950 p-5 text-sm leading-6 text-slate-100">
            <code>{props.store.serialise()}</code>
          </pre>
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
