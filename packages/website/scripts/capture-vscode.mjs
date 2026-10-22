import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { codeLiteral, resolveResponse } from "./capture-protocol.mjs";

const debuggerPort = process.env.ATOMIZE_VSCODE_DEBUG_PORT ?? "9234";
const targets = await (await fetch(`http://127.0.0.1:${debuggerPort}/json`)).json();
const target = targets.find(target => target.type === "page" && target.url.startsWith("vscode-file:"));
if (!target) throw Error(`Start the isolated Extension Development Host on debugger port ${debuggerPort} first.`);
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener("open", resolve, { once: true }));
let nextId = 0;
const pending = new Map();
const contexts = new Map();
socket.addEventListener("message", event => {
  const message = JSON.parse(event.data);
  resolveResponse(pending, message);
  const session = message.sessionId ?? "root";
  if (message.method === "Runtime.executionContextCreated") contexts.set(`${session}:${message.params.context.id}`, { ...message.params.context, sessionId: message.sessionId });
  if (message.method === "Runtime.executionContextDestroyed") contexts.delete(`${session}:${message.params.executionContextId}`);
  if (message.method === "Runtime.executionContextsCleared") {
    for (const [key, context] of contexts) if (context.sessionId === message.sessionId) contexts.delete(key);
  }
  if (message.method === "Target.attachedToTarget") void cdp("Runtime.enable", {}, message.params.sessionId).catch(() => {});
});
async function cdp(method, params = {}, sessionId) {
  const id = ++nextId;
  const response = new Promise(resolve => pending.set(id, resolve));
  socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  const result = await response;
  if (result.error) throw Error(JSON.stringify(result.error));
  return result.result;
}
async function evaluate(expression, context) {
  const result = await cdp("Runtime.evaluate", { expression, ...(context ? { contextId: context.id } : {}), returnByValue: true, awaitPromise: true }, context?.sessionId);
  if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(expression) {
  for (let i = 0; i < 150; i++) {
    if (await evaluate(expression)) return;
    await pause(100);
  }
  throw Error(`VS Code did not reach: ${expression}`);
}
async function webviewContext(expression) {
  for (let i = 0; i < 150; i++) {
    for (const context of contexts.values()) {
      if (!context.auxData?.isDefault) continue;
      try { if (await evaluate(expression, context)) return context; } catch {}
    }
    await pause(100);
  }
  throw Error(`VS Code webview did not reach: ${expression}`);
}
async function key(key, code, windowsVirtualKeyCode) {
  await cdp("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode });
  await cdp("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode });
}
async function command(label) {
  await key("F1", "F1", 112);
  await waitFor(`!!document.querySelector('.quick-input-widget input')?.getClientRects().length`);
  await cdp("Input.insertText", { text: label });
  await pause(350);
  await key("Enter", "Enter", 13);
}
const directory = fileURLToPath(new URL("../public/vscode/", import.meta.url));
await mkdir(directory, { recursive: true });
async function capture(name, clip = { x: 0, y: 32, width: 1440, height: 946 }) {
  await evaluate(`[...document.querySelectorAll('.notifications-toasts .codicon-close')].forEach(icon => icon.closest('a, button')?.click())`);
  await pause(600);
  const { data } = await cdp("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 } });
  await writeFile(`${directory}${name}.png`, Buffer.from(data, "base64"));
}
try {
  await cdp("Runtime.enable");
  await cdp("Page.enable");
  await cdp("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  if (await evaluate(`document.querySelector('.part.sidebar')?.getBoundingClientRect().width > 0`)) await command("View: Toggle Primary Side Bar Visibility");
  if (await evaluate(`document.querySelector('.part.auxiliarybar')?.getBoundingClientRect().width > 0`)) await command("View: Toggle Secondary Side Bar Visibility");
  // The portal shows the screenshot matching its selected theme; Catppuccin matches its code blocks.
  for (const [mode, theme] of [["light", "Catppuccin Latte"], ["dark", "Catppuccin Mocha"]]) await captureFlow(mode, theme);
  await addDocumentationProfiles();
  for (const [mode, theme] of [["light", "Catppuccin Latte"], ["dark", "Catppuccin Mocha"]]) await captureConnections(mode, theme);
  for (const [mode, theme] of [["light", "Catppuccin Latte"], ["dark", "Catppuccin Mocha"]]) await captureGenerate(mode, theme);
} finally {
  await cdp("Target.setAutoAttach", { autoAttach: false, waitForDebuggerOnStart: false, flatten: true });
  socket.close();
}

async function selectTheme(mode, theme) {
  // Recently used commands can outrank the exact match, so choose the row by its label.
  await key("F1", "F1", 112);
  await waitFor(`!!document.querySelector('.quick-input-widget input')?.getClientRects().length`);
  await cdp("Input.insertText", { text: "Preferences: Color Theme" });
  const themeCommand = `[...document.querySelectorAll('.quick-input-list .monaco-list-row')].find(row => row.querySelector('.label-name')?.textContent === 'Preferences: Color Theme')`;
  await waitFor(`!!${themeCommand}`);
  await evaluate(`${themeCommand}.click()`);
  await waitFor(`document.querySelector('.quick-input-widget input')?.placeholder.includes('Select Color Theme')`);
  await cdp("Input.insertText", { text: theme });
  await waitFor(`document.querySelector('.quick-input-list .monaco-list-row.focused')?.textContent.includes(${JSON.stringify(theme)})`);
  await key("Enter", "Enter", 13);
  await waitFor(`document.querySelector('.monaco-workbench')?.classList.contains(${JSON.stringify(mode === "dark" ? "vs-dark" : "vs")})`);
}

async function openBuiltInTemplate() {
  await command("View: Close All Editors");
  await command("Atomize: Browse Catalog");
  await waitFor(`document.querySelector('.quick-input-title')?.textContent.includes('Browse Catalog')`);
  await cdp("Input.insertText", { text: "Backend API Development" });
  await waitFor(`!!document.querySelector('.quick-input-list .codicon-go-to-file')`);
  await evaluate(`document.querySelector('.quick-input-list .codicon-go-to-file').closest('a, button').click()`);
  await waitFor(`document.querySelector('.monaco-editor')?.textContent.replace(/\\s+/g, ' ').includes('Backend API Development')`);
}

async function captureFlow(mode, theme) {
  await selectTheme(mode, theme);
  await openBuiltInTemplate();
  await waitFor(`document.body.innerText.includes('Atomize: Preview (Mock)')`);
  await capture(`template-authoring-${mode}`);
  console.log(`Captured the real Catalog Template editor and CodeLens in ${theme}.`);
  await command("Atomize: Preview (Mock)");
  const formContext = await webviewContext(`!!document.querySelector('input[data-field="estimation"]')`);
  await evaluate(`(() => {
    const values = { estimation: '8', type: 'User Story' };
    for(const [name,value] of Object.entries(values)) document.querySelector('[data-field="'+name+'"]').value = value;
    document.querySelector('form').requestSubmit();
  })()`, formContext);
  const resultsContext = await webviewContext(`document.body.innerText.includes('Define API Behavior: Mock Story')`);
  const result = await evaluate(`document.body.innerText`, resultsContext);
  if (!result.includes("Verify API Behavior") || !/3\s+Tasks/.test(result) || !result.includes("32 hours") || !result.includes("100%")) throw Error("Review the expected three-Task, 32-hour result before refreshing screenshots.");
  await capture(`mock-preview-${mode}`);
  console.log(`Captured the real Mock Preview Panel using the extension's in-process engine in ${theme}.`);
}

function quickRow(label) {
  return `[...document.querySelectorAll('.quick-input-list .monaco-list-row')].find(row => row.querySelector('.label-name')?.textContent.trim() === ${codeLiteral(label)})`;
}

async function openManageProfiles() {
  await command("Atomize: Manage Profiles");
  await waitFor(`document.querySelector('.quick-input-title')?.textContent.includes('Atomize: Manage Profiles') && !!${quickRow("Add profile...")}`);
}

// Fictional profiles in the isolated host; the placeholder token is never sent anywhere, and no profile is tested.
async function addDocumentationProfiles() {
  for (const profile of [["contoso-web", "Website", "Web Team"], ["contoso-mobile", "Mobile", "App Team"]]) {
    await openManageProfiles();
    if (await evaluate(`!!${quickRow(profile[0])}`)) { await key("Escape", "Escape", 27); continue; }
    await evaluate(`${quickRow("Add profile...")}.click()`);
    for (const [prompt, value] of [["Profile name", profile[0]], ["Azure DevOps organization URL", "https://dev.azure.com/contoso"], ["Azure DevOps project", profile[1]], ["Azure DevOps team", profile[2]], ["Personal Access Token", "placeholder-not-a-token"]]) {
      await waitFor(`document.querySelector('.quick-input-widget')?.textContent.includes(${JSON.stringify(prompt)}) && document.querySelector('.quick-input-widget input')?.value === ''`);
      await cdp("Input.insertText", { text: value });
      await pause(200);
      await key("Enter", "Enter", 13);
    }
    await waitFor(`!!${quickRow(profile[0])}`);
    await key("Escape", "Escape", 27);
  }
}

async function captureConnections(mode, theme) {
  await selectTheme(mode, theme);
  await command("View: Close All Editors");
  await command("Notifications: Clear All Notifications");
  await openManageProfiles();
  await evaluate(`${quickRow("contoso-mobile")}.click()`);
  await waitFor(`document.querySelector('.quick-input-title')?.textContent.includes('Manage Profile: contoso-mobile') && !!${quickRow("Rotate")}`);
  // The Quick Pick is the whole interaction; crop the empty workbench around it.
  await capture(`connection-profiles-${mode}`, { x: 300, y: 32, width: 840, height: 260 });
  await key("Escape", "Escape", 27);
  console.log(`Captured the real Manage Profiles actions in ${theme}.`);
}

// Requires the capture-only build from build-vscode-capture.mjs: its profiles use atomize-core's Mock
// platform, and the capture cancels the confirmation, so nothing is created anywhere.
async function captureGenerate(mode, theme) {
  await selectTheme(mode, theme);
  await command("Notifications: Clear All Notifications");
  await openBuiltInTemplate();
  await key("F1", "F1", 112);
  await waitFor(`!!document.querySelector('.quick-input-widget input')?.getClientRects().length`);
  await cdp("Input.insertText", { text: "Atomize: Generate" });
  await waitFor(`!!${quickRow("Atomize: Generate")}`);
  await evaluate(`${quickRow("Atomize: Generate")}.click()`);
  await waitFor(`document.querySelector('.quick-input-title')?.textContent.includes('Atomize: Generate') && !!${quickRow("contoso-web")}`);
  await evaluate(`${quickRow("contoso-web")}.click()`);
  await waitFor(`document.querySelector('.quick-input-widget input')?.placeholder.includes('Tick Stories') && document.querySelectorAll('.quick-input-list .monaco-list-row').length > 0`);
  // Tick the two Mock Stories estimated at 8, so the plan uses exactly the Story budget.
  for (const [story, search] of [["#STORY-001 Implement user authentication API", "authentication"], ["#STORY-004 Add search functionality", "search functionality"]]) {
    // Narrow the list first: ticks are kept while typing, and the first row takes pointer input reliably.
    await cdp("Input.insertText", { text: search });
    await waitFor(`document.querySelectorAll('.quick-input-list .monaco-list-row').length === 1 && !!${quickRow(story)}`);
    const checked = `${quickRow(story)}.querySelector('[role="checkbox"]').getAttribute('aria-checked') === 'true'`;
    // VS Code's checkbox toggles on pointer input, not a synthetic click; only click while unticked.
    for (let attempt = 0; attempt < 5 && !(await evaluate(checked)); attempt++) {
      const { x, y } = await evaluate(`(() => { const box = ${quickRow(story)}.querySelector('[role="checkbox"]').getBoundingClientRect(); return { x: box.x + box.width / 2, y: box.y + box.height / 2 }; })()`);
      for (const type of ["mousePressed", "mouseReleased"]) await cdp("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
      await pause(300);
    }
    await evaluate(`(() => { const input = document.querySelector('.quick-input-widget input'); input.select(); })()`);
    await key("Backspace", "Backspace", 8);
  }
  await waitFor(`document.querySelector('.quick-input-count')?.textContent.trim() === '2 Selected'`);
  await key("Enter", "Enter", 13);
  const panel = await webviewContext(`!!document.getElementById('btn-create')`);
  const plan = await evaluate(`document.body.innerText`, panel);
  if (!plan.includes("DRY RUN")) throw Error("The Generate Panel did not show its dry run before Task creation.");
  await capture(`generate-dry-run-${mode}`);
  await evaluate(`document.getElementById('btn-create').click()`, panel);
  await waitFor(`(document.querySelector('.monaco-dialog-box')?.textContent ?? '').includes('Create 6 tasks for 2 stories using profile "contoso-web"?')`);
  await capture(`generate-confirmation-${mode}`);
  await evaluate(`[...document.querySelectorAll('.monaco-dialog-box .monaco-button')].find(button => button.textContent.trim() === 'Cancel').click()`);
  await waitFor(`!document.querySelector('.monaco-dialog-box')`);
  if (!(await evaluate(`document.body.innerText`, panel)).includes("DRY RUN")) throw Error("Cancelling the confirmation must leave the dry run in place.");
  console.log(`Captured the real Generate dry run and confirmation in ${theme}.`);
}
