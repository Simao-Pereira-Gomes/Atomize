import type {
  IPlatformAdapter,
  AuthConfig,
  PlatformMetadata,
} from "@platforms/interfaces/platform.interface";
import type {
  WorkItem,
  TaskDefinition,
} from "@platforms/interfaces/work-item.interface";
import type { FilterCriteria } from "@platforms/interfaces/filter.interface";
import { mockUserStories, getMockStoryById } from "./mock-data";
import { logger } from "@config/logger";

/**
 * Mock platform adapter for testing
 * Simulates platform behavior without making real API calls
 */
export class MockPlatformAdapter implements IPlatformAdapter {
  private authenticated = false;
  private createdTasks: WorkItem[] = [];
  private taskIdCounter = 1000;

  /**
   * Simulate authentication
   */
  async authenticate(_config?: AuthConfig): Promise<void> {
    logger.debug("MockPlatform: Authenticating...");

    // Simulate network delay
    await this.delay(100);

    this.authenticated = true;
    logger.info("MockPlatform: Authentication successful");
  }

  /**
   * Query work items based on filter criteria
   */
  async queryWorkItems(filter: FilterCriteria): Promise<WorkItem[]> {
    this.ensureAuthenticated();
    logger.debug("MockPlatform: Querying work items with filter:", filter);
    // Simulate network delay
    await this.delay(200);
    let results = [...mockUserStories];

    // Filter by work item types
    if (filter.workItemTypes && filter.workItemTypes.length > 0) {
      results = results.filter((item) =>
        filter.workItemTypes?.includes(item.type)
      );
    }

    // Filter by states
    if (filter.states && filter.states.length > 0) {
      results = results.filter((item) => filter.states?.includes(item.state));
    }

    // Filter by tags (include)
    if (filter.tags?.include && filter.tags.include.length > 0) {
      results = results.filter((item) => {
        return filter.tags?.include?.some((tag) => item.tags?.includes(tag));
      });
    }

    // Filter by tags (exclude)
    if (filter.tags?.exclude && filter.tags.exclude.length > 0) {
      results = results.filter((item) => {
        return !filter.tags?.exclude?.some((tag) => item.tags?.includes(tag));
      });
    }

    // Exclude if has tasks
    if (filter.excludeIfHasTasks) {
      results = results.filter(
        (item) => !item.children || item.children.length === 0
      );
    }

    // Filter by assigned to
    if (filter.assignedTo && filter.assignedTo.length > 0) {
      results = results.filter((item) => {
        return filter.assignedTo?.includes(item.assignedTo || "");
      });
    }

    // Filter by area paths
    if (filter.areaPaths && filter.areaPaths.length > 0) {
      results = results.filter((item) => {
        return filter.areaPaths?.includes(item.areaPath || "");
      });
    }

    // Filter by priority
    if (filter.priority) {
      if (filter.priority.min !== undefined) {
        results = results.filter(
          (item) => (item.priority || 999) >= filter.priority!.min!
        );
      }
      if (filter.priority.max !== undefined) {
        results = results.filter(
          (item) => (item.priority || 0) <= filter.priority!.max!
        );
      }
    }

    // Apply limit
    if (filter.limit) {
      results = results.slice(0, filter.limit);
    }

    logger.info(`MockPlatform: Found ${results.length} work items`);

    return results;
  }

  /**
   * Get a single work item by ID
   */
  async getWorkItem(id: string): Promise<WorkItem | null> {
    this.ensureAuthenticated();

    logger.debug(`MockPlatform: Getting work item ${id}`);

    // Simulate network delay
    await this.delay(100);

    const item = getMockStoryById(id);

    if (!item) {
      logger.warn(`MockPlatform: Work item ${id} not found`);
      return null;
    }

    return item;
  }

  /**
   * Create a single task
   */
  async createTask(parentId: string, task: TaskDefinition): Promise<WorkItem> {
    this.ensureAuthenticated();

    logger.debug(`MockPlatform: Creating task for parent ${parentId}:`, task);

    // Simulate network delay
    await this.delay(150);

    const createdTask: WorkItem = {
      id: `TASK-${this.taskIdCounter++}`,
      title: task.title,
      type: "Task",
      state: "New",
      assignedTo: task.assignTo,
      estimation: task.estimation,
      tags: task.tags,
      description: task.description,
      priority: task.priority,
      parentId: parentId,
      customFields: task.customFields,
      createdDate: new Date(),
      updatedDate: new Date(),
    };

    this.createdTasks.push(createdTask);

    logger.info(
      `MockPlatform: Created task ${createdTask.id}: ${createdTask.title}`
    );

    return createdTask;
  }

  /**
   * Create multiple tasks in bulk
   */
  async createTasksBulk(
    parentId: string,
    tasks: TaskDefinition[]
  ): Promise<WorkItem[]> {
    this.ensureAuthenticated();

    logger.debug(
      `MockPlatform: Creating ${tasks.length} tasks for parent ${parentId}`
    );

    const createdTasks: WorkItem[] = [];

    for (const task of tasks) {
      const createdTask = await this.createTask(parentId, task);
      createdTasks.push(createdTask);
    }

    logger.info(`MockPlatform: Created ${createdTasks.length} tasks`);

    return createdTasks;
  }

  /**
   * Update a work item
   */
  async updateWorkItem(
    id: string,
    updates: Partial<WorkItem>
  ): Promise<WorkItem> {
    this.ensureAuthenticated();

    logger.debug(`MockPlatform: Updating work item ${id}`);

    // Simulate network delay
    await this.delay(150);

    const existingTask = this.createdTasks.find((t) => t.id === id);

    if (!existingTask) {
      throw new Error(`Work item ${id} not found`);
    }

    Object.assign(existingTask, updates);
    existingTask.updatedDate = new Date();

    logger.info(`MockPlatform: Updated work item ${id}`);

    return existingTask;
  }

  /**
   * Delete a work item
   */
  async deleteWorkItem(id: string): Promise<boolean> {
    this.ensureAuthenticated();

    logger.debug(`MockPlatform: Deleting work item ${id}`);

    // Simulate network delay
    await this.delay(100);

    const index = this.createdTasks.findIndex((t) => t.id === id);

    if (index === -1) {
      logger.warn(`MockPlatform: Work item ${id} not found`);
      return false;
    }

    this.createdTasks.splice(index, 1);

    logger.info(`MockPlatform: Deleted work item ${id}`);

    return true;
  }

  /**
   * Get platform metadata
   */
  getPlatformMetadata(): PlatformMetadata {
    return {
      name: "Mock Platform",
      version: "1.0.0",
      features: ["query", "create", "update", "delete"],
      connected: this.authenticated,
    };
  }

  /**
   * Test connection
   */
  async testConnection(): Promise<boolean> {
    logger.debug("MockPlatform: Testing connection...");

    // Simulate network delay
    await this.delay(50);

    logger.info("MockPlatform: Connection test successful");

    return true;
  }

  /**
   * Get child work items
   */
  async getChildren(parentId: string): Promise<WorkItem[]> {
    this.ensureAuthenticated();

    logger.debug(`MockPlatform: Getting children for ${parentId}`);

    // Simulate network delay
    await this.delay(100);

    const children = this.createdTasks.filter(
      (task) => task.parentId === parentId
    );

    logger.info(
      `MockPlatform: Found ${children.length} children for ${parentId}`
    );

    return children;
  }

  /**
   * Get all created tasks (for testing)
   */
  getCreatedTasks(): WorkItem[] {
    return [...this.createdTasks];
  }

  /**
   * Reset the mock adapter (for testing)
   */
  reset(): void {
    this.authenticated = false;
    this.createdTasks = [];
    this.taskIdCounter = 1000;
    logger.debug("MockPlatform: Reset");
  }

  /**
   * Ensure authenticated before operations
   */
  private ensureAuthenticated(): void {
    if (!this.authenticated) {
      throw new Error("Not authenticated. Call authenticate() first.");
    }
  }

  /**
   * Simulate network delay
   */
  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
