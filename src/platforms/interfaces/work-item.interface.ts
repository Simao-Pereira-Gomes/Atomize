/**
 * Common work item model across all platforms
 * Platform-specific adapters map their native formats to this interface
 */
export interface WorkItem {
  /** Unique identifier (platform-specific format) */
  id: string;

  /** Work item title */
  title: string;

  /** Work item type (User Story, Bug, Task, etc.) */
  type: WorkItemType;

  /** Current state (New, Active, Resolved, etc.) */
  state: string;

  /** Assigned user email or identifier */
  assignedTo?: string;

  /** Estimation (story points, hours, etc.) */
  estimation?: number;

  /** Tags/labels */
  tags?: string[];

  /** Description/details */
  description?: string;

  /** Area path (for Azure DevOps) or project (for Jira) */
  areaPath?: string;

  /** Iteration/sprint */
  iteration?: string;

  /** Priority (1-5, where 1 is highest) */
  priority?: number;

  /** Parent work item ID (if this is a child) */
  parentId?: string;

  /** Child work items */
  children?: WorkItem[];

  /** Custom fields (platform-specific) */
  // biome-ignore lint : The any type is used here for flexibility
  customFields?: Record<string, any>;

  /** Creation date */
  createdDate?: Date;

  /** Last updated date */
  updatedDate?: Date;

  /** Platform-specific data (not mapped to common interface) */
  // biome-ignore lint : The any type is used here for flexibility
  platformSpecific?: any;
}

/**
 * Standard work item types across platforms
 */
export type WorkItemType =
  | "User Story"
  | "Product Backlog Item"
  | "Bug"
  | "Task"
  | "Epic"
  | "Feature"
  | "Issue"
  | "Subtask";

/**
 * Task definition for creation
 */
export interface TaskDefinition {
  /** Task title */
  title: string;

  /** Task description */
  description?: string;

  /** Estimation (story points, hours) */
  estimation?: number;

  /** Tags */
  tags?: string[];

  /** Assignment */
  assignTo?: string;

  /** Priority */
  priority?: number;

  /** Activity type (Design, Development, Testing, etc.) */
  activity?: string;

  /** Remaining work in hours */
  remainingWork?: number;

  /** Completed work in hours (defaults to 0 for new tasks) */
  completedWork?: number;

  /** Iteration/sprint path (inherited from parent) */
  iteration?: string;

  /** Parent work item ID */
  parentId?: string;

  /** Custom fields */
  // biome-ignore lint : The any type is used here for flexibility
  customFields?: Record<string, any>;

  /** Conditional expression - task only created if condition evaluates to true */
  condition?: string;

  /** IDs of tasks this task depends on */
  dependsOn?: string[];
}
