import type { TaskDefinition, TaskTemplate } from "@sppg2001/atomize-schema";

/** A single changed leaf, addressed by its key path from the Template root (or from a Task root, for per-task changes). */
export type FieldChange = { path: string[]; before: unknown; after: unknown };

export type TaskChange = {
  /** Stable-ish identity for UI keys — the task's `id`, else `t:<title>`. Not guaranteed unique across duplicate untitled-id tasks; the view still keys by array index. */
  key: string;
  status: "added" | "removed" | "modified";
  /** Set for `removed` and `modified`. */
  before?: TaskDefinition;
  /** Set for `added` and `modified`. */
  after?: TaskDefinition;
  /** Present only when a matched task's position changed relative to its surviving peers. Indices are into the respective task arrays. */
  moved?: { fromIndex: number; toIndex: number };
  /** Leaf-level changes within the task. Empty for `added`, `removed`, and a pure move. */
  fields: FieldChange[];
};

export type TemplateDiff = {
  /** Non-task top-level field changes, leaf-level. */
  fieldChanges: FieldChange[];
  /** In display order: current-list order, with each removed task slotted after its base-side predecessor. */
  taskChanges: TaskChange[];
  identical: boolean;
};

/**
 * Fields the diff never reports: `origin`/`extends`/`mixins` differ structurally between an
 * authored Template and its stripped baseline (see ADR-0058), and `created`/`lastModified`
 * are bookkeeping, not authored intent. `tasks` is diffed separately.
 */
const IGNORED_FIELDS = new Set(["origin", "extends", "mixins", "created", "lastModified", "tasks"]);

export function diffTemplates(base: TaskTemplate, current: TaskTemplate): TemplateDiff {
  const fieldChanges: FieldChange[] = [];
  diffLeaves(stripIgnored(base), stripIgnored(current), [], fieldChanges);

  const taskChanges = diffTasks(base.tasks ?? [], current.tasks ?? []);

  return { fieldChanges, taskChanges, identical: fieldChanges.length === 0 && taskChanges.length === 0 };
}

function stripIgnored(template: TaskTemplate): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(template)) {
    if (!IGNORED_FIELDS.has(key)) out[key] = value;
  }
  return out;
}

// --- leaf-level object diff ------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Recurses plain objects to their leaves; treats arrays (and genuinely mismatched types) as
 * atomic values. A plain object appearing on only one side (e.g. an `estimation` block that
 * was added) still recurses — the absent side is read as empty — so the change reports as
 * `estimation.strategy: — → percentage` rather than one opaque object blob.
 */
function diffLeaves(before: unknown, after: unknown, path: string[], out: FieldChange[]): void {
  if (deepEqual(before, after)) return;

  const beforeOk = isPlainObject(before) || before === undefined;
  const afterOk = isPlainObject(after) || after === undefined;
  if (beforeOk && afterOk && (isPlainObject(before) || isPlainObject(after))) {
    const b = isPlainObject(before) ? before : {};
    const a = isPlainObject(after) ? after : {};
    for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
      diffLeaves(b[key], a[key], [...path, key], out);
    }
    return;
  }

  out.push({ path, before, after });
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => deepEqual(item, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }
  return false;
}

// --- task diff -----------------------------------------------------------

type Indexed = { task: TaskDefinition; index: number };
type MatchedPair = { id: number; base: Indexed; current: Indexed };

function taskId(task: TaskDefinition): string {
  return typeof task.id === "string" && task.id.trim() !== "" ? task.id : "";
}

function taskKey(task: TaskDefinition): string {
  return taskId(task) || `t:${task.title}`;
}

function diffTasks(baseTasks: TaskDefinition[], currentTasks: TaskDefinition[]): TaskChange[] {
  const base: Indexed[] = baseTasks.map((task, index) => ({ task, index }));
  const current: Indexed[] = currentTasks.map((task, index) => ({ task, index }));
  const matchedBase = new Set<number>();
  const matchedCurrent = new Set<number>();
  const pairs: MatchedPair[] = [];

  // Pass 1 — by non-empty id.
  for (const b of base) {
    const id = taskId(b.task);
    if (!id) continue;
    const c = current.find((entry) => !matchedCurrent.has(entry.index) && taskId(entry.task) === id);
    if (!c) continue;
    matchedBase.add(b.index);
    matchedCurrent.add(c.index);
    pairs.push({ id: pairs.length, base: b, current: c });
  }

  // Pass 2 — by exact title, paired positionally.
  for (const b of base) {
    if (matchedBase.has(b.index)) continue;
    const c = current.find((entry) => !matchedCurrent.has(entry.index) && entry.task.title === b.task.title);
    if (!c) continue;
    matchedBase.add(b.index);
    matchedCurrent.add(c.index);
    pairs.push({ id: pairs.length, base: b, current: c });
  }

  const movedPairIds = detectMoves(pairs);

  const changeForPair = (pair: MatchedPair | undefined): TaskChange | undefined => {
    if (!pair) return undefined;
    const fields: FieldChange[] = [];
    diffLeaves(pair.base.task, pair.current.task, [], fields);
    const moved = movedPairIds.has(pair.id);
    if (fields.length === 0 && !moved) return undefined;
    return {
      key: taskKey(pair.current.task),
      status: "modified",
      before: pair.base.task,
      after: pair.current.task,
      moved: moved ? { fromIndex: pair.base.index, toIndex: pair.current.index } : undefined,
      fields,
    };
  };

  const pairByCurrentIndex = new Map(pairs.map((pair) => [pair.current.index, pair]));
  const pairByBaseIndex = new Map(pairs.map((pair) => [pair.base.index, pair]));

  // Removed tasks, anchored to the current-side position of their nearest preceding surviving task (-1 = before all).
  const removedByAnchor = new Map<number, TaskChange[]>();
  for (const b of base) {
    if (matchedBase.has(b.index)) continue;
    let anchor = -1;
    for (let j = b.index - 1; j >= 0; j--) {
      const precedingPair = pairByBaseIndex.get(j);
      if (precedingPair) {
        anchor = precedingPair.current.index;
        break;
      }
    }
    const bucket = removedByAnchor.get(anchor) ?? [];
    bucket.push({ key: taskKey(b.task), status: "removed", before: b.task, fields: [] });
    removedByAnchor.set(anchor, bucket);
  }

  const result: TaskChange[] = [];
  result.push(...(removedByAnchor.get(-1) ?? []));
  for (const c of current) {
    if (matchedCurrent.has(c.index)) {
      const change = changeForPair(pairByCurrentIndex.get(c.index));
      if (change) result.push(change);
    } else {
      result.push({ key: taskKey(c.task), status: "added", after: c.task, fields: [] });
    }
    result.push(...(removedByAnchor.get(c.index) ?? []));
  }
  return result;
}

/**
 * A matched task counts as "moved" when its order relative to the other matched tasks
 * changed. Ordering the pairs by base index and reading off their current indices, the
 * pairs that form a longest strictly-increasing run kept their relative order; every other
 * pair is a move. Added and removed tasks play no part, so a task is not flagged just
 * because its neighbours changed count.
 */
function detectMoves(pairs: MatchedPair[]): Set<number> {
  if (pairs.length < 2) return new Set();
  const byBase = [...pairs].sort((a, b) => a.base.index - b.base.index);
  const currentOrder = byBase.map((pair) => pair.current.index);
  const stable = longestIncreasingRun(currentOrder);
  return new Set(byBase.filter((_, position) => !stable.has(position)).map((pair) => pair.id));
}

/** Returns the positions (indices into `values`) that make up a longest strictly-increasing subsequence. */
function longestIncreasingRun(values: number[]): Set<number> {
  if (values.length === 0) return new Set();
  const length = values.map(() => 1);
  const previous = values.map(() => -1);
  let bestEnd = 0;

  for (const [i, value] of values.entries()) {
    for (let j = 0; j < i; j++) {
      const earlier = values[j] ?? Number.POSITIVE_INFINITY;
      const runToJ = length[j] ?? 0;
      if (earlier < value && runToJ + 1 > (length[i] ?? 0)) {
        length[i] = runToJ + 1;
        previous[i] = j;
      }
    }
    if ((length[i] ?? 0) > (length[bestEnd] ?? 0)) bestEnd = i;
  }

  const positions = new Set<number>();
  for (let i = bestEnd; i >= 0; i = previous[i] ?? -1) positions.add(i);
  return positions;
}
