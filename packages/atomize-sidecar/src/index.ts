import { createInterface } from "node:readline";
import { createSidecarServices, handleLine, isShutdownNotification, type RpcNotification } from "./protocol";

const services = createSidecarServices();
const ready: RpcNotification = { jsonrpc: "2.0", method: "sidecar.ready" };
process.stdout.write(`${JSON.stringify(ready)}\n`);

/** The most shutdown waits for in-flight telemetry; with none in flight it waits for nothing. */
const SHUTDOWN_FLUSH_CAP_MS = 300;
const shutdown = async (): Promise<never> => {
  await services.telemetry.flush(SHUTDOWN_FLUSH_CAP_MS).catch(() => undefined);
  process.exit(0);
};
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());

for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  if (isShutdownNotification(line)) await shutdown();
  void handleLine(line, services).then(response => { if (response) process.stdout.write(`${JSON.stringify(response)}\n`); });
}
// Studio closed the pipe: the app is exiting.
await shutdown();
