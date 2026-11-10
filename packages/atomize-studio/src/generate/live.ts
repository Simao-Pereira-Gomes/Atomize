// Real Generate types/parsers for Live Preview + Execute (issue #138) — the sidecar-agnostic
// counterpart to preview.ts's Mock Preview types. Frontend-local mirrors of atomize-core's
// WorkItem/AtomizationReport/ProgressEvent shapes, since atomize-studio doesn't depend on atomize-core.

export type GenerateWorkItem = { id: string; title: string; url?: string; type?: string; state?: string; areaPath?: string };

/** A Task a dry run would create; atomize-core reports these as `tasksCalculated`, leaving `tasksCreated` empty. */
export type GeneratePlannedTask = { title: string; estimation?: number };

/** A child Task a resume found for a planned Task, or a child no planned Task matched. */
export type GenerateExistingTask = { title: string; workItemId: string };

/** A resumed Story: the planned Tasks that already exist (the rest are `tasksPlanned`), children not in the plan, and whether nothing was missing. */
export type GenerateResumePlan = { existing: GenerateExistingTask[]; notInPlan: GenerateExistingTask[]; complete: boolean };

export type GenerateResultRow = {
  story: GenerateWorkItem;
  tasksCreated: GenerateWorkItem[];
  tasksPlanned: GeneratePlannedTask[];
  success: boolean;
  error?: string;
  estimateUnit?: string;
  /** The run stopped while this Story's Tasks were being created; those created are kept. */
  stoppedEarly?: boolean;
  resume?: GenerateResumePlan;
};

/** Why a run stopped before finishing, and the Stories it never started. */
export type GenerateStopped = { reason: "cancelled" | "timedOut"; message: string; storiesNotStarted: string[] };

/** A Story excludeIfHasTasks skipped that looks partly created: some planned Tasks exist, some don't. */
export type GeneratePartlyCreated = { storyId: string; title: string; tasksExisting: number; tasksPlanned: number };

export type GenerateReport = {
  storiesProcessed: number;
  storiesSuccess: number;
  storiesFailed: number;
  tasksCreated: number;
  tasksPlanned: number;
  results: GenerateResultRow[];
  stopped?: GenerateStopped;
  partlyCreated: GeneratePartlyCreated[];
};

export type GenerateProgressEventType =
  | "query_start" | "query_complete" | "story_start" | "story_complete" | "story_error" | "task_created";

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

function parsePlannedTasks(value: unknown): GeneratePlannedTask[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((task) => isRecord(task) && typeof task.title === "string"
    ? [{ title: task.title, estimation: typeof task.estimation === "number" ? task.estimation : undefined }]
    : []);
}

function parseExistingTasks(value: unknown): GenerateExistingTask[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((task) => isRecord(task) && typeof task.title === "string" && typeof task.workItemId === "string"
    ? [{ title: task.title, workItemId: task.workItemId }]
    : []);
}

function parseResumePlan(value: unknown): GenerateResumePlan | undefined {
  if (!isRecord(value)) return undefined;
  return { existing: parseExistingTasks(value.existing), notInPlan: parseExistingTasks(value.notInPlan), complete: value.complete === true };
}

function parseStopped(value: unknown): GenerateStopped | undefined {
  if (!isRecord(value) || (value.reason !== "cancelled" && value.reason !== "timedOut")) return undefined;
  return {
    reason: value.reason,
    message: typeof value.message === "string" ? value.message : "",
    storiesNotStarted: Array.isArray(value.storiesNotStarted) ? value.storiesNotStarted.filter((id): id is string => typeof id === "string") : [],
  };
}

function parsePartlyCreated(value: unknown): GeneratePartlyCreated[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((story) => isRecord(story)
    && typeof story.storyId === "string" && typeof story.title === "string"
    && typeof story.tasksExisting === "number" && typeof story.tasksPlanned === "number"
    ? [{ storyId: story.storyId, title: story.title, tasksExisting: story.tasksExisting, tasksPlanned: story.tasksPlanned }]
    : []);
}

function parseResultRow(value: unknown): GenerateResultRow | undefined {
  if (!isRecord(value)) return undefined;
  const story = parseWorkItem(value.story);
  if (!story) return undefined;
  return {
    story,
    tasksCreated: parseWorkItems(value.tasksCreated),
    tasksPlanned: parsePlannedTasks(value.tasksCalculated),
    success: value.success === true,
    error: typeof value.error === "string" ? value.error : undefined,
    estimateUnit: typeof value.estimateUnit === "string" ? value.estimateUnit : undefined,
    ...(value.stoppedEarly === true ? { stoppedEarly: true } : {}),
    ...(parseResumePlan(value.resume) ? { resume: parseResumePlan(value.resume) } : {}),
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
    tasksPlanned: typeof report.tasksCalculated === "number" ? report.tasksCalculated : results.reduce((sum, row) => sum + row.tasksPlanned.length, 0),
    results,
    ...(parseStopped(report.stopped) ? { stopped: parseStopped(report.stopped) } : {}),
    partlyCreated: parsePartlyCreated(report.partlyCreated),
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
