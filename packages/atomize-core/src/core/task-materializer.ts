import { logger } from "../logger";
import type { GenerationPlatform } from "../platforms/interfaces/platform-capabilities";
import type { WorkItem } from "../platforms/interfaces/work-item.interface";
import type { TaskDefinition as TemplateTaskDefinition } from "../templates/schema";
import { runWithConcurrency } from "../utils/concurrency";
import { getErrorMessage } from "../utils/errors";
import type { CalculatedTask } from "./estimation-calculator";

export interface TaskMaterializationOptions {
  dependencyConcurrency?: number;
  /** Once aborted, no further dependency level is created; Tasks already created are kept. */
  signal?: AbortSignal;
  onTaskCreated?: (task: WorkItem) => void;
}

type DependencyLink = { dependentTask: WorkItem; predecessorTask: WorkItem };

/**
 * The Template task IDs each calculated Task depends on. Validation forbids `dependsOn` on repeated
 * tasks and on tasks that depend on one, so a Template task ID names at most one calculated Task.
 */
function dependenciesOf(
  calculatedTasks: CalculatedTask[],
  templateTasks: TemplateTaskDefinition[],
): string[][] {
  const dependsOnById = new Map(
    templateTasks.filter((task) => task.id).map((task) => [task.id as string, task.dependsOn ?? []]),
  );
  return calculatedTasks.map((task) => (task.templateId ? (dependsOnById.get(task.templateId) ?? []) : []));
}

/**
 * Groups calculated Task indices by dependency level: level 0 has no predecessor among these Tasks,
 * and each later level depends only on earlier ones. A dependency on a Task that isn't being created
 * (skipped by its condition) doesn't hold its dependent back.
 */
export function groupByDependencyLevel(
  calculatedTasks: CalculatedTask[],
  templateTasks: TemplateTaskDefinition[],
): number[][] {
  const dependencies = dependenciesOf(calculatedTasks, templateTasks);
  const indexByTemplateId = new Map<string, number>();
  calculatedTasks.forEach((task, index) => {
    if (task.templateId) indexByTemplateId.set(task.templateId, index);
  });

  const levels = new Array<number | undefined>(calculatedTasks.length);
  const visiting = new Set<number>();
  const levelOf = (index: number): number => {
    const known = levels[index];
    if (known !== undefined) return known;
    // The dependency resolver rejects cycles; this guard only keeps a bad input from recursing forever.
    if (visiting.has(index)) return 0;
    visiting.add(index);
    let level = 0;
    for (const depId of dependencies[index] ?? []) {
      const depIndex = indexByTemplateId.get(depId);
      if (depIndex !== undefined) level = Math.max(level, levelOf(depIndex) + 1);
    }
    visiting.delete(index);
    levels[index] = level;
    return level;
  };

  const groups: number[][] = [];
  calculatedTasks.forEach((_, index) => {
    const level = levelOf(index);
    groups[level] ??= [];
    groups[level].push(index);
  });
  return groups.filter((group) => group !== undefined);
}

/**
 * Pairs each created dependent Task with its created predecessors. `createdTasks` is indexed like
 * `calculatedTasks`, with a gap where a Task failed to create.
 */
export function planDependencyLinks(
  calculatedTasks: CalculatedTask[],
  createdTasks: ReadonlyArray<WorkItem | undefined>,
  templateTasks: TemplateTaskDefinition[],
): DependencyLink[] {
  const createdByTemplateId = new Map<string, WorkItem>();
  calculatedTasks.forEach((task, index) => {
    const created = createdTasks[index];
    if (task.templateId && created) createdByTemplateId.set(task.templateId, created);
  });

  const dependencies = dependenciesOf(calculatedTasks, templateTasks);
  const links: DependencyLink[] = [];
  calculatedTasks.forEach((task, index) => {
    const depIds = dependencies[index] ?? [];
    if (depIds.length === 0) return;
    const dependentTask = createdTasks[index];
    if (!dependentTask) {
      logger.warn(`Cannot create dependency links for task "${task.title}" - task not created`);
      return;
    }
    for (const depId of depIds) {
      const predecessorTask = createdByTemplateId.get(depId);
      if (!predecessorTask) {
        logger.warn(`Cannot create dependency link: predecessor task with ID "${depId}" not found`);
        continue;
      }
      links.push({ dependentTask, predecessorTask });
    }
  });
  return links;
}

/**
 * Owns the write side of generation: create Tasks, correlate them back to Template task IDs, and link
 * dependencies between the created Work Items.
 */
export class TaskMaterializer {
  constructor(private readonly platform: GenerationPlatform) {}

  async materialize(
    parentId: string,
    calculatedTasks: CalculatedTask[],
    templateTasks: TemplateTaskDefinition[],
    options: TaskMaterializationOptions = {},
  ): Promise<WorkItem[]> {
    const createdTasks = this.platform.createsDependencyLinksWithTasks
      ? await this.createLevelByLevel(parentId, calculatedTasks, templateTasks, options)
      : await this.createThenLink(parentId, calculatedTasks, templateTasks, options);
    return createdTasks.filter((task): task is WorkItem => task !== undefined);
  }

  /**
   * Creates one dependency level at a time so each Task's predecessors already exist, and lets the
   * platform link them in the create request. Tasks within a level are created in parallel.
   */
  private async createLevelByLevel(
    parentId: string,
    calculatedTasks: CalculatedTask[],
    templateTasks: TemplateTaskDefinition[],
    options: TaskMaterializationOptions,
  ): Promise<Array<WorkItem | undefined>> {
    const created = new Array<WorkItem | undefined>(calculatedTasks.length);
    const createdByTemplateId = new Map<string, WorkItem>();
    const dependencies = dependenciesOf(calculatedTasks, templateTasks);

    for (const level of groupByDependencyLevel(calculatedTasks, templateTasks)) {
      if (options.signal?.aborted) break;
      const definitions = level.map((index) => {
        const task = calculatedTasks[index] as CalculatedTask;
        const predecessorIds = (dependencies[index] ?? []).flatMap((depId) => {
          const predecessor = createdByTemplateId.get(depId);
          if (!predecessor) {
            logger.warn(`Cannot create dependency link: predecessor task with ID "${depId}" not found`);
            return [];
          }
          return [predecessor.id];
        });
        return predecessorIds.length > 0 ? { ...task, predecessorIds } : task;
      });

      await this.platform.createTasksBulk(parentId, definitions, (task, levelIndex) => {
        const index = level[levelIndex];
        if (index === undefined) return;
        created[index] = task;
        const templateId = calculatedTasks[index]?.templateId;
        if (templateId) createdByTemplateId.set(templateId, task);
        options.onTaskCreated?.(task);
      });
    }
    return created;
  }

  private async createThenLink(
    parentId: string,
    calculatedTasks: CalculatedTask[],
    templateTasks: TemplateTaskDefinition[],
    options: TaskMaterializationOptions,
  ): Promise<Array<WorkItem | undefined>> {
    const created = new Array<WorkItem | undefined>(calculatedTasks.length);
    await this.platform.createTasksBulk(parentId, calculatedTasks, (task, index) => {
      created[index] = task;
      options.onTaskCreated?.(task);
    });
    const links = planDependencyLinks(calculatedTasks, created, templateTasks);
    await this.createDependencyLinks(links, options.dependencyConcurrency ?? 5);
    return created;
  }

  private async createDependencyLinks(dependencyLinks: DependencyLink[], dependencyConcurrency: number): Promise<void> {
    const createDependencyLink = this.platform.createDependencyLink?.bind(this.platform);
    if (dependencyLinks.length === 0) return;

    if (!createDependencyLink) {
      logger.warn("Platform does not support dependency links - dependencies will not be created");
      return;
    }

    logger.debug(`Creating ${dependencyLinks.length} dependency links (concurrency: ${dependencyConcurrency})`);

    await runWithConcurrency(dependencyLinks, dependencyConcurrency, async ({ dependentTask, predecessorTask }) => {
      try {
        await createDependencyLink(dependentTask.id, predecessorTask.id);
        logger.debug(`Created dependency link: "${dependentTask.title}" depends on "${predecessorTask.title}"`);
      } catch (error) {
        logger.warn(
          `Failed to create dependency link for "${dependentTask.title}" -> "${predecessorTask.title}": ${getErrorMessage(error)}`,
        );
      }
    });
  }
}
