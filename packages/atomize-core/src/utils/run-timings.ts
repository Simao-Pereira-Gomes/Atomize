/**
 * Where a Generation Run spends its wall-clock time: phases, each Story's slot wait, calculation and
 * creation, and every platform request with its time queued and in flight. Opt-in (the CLI's
 * `generate --timings <file>`); without a RunTimings nothing is recorded. The record's format is not
 * stable: `version` says which one a file follows.
 */

/** One send of a request. Times come from the RunTimings clock (Date.now by default). */
export interface RequestAttempt {
  sentAt: number;
  finishedAt: number;
  /** Requests in flight once this one was sent, itself included. */
  inFlight: number;
  /** The throttle's limit when it was sent; Infinity when none was set. */
  limit: number;
  /** HTTP status the attempt failed with, if any. */
  status?: number;
  /** Retry-After the response carried, in milliseconds. */
  retryAfterMs?: number;
}

/** One platform request, from when it was asked for to its last attempt. */
export interface RequestRecord {
  method: string;
  queuedAt: number;
  attempts: RequestAttempt[];
  ok: boolean;
}

/** What the run was asked to do, as far as its timings depend on it. */
export interface RunInfo {
  template?: string;
  dryRun?: boolean;
  storyConcurrency?: number;
  taskConcurrency?: number;
  dependencyConcurrency?: number;
  stories?: number;
}

export type StoryOutcome = "success" | "failed" | "skipped" | "stopped";

/** A Story's timings, as the atomizer reports them. */
export interface StoryTimer {
  /** Its Tasks are calculated and creation starts. */
  planned(): void;
  end(outcome: StoryOutcome): void;
}

/** Milliseconds over a set of durations; percentiles are nearest-rank. */
export interface DurationStats {
  total: number;
  p50: number;
  p95: number;
  max: number;
}

/** The `--timings` file: raw events in milliseconds from when timing started, and a summary of them. */
export interface TimingsRecord {
  version: 1;
  run: RunInfo & { totalMs: number };
  /** `unfinished`: still running when the record was written (a run given up on); it ends then. */
  phases: Array<{ name: PhaseName; startMs: number; endMs: number; unfinished?: true }>;
  stories: Array<{ id: string; readyMs: number; startMs: number; plannedMs?: number; endMs?: number; outcome?: StoryOutcome }>;
  requests: Array<{
    method: string;
    queuedMs: number;
    ok: boolean;
    attempts: Array<{ sentMs: number; endMs: number; inFlight: number; limit: number | null; status?: number; retryAfterMs?: number }>;
  }>;
  summary: {
    /** Total milliseconds per phase name. */
    phases: Partial<Record<PhaseName, number>>;
    stories: { count: number; slotWait: DurationStats; calculate: DurationStats; create: DurationStats };
    requests: {
      total: number;
      failed: number;
      byMethod: Record<string, { count: number; retries: number; queued: DurationStats; inFlight: DurationStats }>;
    };
    /** Attempts answered 429/503 or with Retry-After. */
    throttleEvents: number;
    peakInFlight: number;
    /** Mean requests in flight during the processStories phase; absent without that phase. */
    avgInFlightWhileProcessing?: number;
    /** Story × Task concurrency: the most requests the nested pools allow at once. */
    nominalInFlight?: number;
  };
}

/**
 * The phases of a Generation Run: connecting, loading the field schema, querying Stories, and
 * processing them. The in-flight average in the summary covers processStories.
 */
export type PhaseName = "connect" | "fieldSchema" | "storyQuery" | "processStories";

/** Runs `work` as phase `name` of `timings`, or just runs it when the run isn't timed. */
export function timePhase<T>(timings: RunTimings | undefined, name: PhaseName, work: () => Promise<T>): Promise<T> {
  return timings ? timings.phase(name, work) : work();
}

const THROTTLE_STATUSES = new Set([429, 503]);

/** Collects one Generation Run's timings; `toJSON()` gives the record to write. */
export class RunTimings {
  readonly now: () => number;
  private readonly origin: number;
  private run: RunInfo = {};
  /** In start order; `end` is unset while the phase runs. */
  private readonly phases: Array<{ name: PhaseName; start: number; end?: number }> = [];
  private readonly stories: Array<{ id: string; ready: number; start: number; planned?: number; end?: number; outcome?: StoryOutcome }> = [];
  private readonly requests: RequestRecord[] = [];

  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? Date.now;
    this.origin = this.now();
  }

  /** Merges into what the run was asked to do; later calls add to earlier ones. */
  setRun(info: RunInfo): void {
    this.run = { ...this.run, ...info };
  }

  /** Runs `work` and records it as phase `name`, even when it throws. */
  async phase<T>(name: PhaseName, work: () => Promise<T>): Promise<T> {
    const phase: (typeof this.phases)[number] = { name, start: this.now() };
    this.phases.push(phase);
    try {
      return await work();
    } finally {
      phase.end = this.now();
    }
  }

  /** `readyAt`: when the Story could have started had a slot been free. */
  startStory(id: string, readyAt: number): StoryTimer {
    const story: (typeof this.stories)[number] = { id, ready: readyAt, start: this.now() };
    this.stories.push(story);
    return {
      planned: () => {
        story.planned = this.now();
      },
      end: (outcome) => {
        story.end = this.now();
        story.outcome = outcome;
      },
    };
  }

  /** Keeps one settled platform request. */
  recordRequest(record: RequestRecord): void {
    this.requests.push(record);
  }

  /** The record so far, with its summary; a Story still running has no end. */
  toJSON(): TimingsRecord {
    const writtenAt = this.now();
    const at = (time: number) => time - this.origin;
    const phases = this.phases.map((phase) => ({ name: phase.name, start: phase.start, end: phase.end ?? writtenAt, unfinished: phase.end === undefined }));
    const stories = this.stories.map((story) => ({
      id: story.id,
      readyMs: at(story.ready),
      startMs: at(story.start),
      ...(story.planned !== undefined ? { plannedMs: at(story.planned) } : {}),
      ...(story.end !== undefined ? { endMs: at(story.end) } : {}),
      ...(story.outcome ? { outcome: story.outcome } : {}),
    }));
    return {
      version: 1,
      run: { ...this.run, totalMs: at(writtenAt) },
      phases: phases.map((phase) => ({
        name: phase.name,
        startMs: at(phase.start),
        endMs: at(phase.end),
        ...(phase.unfinished ? { unfinished: true as const } : {}),
      })),
      stories,
      requests: this.requests.map((request) => ({
        method: request.method,
        queuedMs: at(request.queuedAt),
        ok: request.ok,
        attempts: request.attempts.map((attempt) => ({
          sentMs: at(attempt.sentAt),
          endMs: at(attempt.finishedAt),
          inFlight: attempt.inFlight,
          limit: Number.isFinite(attempt.limit) ? attempt.limit : null,
          ...(attempt.status !== undefined ? { status: attempt.status } : {}),
          ...(attempt.retryAfterMs !== undefined ? { retryAfterMs: attempt.retryAfterMs } : {}),
        })),
      })),
      summary: this.summary(phases),
    };
  }

  private summary(closedPhases: Array<{ name: PhaseName; start: number; end: number }>): TimingsRecord["summary"] {
    const phases: Partial<Record<PhaseName, number>> = {};
    for (const phase of closedPhases) phases[phase.name] = (phases[phase.name] ?? 0) + phase.end - phase.start;

    const ended = this.stories.filter((story) => story.end !== undefined);
    const stories = {
      count: this.stories.length,
      slotWait: stats(this.stories.map((story) => story.start - story.ready)),
      calculate: stats(ended.map((story) => (story.planned ?? (story.end as number)) - story.start)),
      create: stats(ended.flatMap((story) => (story.planned !== undefined ? [(story.end as number) - story.planned] : []))),
    };

    const methods = new Map<string, RequestRecord[]>();
    for (const request of this.requests) methods.set(request.method, [...(methods.get(request.method) ?? []), request]);
    const byMethod: TimingsRecord["summary"]["requests"]["byMethod"] = {};
    for (const [method, requests] of methods) {
      byMethod[method] = {
        count: requests.length,
        retries: requests.reduce((sum, request) => sum + Math.max(0, request.attempts.length - 1), 0),
        queued: stats(requests.map(queuedTime)),
        inFlight: stats(requests.map(inFlightTime)),
      };
    }

    const attempts = this.requests.flatMap((request) => request.attempts);
    const processing = closedPhases.find((phase) => phase.name === "processStories");
    const { storyConcurrency, taskConcurrency } = this.run;
    return {
      phases,
      stories,
      requests: { total: this.requests.length, failed: this.requests.filter((request) => !request.ok).length, byMethod },
      throttleEvents: attempts.filter(
        (attempt) => (attempt.status !== undefined && THROTTLE_STATUSES.has(attempt.status)) || (attempt.retryAfterMs ?? 0) > 0,
      ).length,
      peakInFlight: peakOverlap(attempts),
      ...(processing && processing.end > processing.start
        ? { avgInFlightWhileProcessing: round(busyTime(attempts, processing.start, processing.end) / (processing.end - processing.start)) }
        : {}),
      ...(storyConcurrency !== undefined && taskConcurrency !== undefined
        ? { nominalInFlight: storyConcurrency * taskConcurrency }
        : {}),
    };
  }
}

/** Time spent waiting to be sent: before the first attempt, and between each failed attempt and the next. */
function queuedTime(request: RequestRecord): number {
  let previous = request.queuedAt;
  let total = 0;
  for (const attempt of request.attempts) {
    total += attempt.sentAt - previous;
    previous = attempt.finishedAt;
  }
  return total;
}

function inFlightTime(request: RequestRecord): number {
  return request.attempts.reduce((sum, attempt) => sum + attempt.finishedAt - attempt.sentAt, 0);
}

/** Most attempts in flight at the same moment; one ending as another starts doesn't overlap. */
function peakOverlap(attempts: RequestAttempt[]): number {
  const events = attempts.flatMap((attempt) => [
    { at: attempt.sentAt, delta: 1 },
    { at: attempt.finishedAt, delta: -1 },
  ]);
  events.sort((a, b) => a.at - b.at || a.delta - b.delta);
  let current = 0;
  let peak = 0;
  for (const event of events) {
    current += event.delta;
    peak = Math.max(peak, current);
  }
  return peak;
}

/** Sum of every attempt's time in flight within [from, to]. */
function busyTime(attempts: RequestAttempt[], from: number, to: number): number {
  return attempts.reduce(
    (sum, attempt) => sum + Math.max(0, Math.min(to, attempt.finishedAt) - Math.max(from, attempt.sentAt)),
    0,
  );
}

/** Nearest-rank percentiles. */
function stats(values: number[]): DurationStats {
  if (values.length === 0) return { total: 0, p50: 0, p95: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p: number) => sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] as number;
  return { total: sorted.reduce((sum, value) => sum + value, 0), p50: rank(50), p95: rank(95), max: sorted[sorted.length - 1] as number };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
