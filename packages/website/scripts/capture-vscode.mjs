import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

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
  if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
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
async function capture(name) {
  await evaluate(`[...document.querySelectorAll('.notifications-toasts .codicon-close')].forEach(icon => icon.closest('a, button')?.click())`);
  await pause(600);
  const { data } = await cdp("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 32, width: 1440, height: 946, scale: 1 } });
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
} finally {
  await cdp("Target.setAutoAttach", { autoAttach: false, waitForDebuggerOnStart: false, flatten: true });
  socket.close();
}

async function captureFlow(mode, theme) {
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
  await command("View: Close All Editors");
  await command("Atomize: Browse Catalog");
  await waitFor(`document.querySelector('.quick-input-title')?.textContent.includes('Browse Catalog')`);
  await cdp("Input.insertText", { text: "Backend API Development" });
  await waitFor(`!!document.querySelector('.quick-input-list .codicon-go-to-file')`);
  await evaluate(`document.querySelector('.quick-input-list .codicon-go-to-file').closest('a, button').click()`);
  await waitFor(`document.querySelector('.monaco-editor')?.textContent.replace(/\\s+/g, ' ').includes('Backend API Development')`);
  await waitFor(`document.body.innerText.includes('Atomize: Preview (Mock)')`);
  await capture(`template-authoring-${mode}`);
  console.log(`Captured the real Catalog Template editor and CodeLens in ${theme}.`);
  await command("Atomize: Preview (Mock)");
  const formContext = await webviewContext(`!!document.querySelector('input[data-field="estimation"]')`);
  await evaluate(`(() => {
    const values = { estimation: '8', tags: 'backend', type: 'User Story', state: 'Active' };
    for(const [name,value] of Object.entries(values)) document.querySelector('[data-field="'+name+'"]').value = value;
    document.querySelector('form').requestSubmit();
  })()`, formContext);
  const resultsContext = await webviewContext(`document.body.innerText.includes('Design API Endpoints: Mock Story')`);
  const result = await evaluate(`document.body.innerText`, resultsContext);
  if (!result.includes("Code Review & Refinement") || !/6\s+Tasks/.test(result) || !result.includes("8 hours") || !result.includes("100%")) throw Error("Review the expected six-Task, eight-hour result before refreshing screenshots.");
  await capture(`mock-preview-${mode}`);
  console.log(`Captured the real Mock Preview Panel using the extension's in-process engine in ${theme}.`);
}
