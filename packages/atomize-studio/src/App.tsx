import { createSignal, onCleanup, onMount, Show, type Accessor } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { StartingPathPicker } from "./components/StartingPathPicker";
import { AtomizeStudio } from "./components/AtomizeStudio";
import { TaskWidgetsPrototype } from "./components/prototypes/TaskWidgetsPrototype";
import { type CatalogTemplateItem, toCatalogClone } from "./starting-paths/catalog-clone";
import { createAuthoringStore } from "./stores/sections";
import "./App.css";

function StudioFlow(props: { sidecarAvailable: Accessor<boolean> }) {
  const [surface, setSurface] = createSignal<"starting-paths" | "builder">("starting-paths");
  const stores = createAuthoringStore();
  const startScratch = () => { stores.reset(); setSurface("builder"); };
  const startCatalogClone = (item: CatalogTemplateItem) => { stores.loadTemplate(toCatalogClone(item)); setSurface("builder"); };
  const changeStartingPath = () => { stores.reset(); setSurface("starting-paths"); };

  return <Show when={surface() === "builder"} fallback={<StartingPathPicker onScratch={startScratch} onCatalogClone={startCatalogClone} catalogAvailable={props.sidecarAvailable} />}>
    <AtomizeStudio stores={stores} onChangeStartingPath={changeStartingPath} sidecarAvailable={props.sidecarAvailable} />
  </Show>;
}

function StudioApplication() {
  const [fatal, setFatal] = createSignal(false);
  const refresh = async () => setFatal(await invoke<boolean>("sidecar_fatal").catch(() => false));
  onMount(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1000);
    onCleanup(() => window.clearInterval(timer));
  });
  const retry = async () => { await invoke("retry_sidecar"); await refresh(); };

  return <>
    <StudioFlow sidecarAvailable={() => !fatal()} />
    <Show when={fatal()}>
      <aside class="fixed inset-x-4 bottom-4 z-[60] mx-auto max-w-xl rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950 shadow-2xl dark:border-amber-700 dark:bg-amber-950 dark:text-amber-50" aria-live="assertive" role="alert">
        <p class="font-bold">Companion process unavailable</p>
        <p class="mt-1 text-sm">Offline authoring and Connection Profile management remain available. Catalog Clone and grounding will resume after recovery.</p>
        <button class="mt-3 rounded-lg !border-0 !bg-amber-700 px-4 py-2 text-sm font-semibold !text-white !shadow-none hover:!bg-amber-800" type="button" onClick={() => void retry()}>Retry</button>
      </aside>
    </Show>
  </>;
}

function App() {
  const params = new URLSearchParams(window.location.search);
  if (import.meta.env.DEV && params.get("prototype") === "task-widgets") return <TaskWidgetsPrototype />;
  if (import.meta.env.DEV && params.get("diagnostic") === "builder") {
    const stores = createAuthoringStore();
    return <AtomizeStudio stores={stores} onChangeStartingPath={() => stores.reset()} initialSection="tasks" sidecarAvailable={() => true} />;
  }
  return <StudioApplication />;
}

export default App;
