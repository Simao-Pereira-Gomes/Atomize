import { type Accessor, createEffect, createSignal, For, type JSX, Show } from "solid-js";
import { stringify } from "yaml";
import { catalogTemplateOrigin, type OriginBaselineSession } from "../../diff/origin-baseline";
import { downloadTemplate, saveTemplateToPath, slugifyTemplateName } from "../../download/download-service";
import { type CatalogInstallScope, installCatalogItem, type OnlineValidationResult, SidecarRequestError, validateOnline } from "../../sidecar/sidecar-client";
import type { AuthoringStore } from "../../stores/sections";
import type { GroundingSession } from "../GroundingSettings";
import { TemplateDiffView } from "./TemplateDiffView";

export type StoredOnlineValidation = { result: OnlineValidationResult; template: string; workProject: string; profile: string; stale?: boolean };
export type OnlineValidationSession = {
  result: Accessor<StoredOnlineValidation | undefined>;
  error: Accessor<string>;
  running: Accessor<boolean>;
  activeId: Accessor<string | undefined>;
  start: (id: string) => void;
  complete: (value: StoredOnlineValidation) => void;
  fail: (message: string) => void;
  dismiss: () => void;
};

/** A deliberately small YAML renderer for the read-only preview. It colours the
 * stable YAML constructs Atomize emits without turning the preview into an editor. */
function YamlLine(props: { line: string }) {
  const comment = props.line.match(/^(.*?)(\s+#.*)$/);
  const source = comment?.[1] ?? props.line;
  const mapping = source.match(/^(\s*(?:-\s+)?)([^:#][^:]*)(:)(.*)$/);
  if (!mapping) {
    return <><span class="text-sky-300">{source.match(/^(\s*-\s*)/)?.[1] ?? ""}</span><span class="text-slate-100">{source.replace(/^\s*-\s*/, "")}</span><span class="text-slate-500">{comment?.[2] ?? ""}</span></>;
  }
  const prefix = mapping[1] ?? "";
  const key = mapping[2] ?? "";
  const colon = mapping[3] ?? ":";
  const value = mapping[4] ?? "";
  const valueClass = /^\s*(?:true|false|null|~)\s*$/i.test(value)
    ? "text-fuchsia-300"
    : /^\s*-?\d+(?:\.\d+)?\s*$/.test(value)
      ? "text-amber-300"
      : /^\s*["']/.test(value)
        ? "text-emerald-300"
        : "text-slate-100";
  return <><span class="text-sky-300">{prefix}</span><span class="text-violet-300">{key}</span><span class="text-slate-400">{colon}</span><span class={valueClass}>{value}</span><span class="text-slate-500">{comment?.[2] ?? ""}</span></>;
}

function YamlCode(props: { value: string }) {
  return <code><For each={props.value.split("\n")}>{(line, index) => <><YamlLine line={line} />{index() < props.value.split("\n").length - 1 ? "\n" : ""}</>}</For></code>;
}

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
  onlineValidationDisabled: boolean;
  onlineValidationRunning: boolean;
  onValidateOnline: () => void;
  trailing: JSX.Element;
}) {
  return (
    <div class="space-y-3 rounded-t-xl border border-b-0 border-slate-800 bg-slate-900 px-4 py-3">
      <div class="min-w-0 truncate font-mono text-xs text-slate-400">{props.fileName}</div>
      <div class="flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="rounded-md !border-0 !bg-sky-600 px-3 py-1.5 text-xs font-semibold !text-white !shadow-none hover:!bg-sky-500 disabled:opacity-60"
            disabled={props.onlineValidationDisabled || props.onlineValidationRunning}
            title={props.onlineValidationDisabled ? "Online Validation is unavailable while the companion process recovers." : undefined}
            onClick={props.onValidateOnline}
          >
            {props.onlineValidationRunning ? "Validating online…" : "Validate online…"}
          </button>
          <Show
            when={props.openFilePath}
            fallback={
              <button
                type="button"
                class="rounded-md !border-0 !bg-emerald-600 px-3 py-1.5 text-xs font-semibold !text-white !shadow-none hover:!bg-emerald-500 disabled:opacity-60"
                disabled={props.downloading}
                onClick={props.onExport}
              >
                {props.downloading ? "Exporting…" : "Export file…"}
              </button>
            }
          >
            <button
              type="button"
              class="rounded-md !border-0 !bg-emerald-600 px-3 py-1.5 text-xs font-semibold !text-white !shadow-none hover:!bg-emerald-500 disabled:opacity-60"
              disabled={props.downloading}
              onClick={props.onSave}
            >
              {props.downloading ? "Saving…" : "Save"}
            </button>
          </Show>
          <button
            type="button"
            class="rounded-md border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-800"
            onClick={props.onInstall}
          >
            Install to Catalog…
          </button>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-700 pt-3">
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="rounded-md px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800" onClick={props.onCopy}>
            Copy YAML
          </button>
          <div class="flex overflow-hidden rounded-md border border-slate-700">
            <button type="button" class="grid size-7 place-items-center text-sm font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-40" disabled={props.zoom <= 70} onClick={props.onZoomOut} aria-label="Decrease YAML zoom" title="Decrease YAML zoom">−</button>
            <span class="grid min-w-10 place-items-center border-x border-slate-700 px-1 text-xs text-slate-300" aria-live="polite">{props.zoom}%</span>
            <button type="button" class="grid size-7 place-items-center text-sm font-bold text-slate-200 hover:bg-slate-800 disabled:opacity-40" disabled={props.zoom >= 160} onClick={props.onZoomIn} aria-label="Increase YAML zoom" title="Increase YAML zoom">+</button>
          </div>
          {props.trailing}
        <Show when={props.openFilePath}>
          <button
            type="button"
            class="rounded-md border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-60"
            disabled={props.downloading}
            onClick={props.onExport}
          >
            {props.downloading ? "Exporting…" : "Export as copy…"}
          </button>
        </Show>
        </div>
      </div>
    </div>
  );
}

export function ReviewSection(props: { store: AuthoringStore; canReview: boolean; openFilePath?: string; grounding: GroundingSession; sidecarAvailable: Accessor<boolean>; onlineValidation: OnlineValidationSession; originBaseline: OriginBaselineSession; onManageProjects: () => void }) {
  const [downloading, setDownloading] = createSignal(false);
  const [reviewTab, setReviewTab] = createSignal<"template" | "diff">("template");

  const originRef = () => catalogTemplateOrigin(props.store["basic-info"].advanced.origin);
  const hasOrigin = () => originRef() !== undefined;
  const segmentClass = (active: boolean) =>
    `px-3 py-1.5 text-sm font-semibold transition-colors ${active ? "bg-indigo-600 text-white" : "bg-transparent text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"}`;

  createEffect(() => {
    const ref = originRef();
    if (ref && reviewTab() === "diff") props.originBaseline.ensure(ref);
  });
  const [downloadError, setDownloadError] = createSignal("");
  const [saved, setSaved] = createSignal<{ name: string; path: string }>();
  const [copied, setCopied] = createSignal(false);
  const [yamlMaximized, setYamlMaximized] = createSignal(false);
  const [yamlZoom, setYamlZoom] = createSignal(100);
  const [profilePickerOpen, setProfilePickerOpen] = createSignal(false);

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
  const currentYaml = () => props.store.serialise();
  const resultIsOutdated = () => {
    const value = props.onlineValidation.result();
    return !!value && (value.stale === true || value.template !== currentYaml() || value.workProject !== props.grounding.selectedProfile());
  };
  const runOnlineValidation = async (profile: string) => {
    const template = currentYaml();
    const validationId = crypto.randomUUID();
    const workProject = props.grounding.selectedProfile();
    setProfilePickerOpen(false);
    props.onlineValidation.start(validationId);
    try {
      const result = await validateOnline(validationId, props.store.toTemplate(), profile);
      if (props.onlineValidation.activeId() !== validationId) return;
      props.onlineValidation.complete({ result, template, workProject, profile });
    } catch (error) {
      if (props.onlineValidation.activeId() !== validationId) return;
      props.onlineValidation.fail(error instanceof Error ? error.message : "We could not validate this Template online.");
    }
  };
  const requestOnlineValidation = () => {
    if (!props.sidecarAvailable() || props.onlineValidation.running()) return;
    const profile = props.grounding.selectedProfile();
    if (profile) void runOnlineValidation(profile);
    else setProfilePickerOpen(true);
  };

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
    const scope = installScope();
    let workspaceRoot: string | undefined;
    if (scope === "project") {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({ directory: true, multiple: false, title: "Choose project folder" });
      if (typeof selected !== "string") {
        setInstallError("Choose a project folder to install to its Catalog.");
        return;
      }
      workspaceRoot = selected;
    }
    const name = slugifyTemplateName(props.store["basic-info"].fields.name);
    // A Catalog item is a new canonical copy, not tied to whatever it was cloned or opened
    // from — strip origin the same way "Export as copy…" detaches (ADR-0037/0048, ADR-0052).
    const { origin: _origin, ...template } = props.store.toTemplate();
    const content = stringify(template, { lineWidth: 0 });

    setInstalling(true);
    setInstallError("");
    try {
      await installCatalogItem(content, name, scope, overwrite, undefined, workspaceRoot);
      setInstallCollision(false);
      setInstallOpen(false);
      setInstalled({ name, scope });
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
        <div class="space-y-4">
          <Show when={hasOrigin()}>
            <div class="inline-flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700">
              <button type="button" aria-pressed={reviewTab() === "template"} class={segmentClass(reviewTab() === "template")} onClick={() => setReviewTab("template")}>
                Template
              </button>
              <button type="button" aria-pressed={reviewTab() === "diff"} class={`border-l border-slate-300 dark:border-slate-700 ${segmentClass(reviewTab() === "diff")}`} onClick={() => setReviewTab("diff")}>
                Compare to original
              </button>
            </div>
          </Show>
          <Show when={hasOrigin() && reviewTab() === "diff"}>
            <TemplateDiffView
              state={props.originBaseline.state()}
              current={() => props.store.toTemplate()}
              onRefresh={() => {
                const ref = originRef();
                if (ref) props.originBaseline.refresh(ref);
              }}
              sidecarAvailable={props.sidecarAvailable}
            />
          </Show>
          <Show when={!hasOrigin() || reviewTab() === "template"}>
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
            onlineValidationDisabled={!props.sidecarAvailable()}
            onlineValidationRunning={props.onlineValidation.running()}
            onValidateOnline={requestOnlineValidation}
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
          <Show when={props.onlineValidation.running()}>
            <div class="my-3 flex items-center gap-3 rounded-xl border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100" role="status" aria-live="polite">
              <span class="size-4 animate-spin rounded-full border-2 border-sky-300 border-t-sky-700 dark:border-sky-800 dark:border-t-sky-200" aria-hidden="true" />
              <span><strong>Validating online…</strong> Checking this Template against Azure DevOps.</span>
            </div>
          </Show>
          <Show when={props.onlineValidation.error()}>
            <p class="ui-error my-3">{props.onlineValidation.error()}</p>
          </Show>
          <Show when={props.onlineValidation.result()}>
            {(validation) => (
              <section class={`my-3 rounded-xl border p-4 text-sm ${resultIsOutdated() ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30" : validation().result.valid ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30" : "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30"}`} aria-live="polite">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="font-semibold">Online Validation {resultIsOutdated() ? "— Outdated" : validation().result.valid ? "passed" : "found errors"}</p>
                  <div class="flex items-center gap-3"><span class="font-mono text-xs opacity-75">{validation().profile}</span><button type="button" class="text-xs font-semibold underline" onClick={props.onlineValidation.dismiss} aria-label="Dismiss Online Validation result">Dismiss</button></div>
                </div>
                <Show when={!validation().result.requirements.needsOnlineVerification && validation().result.valid}>
                  <p class="mt-2">Connected successfully. This Template has no platform-specific references to verify.</p>
                </Show>
                <Show when={validation().result.errors.length > 0}>
                  <div class="mt-3"><p class="font-semibold">Errors</p><ul class="mt-1 space-y-2"><For each={validation().result.errors}>{(item) => <li><code class="text-xs">{item.path}</code>{item.code ? ` · ${item.code}` : ""}<br />{item.message}</li>}</For></ul></div>
                </Show>
                <Show when={validation().result.warnings.length > 0}>
                  <div class="mt-3"><p class="font-semibold">Warnings</p><ul class="mt-1 space-y-2"><For each={validation().result.warnings}>{(item) => <li><code class="text-xs">{item.path}</code>{item.code ? ` · ${item.code}` : ""}<br />{item.message}</li>}</For></ul></div>
                </Show>
              </section>
            )}
          </Show>
          <pre class="overflow-x-auto rounded-b-xl bg-slate-950 p-5 leading-6 text-slate-100" style={{ "font-size": yamlFontSize() }}>
            <YamlCode value={props.store.serialise()} />
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
                  onlineValidationDisabled={!props.sidecarAvailable()}
                  onlineValidationRunning={props.onlineValidation.running()}
                  onValidateOnline={requestOnlineValidation}
                  trailing={
                    <button
                      type="button"
                      class="grid size-8 place-items-center rounded-md bg-slate-700 text-lg font-semibold text-white hover:bg-slate-600"
                      onClick={() => setYamlMaximized(false)}
                      aria-label="Exit expanded YAML preview"
                      title="Exit expanded YAML preview"
                    >
                      ⤡
                    </button>
                  }
                />
                <Show when={props.onlineValidation.running()}>
                  <div class="my-3 flex items-center gap-3 rounded-xl border border-sky-700 bg-sky-950/50 px-4 py-3 text-sm text-sky-100" role="status" aria-live="polite">
                    <span class="size-4 animate-spin rounded-full border-2 border-sky-700 border-t-sky-200" aria-hidden="true" />
                    <span><strong>Validating online…</strong> Checking this Template against Azure DevOps.</span>
                  </div>
                </Show>
                <Show when={props.onlineValidation.error()}>
                  <p class="ui-error my-3">{props.onlineValidation.error()}</p>
                </Show>
                <Show when={props.onlineValidation.result()}>
                  {(validation) => (
                    <section class={`my-3 rounded-xl border p-4 text-sm ${resultIsOutdated() ? "border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30" : validation().result.valid ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30" : "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30"}`} aria-live="polite">
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <p class="font-semibold">Online Validation {resultIsOutdated() ? "— Outdated" : validation().result.valid ? "passed" : "found errors"}</p>
                        <div class="flex items-center gap-3"><span class="font-mono text-xs opacity-75">{validation().profile}</span><button type="button" class="text-xs font-semibold underline" onClick={props.onlineValidation.dismiss} aria-label="Dismiss Online Validation result">Dismiss</button></div>
                      </div>
                      <Show when={!validation().result.requirements.needsOnlineVerification && validation().result.valid}>
                        <p class="mt-2">Connected successfully. This Template has no platform-specific references to verify.</p>
                      </Show>
                      <Show when={validation().result.errors.length > 0}>
                        <div class="mt-3"><p class="font-semibold">Errors</p><ul class="mt-1 space-y-2"><For each={validation().result.errors}>{(item) => <li><code class="text-xs">{item.path}</code>{item.code ? ` · ${item.code}` : ""}<br />{item.message}</li>}</For></ul></div>
                      </Show>
                      <Show when={validation().result.warnings.length > 0}>
                        <div class="mt-3"><p class="font-semibold">Warnings</p><ul class="mt-1 space-y-2"><For each={validation().result.warnings}>{(item) => <li><code class="text-xs">{item.path}</code>{item.code ? ` · ${item.code}` : ""}<br />{item.message}</li>}</For></ul></div>
                      </Show>
                    </section>
                  )}
                </Show>
              </div>
              <pre class="mx-auto min-h-0 w-full max-w-7xl flex-1 overflow-auto rounded-b-xl bg-slate-950 p-5 leading-6 text-slate-100" style={{ "font-size": yamlFontSize() }}><YamlCode value={props.store.serialise()} /></pre>
            </div>
          </Show>
          <Show when={downloadError()}>
            <p class="ui-error mt-3">{downloadError()}</p>
          </Show>
          <Show when={profilePickerOpen()}>
            <div class="fixed inset-0 z-[900] grid place-items-center bg-slate-950/50 p-5" role="presentation">
              <section class="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900" role="dialog" aria-modal="true" aria-labelledby="online-validation-profile-title">
                <h2 id="online-validation-profile-title" class="text-lg font-bold text-slate-950 dark:text-white">Choose a work project</h2>
                <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Online Validation needs a Connection Profile for this one run.</p>
                <Show when={props.grounding.profiles().length > 0} fallback={<div class="mt-5 rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800"><p>No Connection Profiles are available.</p><button type="button" class="mt-2 font-semibold text-indigo-700 hover:underline dark:text-indigo-300" onClick={() => { setProfilePickerOpen(false); props.onManageProjects(); }}>Manage work projects…</button></div>}>
                  <div class="mt-5 space-y-2"><For each={props.grounding.profiles()}>{(profile) => <button type="button" class="block w-full rounded-lg border border-slate-300 px-3 py-2 text-left text-sm font-semibold dark:border-slate-700" onClick={() => void runOnlineValidation(profile.name)}>{profile.project}<span class="ml-2 font-normal text-slate-500">{profile.team}</span></button>}</For></div>
                </Show>
                <div class="mt-5 flex justify-end"><button type="button" class="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold dark:border-slate-700" onClick={() => setProfilePickerOpen(false)}>Cancel</button></div>
              </section>
            </div>
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
                    <Show when={installScope() === "project"}>
                      <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">You’ll choose the project folder before installing.</p>
                    </Show>
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
