import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { openInBrowser } from "../open-in-browser";

describe("openInBrowser", () => {
  it("in the desktop app, opens the link in the system browser through the opener plugin", async () => {
    const openUrl = vi.fn(async () => undefined);
    const windowOpen = vi.fn();

    await openInBrowser("https://dev.azure.com/org/P/_workitems/edit/5001", { isTauri: () => true, openUrl, windowOpen });

    expect(openUrl).toHaveBeenCalledWith("https://dev.azure.com/org/P/_workitems/edit/5001");
    expect(windowOpen).not.toHaveBeenCalled();
  });

  it("in a plain browser tab (vite:dev), opens a new tab", async () => {
    const openUrl = vi.fn(async () => undefined);
    const windowOpen = vi.fn();

    await openInBrowser("https://example.com", { isTauri: () => false, openUrl, windowOpen });

    expect(windowOpen).toHaveBeenCalledWith("https://example.com", "_blank", "noopener,noreferrer");
    expect(openUrl).not.toHaveBeenCalled();
  });
});

describe("Studio components", () => {
  // Tauri opens a target="_blank" link inside the app's own window, not the system browser.
  it("open external links through ExternalLink, never a bare target=_blank anchor", () => {
    const dir = join(__dirname, "../../components");
    const offenders = readdirSync(dir, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".tsx"))
      .filter((file) => readFileSync(join(dir, file), "utf8").includes('target="_blank"'));
    expect(offenders).toEqual([]);
  });
});
