import { logger } from "../logger";
import type { GenerationPlatform } from "../platforms/interfaces/platform-capabilities";
import type { WorkItem } from "../platforms/interfaces/work-item.interface";
import type { TaskDefinition as TemplateTaskDefinition } from "../templates/schema";
import { runAsDependenciesFinish, runWithConcurrency } from "../utils/concurrency";
import { getErrorMessage } from "../utils/errors";
import type { CalculatedTask } from "./estimation-calculator";

export interface TaskMaterializationOptions {
  dependencyConcurrency?: number;
  /** Once aborted, no further Task starts; Tasks already created are kept. */
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
 * For each calculated Task, the indices of the calculated Tasks it depends on. A dependency on a Task
 * that isn't being created (skipped by its condition) is dropped with a warning: it can't be linked and
 * doesn't hold its dependent back.
 */
function predecessorIndices(calculatedTasks: CalculatedTask[], templateTasks: TemplateTaskDefinition[]): number[][] {
  const indexByTemplateId = new Map<string, number>();
  calculatedTasks.forEach((task, index) => {
    if (task.templateId) indexByTemplateId.set(task.templateId, index);
  });
  return dependenciesOf(calculatedTasks, templateTasks).map((depIds) =>
    depIds.flatMap((depId) => {
      const index = indexByTemplateId.get(depId);
      if (index === undefined) {
        logger.warn(`Cannot create dependency link: predecessor task with ID "${depId}" not found`);
        return [];
      }
      return [index];
    }),
  );
}

/** Tasks on the longest dependency chain: how many must be created one after another. */
function chainLength(predecessors: number[][]): number {
  const lengths = new Array<number | undefined>(predecessors.length);
  const visiting = new Set<number>();
  const lengthOf = (index: number): number => {
    const known = lengths[index];
    if (known !== undefined) return known;
    // The dependency resolver rejects cycles; this guard only keeps a bad input from recursing forever.
    if (visiting.has(index)) return 1;
    visiting.add(index);
    const length = 1 + Math.max(0, ...(predecessors[index] ?? []).map(lengthOf));
    visiting.delete(index);
    lengths[index] = length;
    return length;
  };
  return Math.max(0, ...predecessors.map((_, index) => lengthOf(index)));
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
    const predecessors = predecessorIndices(calculatedTasks, templateTasks);
    const createdTasks = this.linksOnCreate(predecessors, options)
      ? await this.createAsPredecessorsFinish(parentId, calculatedTasks, predecessors, options)
      : await this.createThenLink(parentId, calculatedTasks, templateTasks, options);
    return createdTasks.filter((task): task is WorkItem => task !== undefined);
  }

  /**
   * Whether to put each Task's links in its create request. That saves one request per link, but a
   * Task can only be created once its predecessors exist, so a long chain is created one Task after
   * another. In rounds of requests, that costs the chain's length; creating every Task at once and
   * then linking costs ceil(Tasks / Task concurrency) + ceil(links / link concurrency). Link on create
   * unless that is slower; a tie goes to fewer requests.
   */
  private linksOnCreate(predecessors: number[][], options: TaskMaterializationOptions): boolean {
    if (!this.platform.createsDependencyLinksWithTasks) return false;
    const linkCount = predecessors.reduce((sum, deps) => sum + deps.length, 0);
    if (linkCount === 0) return false;
    if (!this.platform.createDependencyLink) return true;
    const createThenLinkRounds =
      Math.ceil(predecessors.length / this.taskConcurrency()) +
      Math.ceil(linkCount / Math.max(1, options.dependencyConcurrency ?? 5));
    return chainLength(predecessors) <= createThenLinkRounds;
  }

  private taskConcurrency(): number {
    return Math.max(1, this.platform.taskConcurrency ?? 5);
  }

  /**
   * Creates each Task as soon as its own predecessors exist, putting their IDs in its create request,
   * with at most the platform's Task concurrency in flight.
   */
  private async createAsPredecessorsFinish(
    parentId: string,
    calculatedTasks: CalculatedTask[],
    predecessors: number[][],
    options: TaskMaterializationOptions,
  ): Promise<Array<WorkItem | undefined>> {
    const created = new Array<WorkItem | undefined>(calculatedTasks.length);
    await runAsDependenciesFinish(
      predecessors,
      this.taskConcurrency(),
      async (index) => {
        const task = calculatedTasks[index] as CalculatedTask;
        const predecessorIds = (predecessors[index] ?? []).flatMap((predecessor) => {
          const predecessorTask = created[predecessor];
          if (!predecessorTask) {
            logger.warn(`Cannot link "${task.title}" to "${calculatedTasks[predecessor]?.title}": that Task wasn't created`);
            return [];
          }
          return [predecessorTask.id];
        });
        await this.platform.createTasksBulk(parentId, [predecessorIds.length > 0 ? { ...task, predecessorIds } : task], (createdTask) => {
          created[index] = createdTask;
          options.onTaskCreated?.(createdTask);
        });
      },
      { shouldStop: () => options.signal?.aborted === true },
    );
    return created;
  }

  private async createThenLink(
    parentId: string,
    calculatedTasks: CalculatedTask[],
    templateTasks: TemplateTaskDefinition[],
    options: TaskMaterializationOptions,
  ): Promise<Array<WorkItem | undefined>> {
    const created = new Array<WorkItem | undefined>(calculatedTasks.length);
    await this.platform.createTasksBulk(
      parentId,
      calculatedTasks,
      (task, index) => {
        created[index] = task;
        options.onTaskCreated?.(task);
      },
      { signal: options.signal },
    );
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
