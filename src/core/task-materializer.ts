import { logger } from "@config/logger";
import type { GenerationPlatform } from "@platforms/interfaces/platform-capabilities";
import type { WorkItem } from "@platforms/interfaces/work-item.interface";
import type { TaskDefinition as TemplateTaskDefinition } from "@templates/schema";
import { getErrorMessage } from "@utils/errors";
import type { CalculatedTask } from "./estimation-calculator";

export interface TaskMaterializationOptions {
  dependencyConcurrency?: number;
}

/**
 * Owns the write side of generation: create Tasks, correlate them back to
 * Template task IDs, and link dependencies between the created Work Items.
 */
export class TaskMaterializer {
  constructor(private readonly platform: GenerationPlatform) {}

  async materialize(
    parentId: string,
    calculatedTasks: CalculatedTask[],
    templateTasks: TemplateTaskDefinition[],
    options: TaskMaterializationOptions = {},
  ): Promise<WorkItem[]> {
    const createdTasks = await this.platform.createTasksBulk(parentId, calculatedTasks);
    const dependencyLinks = this.planDependencyLinks(calculatedTasks, createdTasks, templateTasks);
    await this.createDependencyLinks(dependencyLinks, options.dependencyConcurrency ?? 5);
    return createdTasks;
  }

  private planDependencyLinks(
    calculatedTasks: CalculatedTask[],
    createdTasks: WorkItem[],
    templateTasks: TemplateTaskDefinition[],
  ): Array<{ dependentTask: WorkItem; predecessorTask: WorkItem }> {
    const templateIdToTask = new Map<string, WorkItem>();
    for (let i = 0; i < calculatedTasks.length; i++) {
      const calculatedTask = calculatedTasks[i];
      const createdTask = createdTasks[i];
      if (calculatedTask?.templateId && createdTask) {
        templateIdToTask.set(calculatedTask.templateId, createdTask);
      }
    }

    const dependencyLinks: Array<{ dependentTask: WorkItem; predecessorTask: WorkItem }> = [];

    for (const templateTask of templateTasks) {
      if (!templateTask.dependsOn || templateTask.dependsOn.length === 0) continue;

      const dependentTask = templateTask.id
        ? templateIdToTask.get(templateTask.id)
        : undefined;

      if (!dependentTask) {
        logger.warn(
          `Cannot create dependency links for task "${templateTask.title}" - task not created or has no ID`,
        );
        continue;
      }

      for (const depId of templateTask.dependsOn) {
        const predecessorTask = templateIdToTask.get(depId);

        if (!predecessorTask) {
          logger.warn(
            `Cannot create dependency link: predecessor task with ID "${depId}" not found`,
          );
          continue;
        }

        dependencyLinks.push({ dependentTask, predecessorTask });
      }
    }

    return dependencyLinks;
  }

  private async createDependencyLinks(
    dependencyLinks: Array<{ dependentTask: WorkItem; predecessorTask: WorkItem }>,
    dependencyConcurrency: number,
  ): Promise<void> {
    const createDependencyLink = this.platform.createDependencyLink?.bind(this.platform);
    if (dependencyLinks.length === 0) return;

    if (!createDependencyLink) {
      logger.warn("Platform does not support dependency links - dependencies will not be created");
      return;
    }

    logger.debug(
      `Creating ${dependencyLinks.length} dependency links (concurrency: ${dependencyConcurrency})`,
    );

    for (let i = 0; i < dependencyLinks.length; i += dependencyConcurrency) {
      const batch = dependencyLinks.slice(i, i + dependencyConcurrency);
      await Promise.all(
        batch.map(async ({ dependentTask, predecessorTask }) => {
          try {
            await createDependencyLink(dependentTask.id, predecessorTask.id);
            logger.debug(
              `Created dependency link: "${dependentTask.title}" depends on "${predecessorTask.title}"`,
            );
          } catch (error) {
            logger.warn(
              `Failed to create dependency link for "${dependentTask.title}" -> "${predecessorTask.title}": ${getErrorMessage(error)}`,
            );
          }
        }),
      );
    }
  }
}
