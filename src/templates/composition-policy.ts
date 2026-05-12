import type { MixinTemplate, TaskDefinition, TaskTemplate } from "./schema";

/**
 * Authoritative rules for Template composition.
 *
 * Both the TemplateComposer (behavioural) and TemplateValidator (structural) call
 * into this module so they can never contradict each other.
 */

/**
 * Merges two task arrays using id-based override.
 *
 * Tasks with matching ids are replaced by the incoming task.
 * Tasks without ids or with new ids are appended.
 * The relative order of base tasks is preserved; overrides are applied in-place.
 */
export function mergeTasks(
  baseTasks: TaskDefinition[],
  incomingTasks: TaskDefinition[],
): TaskDefinition[] {
  const result = [...baseTasks];
  const indexById = new Map<string, number>();
  baseTasks.forEach((task, i) => {
    if (task.id) indexById.set(task.id, i);
  });

  for (const incoming of incomingTasks) {
    const existingIndex = incoming.id ? indexById.get(incoming.id) : undefined;
    if (existingIndex !== undefined) {
      result[existingIndex] = incoming;
    } else {
      result.push(incoming);
      if (incoming.id) {
        indexById.set(incoming.id, result.length - 1);
      }
    }
  }

  return result;
}

/**
 * Merges two template objects. Child fields always win over base fields.
 *
 * Conflict resolution rules:
 * - Scalar fields (name, description, author, …): child wins if defined, otherwise base
 * - filter, estimation, validation, metadata: child replaces base entirely when defined
 * - tasks: merged by id — child tasks override matching base tasks in-place, new tasks appended
 * - tags: combined and deduplicated
 * - extends / mixins: stripped from result (composition metadata, not execution data)
 */
export function mergeTemplates(
  base: TaskTemplate,
  child: Partial<TaskTemplate>,
): TaskTemplate {
  const mergedTags = Array.from(
    new Set([...(base.tags ?? []), ...(child.tags ?? [])]),
  );

  return {
    version: child.version ?? base.version,
    name: child.name ?? base.name,
    description: child.description ?? base.description,
    author: child.author ?? base.author,
    tags: mergedTags.length > 0 ? mergedTags : undefined,
    created: child.created ?? base.created,
    lastModified: child.lastModified ?? base.lastModified,

    filter: child.filter ?? base.filter,
    tasks: mergeTasks(base.tasks, child.tasks ?? []),

    estimation: child.estimation ?? base.estimation,
    validation: child.validation ?? base.validation,
    metadata: child.metadata ?? base.metadata,
  };
}

/**
 * Applies a mixin's tasks onto a template.
 * Only tasks from mixins are merged; other mixin fields are ignored.
 */
export function applyMixin(base: TaskTemplate, mixin: MixinTemplate): TaskTemplate {
  return {
    ...base,
    tasks: mergeTasks(base.tasks, mixin.tasks),
  };
}

/**
 * Returns ids that appear more than once in the task list.
 * Duplicate ids cause silent overwrites during inheritance; they are almost always a mistake.
 */
export function findDuplicateTaskIds(tasks: TaskDefinition[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const task of tasks) {
    if (task.id) {
      if (seen.has(task.id)) duplicates.add(task.id);
      else seen.add(task.id);
    }
  }
  return [...duplicates];
}
