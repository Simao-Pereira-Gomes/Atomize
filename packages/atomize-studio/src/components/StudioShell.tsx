import type { TaskTemplate } from "@sppg2001/atomize-schema";
import { type Accessor, createSignal, For, onMount, Show } from "solid-js";
import type { CatalogItem } from "../catalog/catalog-item";
import { addAzureDevOpsProfile, removeConnectionProfile, rotateAzureDevOpsToken, setDefaultConnectionProfile } from "../connections/connection-client";
import {
  type AzureDevOpsProfile,
  type GroundedFieldOptions,
  listAzureDevOpsProfiles,
  loadGroundedFieldOptions,
} from "../grounding/grounding-service";
import { toCatalogClone } from "../starting-paths/catalog-clone";
import { createAuthoringStore, type SectionId } from "../stores/sections";
import { STUDIO_AREAS, type StudioAreaId } from "../stores/studio-areas";
import { AreaPlaceholder } from "./AreaPlaceholder";
import { AtomizeStudio } from "./AtomizeStudio";
import { CatalogArea } from "./CatalogArea";
import { type GroundingSession, GroundingSettings } from "./GroundingSettings";
import { StartingPathPicker } from "./StartingPathPicker";

function AreaRail(props: { active: StudioAreaId; onSelect: (id: StudioAreaId) => void; collapsed: boolean; onToggleCollapsed: () => void }) {
  return (
    <nav
      class={`flex shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-150 dark:border-slate-800 dark:bg-slate-900 ${props.collapsed ? "w-16 items-center py-4" : "w-56 p-3"}`}
    >
      <button
        type="button"
        title={props.collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-label={props.collapsed ? "Expand sidebar" : "Collapse sidebar"}
        class={`mb-2 grid place-items-center rounded-xl !border-0 !bg-transparent text-slate-400 !shadow-none hover:!bg-slate-100 dark:hover:!bg-slate-800 ${props.collapsed ? "size-11 self-center" : "size-9 self-end"}`}
        onClick={props.onToggleCollapsed}
      >
        {props.collapsed ? "»" : "«"}
      </button>
      <div class={`flex flex-col gap-1 ${props.collapsed ? "items-center" : ""}`}>
        <For each={STUDIO_AREAS}>
          {(area) => (
            <button
              type="button"
              title={props.collapsed ? area.label : undefined}
              aria-label={area.label}
              class={`flex items-center rounded-xl !border-0 !shadow-none transition ${props.collapsed ? "size-11 justify-center" : "gap-3 px-3 py-3 text-left"} ${props.active === area.id ? "!bg-indigo-50 font-semibold text-indigo-700 dark:!bg-indigo-950/60 dark:text-indigo-200" : "!bg-transparent text-slate-600 hover:!bg-slate-100 dark:text-slate-300 dark:hover:!bg-slate-800"}`}
              onClick={() => props.onSelect(area.id)}
            >
              <span class="text-lg">{area.icon}</span>
              <Show when={!props.collapsed}>
                <span class="text-sm">{area.label}</span>
              </Show>
            </button>
          )}
        </For>
      </div>
    </nav>
  );
}

function ShellHeader(props: { grounding: GroundingSession; sidecarAvailable: Accessor<boolean>; theme: Accessor<"light" | "dark">; onToggleTheme: () => void }) {
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  return (
    <header class="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900 sm:px-7">
      <div class="flex min-w-0 items-center gap-3">
        <div class="grid size-8 shrink-0 place-items-center rounded-lg bg-indigo-600 text-sm font-black text-white">A</div>
        <div class="min-w-0">
          <p class="truncate font-semibold tracking-tight text-slate-950 dark:text-white">Atomize</p>
          <p class="hidden text-xs text-slate-500 dark:text-slate-400 sm:block">Atomize Studio</p>
        </div>
      </div>
      <div class="relative">
        <button
          class="flex items-center gap-2 rounded-xl !border-0 !bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 !shadow-none hover:!bg-slate-200 dark:!bg-slate-800 dark:text-slate-200 dark:hover:!bg-slate-700"
          type="button"
          onClick={() => setSettingsOpen((value) => !value)}
          aria-expanded={settingsOpen()}
        >
          ⚙ Global Settings
        </button>
        <Show when={settingsOpen()}>
          <div class="absolute right-0 top-12 z-50 w-72 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div>
              <p class="mb-2 text-xs font-bold tracking-widest text-slate-400 uppercase">Work project</p>
              <GroundingSettings session={props.grounding} sidecarAvailable={props.sidecarAvailable} />
            </div>
            <div class="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
              <span class="text-sm text-slate-600 dark:text-slate-300">Theme</span>
              <button
                class="grid size-9 place-items-center rounded-lg !border-0 !bg-slate-100 text-slate-600 !shadow-none hover:!bg-slate-200 dark:!bg-slate-800 dark:text-slate-300 dark:hover:!bg-slate-700"
                type="button"
                onClick={props.onToggleTheme}
                title="Toggle light/dark mode"
                aria-label="Toggle light/dark mode"
              >
                {props.theme() === "dark" ? "☀" : "☾"}
              </button>
            </div>
          </div>
        </Show>
      </div>
    </header>
  );
}

export function StudioShell(props: { sidecarAvailable: Accessor<boolean>; diagnosticInitialSection?: SectionId }) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const [theme, setTheme] = createSignal<"light" | "dark">(prefersDark ? "dark" : "light");
  const toggleTheme = () => setTheme((value) => (value === "dark" ? "light" : "dark"));

  const [activeArea, setActiveArea] = createSignal<StudioAreaId>("templates");
  const [railCollapsed, setRailCollapsed] = createSignal(false);

  const [surface, setSurface] = createSignal<"starting-paths" | "builder">(props.diagnosticInitialSection ? "builder" : "starting-paths");
  const [isAIDraft, setIsAIDraft] = createSignal(false);
  const [openFilePath, setOpenFilePath] = createSignal<string>();
  const stores = createAuthoringStore();

  const [profiles, setProfiles] = createSignal<AzureDevOpsProfile[]>([]);
  const [grounded, setGrounded] = createSignal<GroundedFieldOptions>();
  const [selectedProfile, setSelectedProfile] = createSignal("");
  const [groundingState, setGroundingState] = createSignal<"idle" | "loading" | "ready" | "error">("idle");
  const [groundingError, setGroundingError] = createSignal("");

  onMount(async () => {
    try { setProfiles(await listAzureDevOpsProfiles()); } catch { /* Connecting is optional. */ }
  });

  const loadGrounding = async (profile = selectedProfile()) => {
    if (!profile) { setGrounded(undefined); setGroundingState("idle"); return true; }
    if (!props.sidecarAvailable()) { setGroundingState("error"); setGroundingError("Grounding is unavailable while the companion process recovers."); return false; }
    setGroundingState("loading"); setGroundingError("");
    try { setGrounded(await loadGroundedFieldOptions(profile)); setGroundingState("ready"); return true; }
    catch (error) { setGroundingState("error"); setGroundingError(error instanceof Error ? error.message : "We could not get project choices right now."); return false; }
  };
  const grounding: GroundingSession = {
    profiles,
    selectedProfile,
    options: grounded,
    state: groundingState,
    error: groundingError,
    selectProfile: async (profile) => { setSelectedProfile(profile); return loadGrounding(profile); },
    refresh: () => loadGrounding(),
    addProject: async (project) => {
      await addAzureDevOpsProfile(project);
      const available = await listAzureDevOpsProfiles();
      setProfiles(available);
      setSelectedProfile(project.name);
      await loadGrounding(project.name);
    },
    rotateToken: async (name, pat) => { await rotateAzureDevOpsToken(name, pat); },
    setDefault: async (name) => { await setDefaultConnectionProfile(name); setProfiles(await listAzureDevOpsProfiles()); },
    removeProject: async (name) => {
      await removeConnectionProfile(name);
      const available = await listAzureDevOpsProfiles();
      setProfiles(available);
      if (selectedProfile() === name) { setSelectedProfile(""); setGrounded(undefined); setGroundingState("idle"); }
    },
  };

  const startScratch = () => { setIsAIDraft(false); setOpenFilePath(undefined); stores.reset(); setSurface("builder"); };
  const startCatalogClone = (item: Extract<CatalogItem, { kind: "template" }>) => { setIsAIDraft(false); setOpenFilePath(undefined); stores.loadTemplate(toCatalogClone(item)); setSurface("builder"); };
  const startAIDraft = (template: TaskTemplate, workProject: string, groundingOptions?: GroundedFieldOptions) => {
    setIsAIDraft(true);
    setOpenFilePath(undefined);
    stores.loadTemplate(template);
    if (workProject) {
      setSelectedProfile(workProject);
      // The AI draft flow already resolved this profile's token and fetched grounding once;
      // reuse that result instead of triggering a second OS credential-store read here.
      if (groundingOptions) { setGrounded(groundingOptions); setGroundingState("ready"); }
      else void loadGrounding(workProject);
    }
    setSurface("builder");
  };
  const startOpen = (template: TaskTemplate, path: string) => { setIsAIDraft(false); setOpenFilePath(path); stores.loadTemplate(template); setSurface("builder"); };
  const changeStartingPath = () => { setIsAIDraft(false); setOpenFilePath(undefined); stores.reset(); setSurface("starting-paths"); };

  return (
    <div class={`min-h-screen bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100 ${theme() === "dark" ? "dark" : ""}`} data-theme={theme()}>
      <ShellHeader grounding={grounding} sidecarAvailable={props.sidecarAvailable} theme={theme} onToggleTheme={toggleTheme} />
      <div class="flex min-h-[calc(100vh-4.5rem)]">
        <AreaRail active={activeArea()} onSelect={setActiveArea} collapsed={railCollapsed()} onToggleCollapsed={() => setRailCollapsed((value) => !value)} />
        <div class="min-w-0 flex-1">
          <Show when={activeArea() === "templates"}>
            <Show
              when={surface() === "builder"}
              fallback={<StartingPathPicker onScratch={startScratch} onCatalogClone={startCatalogClone} onAIDraft={startAIDraft} onOpen={startOpen} catalogAvailable={props.sidecarAvailable} />}
            >
              <AtomizeStudio
                stores={stores}
                onChangeStartingPath={changeStartingPath}
                initialSection={props.diagnosticInitialSection}
                aiDraftReady={isAIDraft()}
                openFilePath={openFilePath()}
                grounding={grounding}
              />
            </Show>
          </Show>
          <For each={STUDIO_AREAS.filter((area) => area.id === "generate")}>
            {(area) => (
              <Show when={activeArea() === area.id}>
                <AreaPlaceholder icon={area.icon} label={area.label} description={area.description} />
              </Show>
            )}
          </For>
          <Show when={activeArea() === "catalog"}>
            <CatalogArea sidecarAvailable={props.sidecarAvailable} />
          </Show>
        </div>
      </div>
    </div>
  );
}
