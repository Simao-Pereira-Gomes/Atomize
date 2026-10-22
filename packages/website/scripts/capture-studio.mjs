import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { TemplateLibrary } from "../../atomize-core/src/templates/template-library.ts";
import { inspectTemplate, runPreview } from "../../atomize-core/src/templates/template-inspector.ts";
import { resolveResponse } from "./capture-protocol.mjs";

const source = fileURLToPath(new URL("../../atomize-core/catalog/templates/backend-api.atomize.yaml", import.meta.url));
const { template } = await new TemplateLibrary().loadSource(source);
const story = { estimation: 8, type: "User Story" };
const data = {
  catalog: [{ name: "backend-api", displayName: template.name, description: template.description, kind: "template", ref: "template:backend-api", scope: "builtin", content: template }],
  inspect: inspectTemplate(template),
  preview: runPreview(template, JSON.stringify(story)),
  stories: [
    { id: "1201", title: "Add password reset", type: "User Story", state: "Active", areaPath: "Website" },
    { id: "1202", title: "Export account data", type: "User Story", state: "Active", areaPath: "Website" },
    { id: "1203", title: "Rate-limit sign-in attempts", type: "User Story", state: "New", areaPath: "Website" },
  ],
  profiles: [
    { name: "contoso-web", platform: "azure-devops", isDefault: true, organizationUrl: "https://dev.azure.com/contoso", project: "Website", team: "Web Team" },
    { name: "contoso-mobile", platform: "azure-devops", isDefault: false, organizationUrl: "https://dev.azure.com/contoso", project: "Mobile", team: "App Team" },
  ],
};
if (data.preview.tasks.length !== 3 || data.preview.estimationSummary.totalTaskEstimation !== 32) throw Error("Refresh the walkthrough: the built-in Template's expected result changed.");
const debuggerPort = process.env.ATOMIZE_STUDIO_DEBUG_PORT ?? "9230";
const targets = await (await fetch(`http://127.0.0.1:${debuggerPort}/json`)).json();
const socket = new WebSocket(targets.find(target => target.type === "page").webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener("open", resolve, { once: true }));
let nextId = 0;
const pending = new Map();
socket.addEventListener("message", event => {
  const message = JSON.parse(event.data);
  resolveResponse(pending, message);
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
      // Fictional profiles, shown only in the connection capture; no token or real organization is involved.
      if (command === 'connection_list_profiles') return sessionStorage.getItem('atomize-docs-profiles') ? data.profiles : [];
      if (command === 'catalog_list_items') return data.catalog;
      if (command === 'grounding_load' && args.profile === 'contoso-web') return { workItemTypes: ['User Story'], teams: ['Web Team'], areaPaths: ['Website'], iterationPaths: ['Website'] };
      if (command === 'generate_query_stories' && args.source === 'template:backend-api') return { stories: data.stories };
      if (command === 'generate_run' && args.source === 'template:backend-api') {
        // The capture stops at confirmation; anything other than a dry run of the two picked Stories is a script error.
        if (args.dryRun !== true || args.scope?.kind !== 'stories' || args.scope.storyIds.join() !== '1201,1202') throw Error('Screenshot run must be the documented dry run');
        // atomize-core's dry-run shape: planned Tasks are reported as tasksCalculated and nothing as created.
        const results = data.stories.slice(0, 2).map(story => ({ story, success: true, tasksCreated: [], estimateUnit: data.preview.estimateUnit, tasksCalculated: data.preview.tasks.map(task => ({ title: task.title, estimation: task.estimation })) }));
        return { report: { storiesProcessed: 2, storiesSuccess: 2, storiesFailed: 0, tasksCreated: 0, tasksCalculated: results.length * data.preview.tasks.length, results } };
      }
      if (command === 'preview_inspect' && args.source === 'template:backend-api') return data.inspect;
      if (command === 'preview_mock_story' && args.source === 'template:backend-api') {
        const story = JSON.parse(args.mockStory);
        if(story.estimation !== 8 || story.type !== 'User Story') throw Error('Screenshot inputs do not match the documented Mock Story');
        return data.preview;
      }
      throw Error('Unexpected screenshot IPC command: ' + command);
    }};
  ` });
  preloadId = preload.identifier;
  // Studio takes its initial theme from the colour scheme; the portal shows the matching capture.
  for (const mode of ["light", "dark"]) await captureFlow(mode);
  for (const mode of ["light", "dark"]) await captureConnections(mode);
  for (const mode of ["light", "dark"]) await captureLiveConfirmation(mode);
  console.log("Captured Studio authoring, Mock Preview, Connection Profile management, and Live Execution Confirmation in light and dark from current UI with core-generated offline data.");
} finally {
  if (preloadId) await cdp("Page.removeScriptToEvaluateOnNewDocument", { identifier: preloadId }).catch(() => {});
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
  await waitFor(`document.body.innerText.includes('Define API Behavior')`);
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
  await waitFor(`document.body.innerText.includes('Define API Behavior: Mock Story') && document.body.innerText.includes('3 tasks')`);
  await capture(`mock-preview-${mode}`);
}

async function captureConnections(mode) {
  await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: mode }, { name: "prefers-reduced-motion", value: "reduce" }] });
  await cdp("Page.navigate", { url: "http://127.0.0.1:1423/" });
  await waitFor(`document.documentElement.dataset.theme === ${JSON.stringify(mode)}`);
  await evaluate(`sessionStorage.setItem('atomize-docs-profiles', '1'); location.reload()`);
  await waitFor(`!!sessionStorage.getItem('atomize-docs-profiles') && [...document.querySelectorAll('button')].some(button => button.textContent.includes('Global Settings'))`);
  await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent.includes('Global Settings')).click()`);
  await waitFor(`[...document.querySelectorAll('button')].some(button => button.textContent.includes('Work project'))`);
  await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent.includes('Work project') && !button.textContent.includes('Global')).click()`);
  await waitFor(`[...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Manage projects…')`);
  await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Manage projects…').click()`);
  await waitFor(`document.body.innerText.includes('Manage work projects') && document.body.innerText.includes('Change token') && document.body.innerText.includes('https://dev.azure.com/contoso')`);
  await capture(`connection-profiles-${mode}`);
  await evaluate(`sessionStorage.removeItem('atomize-docs-profiles')`);
}

function clickButton(text) {
  return evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent.includes(${JSON.stringify(text)})).click()`);
}
function hasButton(text) {
  return `[...document.querySelectorAll('button')].some(button => button.textContent.includes(${JSON.stringify(text)}))`;
}

async function captureLiveConfirmation(mode) {
  await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: mode }, { name: "prefers-reduced-motion", value: "reduce" }] });
  await cdp("Page.navigate", { url: "http://127.0.0.1:1423/" });
  await waitFor(`document.documentElement.dataset.theme === ${JSON.stringify(mode)}`);
  await evaluate(`sessionStorage.setItem('atomize-docs-profiles', '1'); location.reload()`);
  await waitFor(`!!sessionStorage.getItem('atomize-docs-profiles') && ${hasButton("Global Settings")}`);
  await clickButton("Global Settings");
  await waitFor(hasButton("Work project"));
  await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent.includes('Work project') && !button.textContent.includes('Global')).click()`);
  await waitFor(hasButton("contoso-web"));
  await clickButton("contoso-web");
  await waitFor(`!${hasButton("Connecting…")}`);
  await clickButton("Global Settings");
  await waitFor(`!document.body.innerText.includes('WORK PROJECT') && !document.body.textContent.includes('Toggle light/dark mode')`);
  await evaluate(`document.querySelector('button[aria-label="Generate"]').click()`);
  await waitFor(hasButton("Backend API Development"));
  await clickButton("Backend API Development");
  await waitFor(hasButton("Live"));
  await clickButton("🚀 Live");
  await waitFor(hasButton("Browse Stories"));
  await clickButton("Browse Stories");
  await waitFor(`document.body.innerText.includes('Export account data')`);
  await evaluate(`(() => {
    for (const label of document.querySelectorAll('label')) if (/^(1201|1202) ·/.test(label.innerText.trim())) label.querySelector('input').click();
  })()`);
  await waitFor(`document.body.innerText.includes('2 selected')`);
  await clickButton("Continue →");
  await waitFor(`document.body.innerText.includes('DRY RUN: nothing has been created yet') && document.body.innerText.includes('2 Stories · 6 Tasks total')`);
  await clickButton("Continue to Execute");
  await waitFor(`document.body.textContent.includes('Live Execution Confirmation') && document.body.textContent.includes('2 Stories selected')`);
  await capture(`live-execution-confirmation-${mode}`);
  await evaluate(`sessionStorage.removeItem('atomize-docs-profiles')`);
}
