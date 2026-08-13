import { createInterface } from "node:readline";
import { createTemplateLibrary, handleLine, type RpcNotification } from "./protocol";

const library = createTemplateLibrary();
const ready: RpcNotification = { jsonrpc: "2.0", method: "sidecar.ready" };
process.stdout.write(`${JSON.stringify(ready)}\n`);
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  void handleLine(line, library).then(response => { if (response) process.stdout.write(`${JSON.stringify(response)}\n`); });
}
