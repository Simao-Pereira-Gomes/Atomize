import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { TemplateLibrary } from "../../atomize-core/src/templates/template-library.ts";
import { inspectTemplate, runPreview } from "../../atomize-core/src/templates/template-inspector.ts";

const source = fileURLToPath(new URL("../../atomize-core/catalog/templates/backend-api.atomize.yaml", import.meta.url));
const { template } = await new TemplateLibrary().loadSource(source);
const story = { estimation: 8, tags: ["backend"], type: "User Story", state: "Active" };
const data = {
  catalog: [{ name: "backend-api", displayName: template.name, description: template.description, kind: "template", ref: "template:backend-api", scope: "builtin", content: template }],
  inspect: inspectTemplate(template),
  preview: runPreview(template, JSON.stringify(story)),
};
if (data.preview.tasks.length !== 6 || data.preview.estimationSummary.totalTaskEstimation !== 8) throw Error("Refresh the walkthrough: the built-in Template's expected result changed.");
const debuggerPort = process.env.ATOMIZE_STUDIO_DEBUG_PORT ?? "9230";
const targets = await (await fetch(`http://127.0.0.1:${debuggerPort}/json`)).json();
const socket = new WebSocket(targets.find(target => target.type === "page").webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener("open", resolve, { once: true }));
let nextId = 0;
const pending = new Map();
socket.addEventListener("message", event => {
  const message = JSON.parse(event.data);
  if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
});
async function cdp(method, params = {}) {
  const id = ++nextId;
  const response = new Promise(resolve => pending.set(id, resolve));
  socket.send(JSON.stringify({ id, method, params }));
  const result = await response;
  if (result.error) throw Error(JSON.stringify(result.error));
  return result.result;
}
async function evaluate(expression) {
  const result = await cdp("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function waitFor(expression) {
  for (let i = 0; i < 100; i++) {
    if (await evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw Error(`Studio did not reach: ${expression}`);
}
const directory = fileURLToPath(new URL("../public/studio/", import.meta.url));
await mkdir(directory, { recursive: true });
async function capture(name) {
  const result = await cdp("Page.captureScreenshot", { format: "png" });
  await writeFile(`${directory}${name}.png`, Buffer.from(result.data, "base64"));
}
let preloadId;
try {
  await cdp("Page.enable");
  await cdp("Runtime.enable");
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  // Studio formats numbers and dates in the runtime locale; pin it so captures match the British-English docs on any machine.
  await cdp("Emulation.setLocaleOverride", { locale: "en-GB" });
  const preload = await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `
    localStorage.clear();
    const data = ${JSON.stringify(data)};
    window.__TAURI_INTERNALS__ = { invoke: async (command, args) => {
      if (command === 'sidecar_fatal') return false;
      if (command === 'connection_list_profiles') return [];
      if (command === 'catalog_list_items') return data.catalog;
      if (command === 'preview_inspect' && args.source === 'template:backend-api') return data.inspect;
      if (command === 'preview_mock_story' && args.source === 'template:backend-api') {
        const story = JSON.parse(args.mockStory);
        if(story.estimation !== 8 || story.type !== 'User Story' || story.state !== 'Active' || story.tags?.[0] !== 'backend') throw Error('Screenshot inputs do not match the documented Mock Story');
        return data.preview;
      }
      throw Error('Unexpected screenshot IPC command: ' + command);
    }};
  ` });
  preloadId = preload.identifier;
  // Studio takes its initial theme from the colour scheme; the portal shows the matching capture.
  for (const mode of ["light", "dark"]) await captureFlow(mode);
  console.log("Captured Studio authoring and Mock Preview in light and dark from current UI with core-generated offline data.");
} finally {
  if (preloadId) await cdp("Page.removeScriptToEvaluateOnNewDocument", { identifier: preloadId });
  socket.close();
}

async function captureFlow(mode) {
  await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: mode }, { name: "prefers-reduced-motion", value: "reduce" }] });
  await cdp("Page.navigate", { url: "http://127.0.0.1:1423/" });
  await waitFor(`document.documentElement.dataset.theme === ${JSON.stringify(mode)}`);
  await waitFor(`!!document.querySelector('button[aria-label="Catalog"]')`);
  await evaluate(`document.querySelector('button[aria-label="Catalog"]').click()`);
  await waitFor(`[...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Clone')`);
  await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Clone').click()`);
  await waitFor(`!!document.querySelector('button[aria-label^="Tasks:"]')`);
  await evaluate(`document.querySelector('button[aria-label^="Tasks:"]').click()`);
  await waitFor(`document.body.innerText.includes('Design API Endpoints')`);
  await capture(`template-authoring-${mode}`);
  await evaluate(`document.querySelector('button[aria-label="Generate"]').click()`);
  await waitFor(`[...document.querySelectorAll('button')].some(button => button.textContent.includes('Backend API Development'))`);
  await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent.includes('Backend API Development')).click()`);
  await waitFor(`document.body.innerText.includes('Mock Story inputs')`);
  await evaluate(`(() => {
    const values = ${JSON.stringify(story)};
    for(const label of document.querySelectorAll('label')) {
      const name = label.firstChild?.textContent.trim();
      if(!(name in values)) continue;
      const input = label.querySelector('input');
      input.value = String(values[name]); input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Run Mock Preview').click();
  })()`);
  await waitFor(`document.body.innerText.includes('Design API Endpoints: Mock Story') && document.body.innerText.includes('6 tasks')`);
  await capture(`mock-preview-${mode}`);
}
