// Real Generate types/parsers for Live Preview + Execute (issue #138) — the sidecar-agnostic
// counterpart to preview.ts's Mock Preview types. Frontend-local mirrors of atomize-core's
// WorkItem/AtomizationReport/ProgressEvent shapes, since atomize-studio doesn't depend on atomize-core.

export type GenerateWorkItem = { id: string; title: string; url?: string; type?: string; state?: string; areaPath?: string };

export type GenerateResultRow = { story: GenerateWorkItem; tasksCreated: GenerateWorkItem[]; success: boolean; error?: string };

export type GenerateReport = {
  storiesProcessed: number;
  storiesSuccess: number;
  storiesFailed: number;
  tasksCreated: number;
  results: GenerateResultRow[];
};

export type GenerateProgressEventType =
  | "query_start" | "query_complete" | "story_start" | "story_complete" | "story_error" | "task_created" | "dependency_created" | "complete";

export type GenerateProgressEvent = {
  type: GenerateProgressEventType;
  story?: GenerateWorkItem;
  task?: GenerateWorkItem;
  error?: string;
  totalStories?: number;
  completedStories?: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseWorkItem(value: unknown): GenerateWorkItem | undefined {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string") return undefined;
  return {
    id: value.id,
    title: value.title,
    url: typeof value.url === "string" ? value.url : undefined,
    type: typeof value.type === "string" ? value.type : undefined,
    state: typeof value.state === "string" ? value.state : undefined,
    areaPath: typeof value.areaPath === "string" ? value.areaPath : undefined,
  };
}

function parseWorkItems(value: unknown): GenerateWorkItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const parsed = parseWorkItem(item);
    return parsed ? [parsed] : [];
  });
}

/** Parses `generate_query_stories`' response into the Stories a Generate Scope's Story browser can pick from. */
export function parseGenerateStories(value: unknown): GenerateWorkItem[] {
  if (!isRecord(value) || !Array.isArray(value.stories)) {
    throw new Error("Atomize Studio received an unexpected response while fetching Stories.");
  }
  return parseWorkItems(value.stories);
}

function parseResultRow(value: unknown): GenerateResultRow | undefined {
  if (!isRecord(value)) return undefined;
  const story = parseWorkItem(value.story);
  if (!story) return undefined;
  return {
    story,
    tasksCreated: parseWorkItems(value.tasksCreated),
    success: value.success === true,
    error: typeof value.error === "string" ? value.error : undefined,
  };
}

/** Parses `generate_run`'s response (dry-run or live) into a Generate Report. */
export function parseGenerateReport(value: unknown): GenerateReport {
  if (!isRecord(value) || !isRecord(value.report)) {
    throw new Error("Atomize Studio received an unexpected response while running Generate.");
  }
  const report = value.report;
  const results = Array.isArray(report.results)
    ? report.results.flatMap((row) => { const parsed = parseResultRow(row); return parsed ? [parsed] : []; })
    : [];
  return {
    storiesProcessed: typeof report.storiesProcessed === "number" ? report.storiesProcessed : results.length,
    storiesSuccess: typeof report.storiesSuccess === "number" ? report.storiesSuccess : results.filter((row) => row.success).length,
    storiesFailed: typeof report.storiesFailed === "number" ? report.storiesFailed : results.filter((row) => !row.success).length,
    tasksCreated: typeof report.tasksCreated === "number" ? report.tasksCreated : results.reduce((sum, row) => sum + row.tasksCreated.length, 0),
    results,
  };
}

/** Parses one `generate-run-progress` event payload, tolerating unknown/malformed shapes by returning undefined. */
export function parseGenerateProgressEvent(value: unknown): GenerateProgressEvent | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  return {
    type: value.type as GenerateProgressEventType,
    story: parseWorkItem(value.story),
    task: parseWorkItem(value.task),
    error: typeof value.error === "string" ? value.error : undefined,
    totalStories: typeof value.totalStories === "number" ? value.totalStories : undefined,
    completedStories: typeof value.completedStories === "number" ? value.completedStories : undefined,
  };
}
