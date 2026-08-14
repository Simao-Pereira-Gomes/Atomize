import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { StudioShell } from "./components/StudioShell";
import "./App.css";

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
    <StudioShell sidecarAvailable={() => !fatal()} />
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
  if (import.meta.env.DEV && params.get("diagnostic") === "builder") {
    // Bypasses only the sidecar_fatal companion-process check; still goes through the
    // real shell (rail, Global Settings) so this diagnostic route exercises production UI.
    return <StudioShell sidecarAvailable={() => true} diagnosticInitialSection="tasks" />;
  }
  return <StudioApplication />;
}

export default App;
