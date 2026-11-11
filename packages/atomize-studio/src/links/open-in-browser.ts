import { isTauri as runningInTauri } from "@tauri-apps/api/core";

type OpenDeps = {
  isTauri: () => boolean;
  openUrl: (url: string) => Promise<void>;
  windowOpen: (url: string, target: string, features: string) => unknown;
};

const defaultDeps: OpenDeps = {
  isTauri: runningInTauri,
  openUrl: async (url) => {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  },
  windowOpen: (url, target, features) => window.open(url, target, features),
};

/**
 * Opens `url` in the system browser. In the desktop app that takes the opener plugin: a plain
 * link or `window.open` would load the page inside Studio's own window. Outside Tauri (`vite:dev`
 * in a browser tab) it opens a new tab.
 */
export async function openInBrowser(url: string, deps: OpenDeps = defaultDeps): Promise<void> {
  if (deps.isTauri()) await deps.openUrl(url);
  else deps.windowOpen(url, "_blank", "noopener,noreferrer");
}
