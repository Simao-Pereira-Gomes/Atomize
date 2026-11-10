import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { settings } from "@clack/prompts";
import { stopOnInterrupt } from "@/cli/utilities/interrupt";

const cancelKeys = () => [...settings.aliases].filter(([, action]) => action === "cancel").map(([key]) => key).sort();

describe("stopOnInterrupt", () => {
  test("a Ctrl+C keypress from a terminal in raw mode stops the run, as SIGINT does", async () => {
    const input = new EventEmitter();
    let stopped = 0;

    const aborted = await stopOnInterrupt(
      (signal) =>
        new Promise<boolean>((resolve) => {
          signal.addEventListener("abort", () => resolve(signal.aborted));
          input.emit("keypress", "\u0003", { ctrl: true, name: "c", sequence: "\u0003" });
        }),
      () => { stopped++; },
      { input },
    );

    expect(aborted).toBe(true);
    expect(stopped).toBe(1);
  });

  test("keeps Clack from exiting on Ctrl+C or Escape during the run, and gives those keys back afterwards", async () => {
    const before = cancelKeys();
    expect(before.length).toBeGreaterThan(0);

    const during = await stopOnInterrupt(async () => cancelKeys(), () => {}, { input: new EventEmitter() });

    expect(during).toEqual([]);
    expect(cancelKeys()).toEqual(before);
  });

  test("stops listening once the run is over", async () => {
    const input = new EventEmitter();
    await stopOnInterrupt(async () => undefined, () => {}, { input });

    expect(input.listenerCount("keypress")).toBe(0);
  });
});
