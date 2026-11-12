#!/usr/bin/env bun
/**
 * Compare `atomize generate --timings <file>` records side by side as a Markdown table, one row per
 * file, for writing up where Generation Runs spend their time (issue #332).
 *
 * Usage:
 *   bun scripts/summarise-timings.ts timings/*.json
 */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { TimingsRecord } from "../packages/atomize-core/src/utils/run-timings";

const seconds = (ms: number | undefined) => (ms === undefined ? "–" : (ms / 1000).toFixed(1));

/** One Markdown table comparing the runs, in the order given. */
export function summariseTimings(runs: Array<{ label: string; record: TimingsRecord }>): string {
  const header = [
    "Run", "Concurrency (S/T/D)", "Stories", "Total s", "Connect s", "Field schema s", "Story query s", "Processing s",
    "Requests", "Create p50/p95 ms", "Queued p95 ms", "Avg in flight / nominal", "Peak in flight",
    "Slot wait p50/p95 s", "Throttled",
  ];
  const rows = runs.map(({ label, record }) => {
    if (record.version !== 1) throw new Error(`${label}: unsupported timings version ${record.version}`);
    const { run, summary } = record;
    const create = summary.requests.byMethod.createWorkItem;
    const queuedP95 = Math.max(0, ...Object.values(summary.requests.byMethod).map((method) => method.queued.p95));
    return [
      label,
      `${run.storyConcurrency ?? "?"}/${run.taskConcurrency ?? "?"}/${run.dependencyConcurrency ?? "?"}`,
      String(run.stories ?? summary.stories.count),
      seconds(run.totalMs),
      seconds(summary.phases.connect),
      seconds(summary.phases.fieldSchema),
      seconds(summary.phases.storyQuery),
      seconds(summary.phases.processStories),
      String(summary.requests.total),
      create ? `${create.inFlight.p50}/${create.inFlight.p95}` : "–",
      String(queuedP95),
      `${summary.avgInFlightWhileProcessing ?? "–"} / ${summary.nominalInFlight ?? "–"}`,
      String(summary.peakInFlight),
      `${seconds(summary.stories.slotWait.p50)}/${seconds(summary.stories.slotWait.p95)}`,
      String(summary.throttleEvents),
    ];
  });
  return [header, header.map(() => "---"), ...rows].map((cells) => `| ${cells.join(" | ")} |`).join("\n");
}

if (import.meta.main) {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    console.error("Usage: bun scripts/summarise-timings.ts <timings.json>...");
    process.exit(1);
  }
  const runs = await Promise.all(
    files.map(async (file) => ({
      label: basename(file, ".json"),
      record: JSON.parse(await readFile(file, "utf8")) as TimingsRecord,
    })),
  );
  console.log(summariseTimings(runs));
}
