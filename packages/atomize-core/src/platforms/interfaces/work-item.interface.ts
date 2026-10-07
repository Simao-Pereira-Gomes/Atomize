/**
 * Common work item model across all platforms
 * Platform-specific adapters map their native formats to this interface
 */
export interface WorkItem {
  /** Unique identifier (platform-specific format) */
  id: string;

  /** Work item title */
  title: string;

  /** Browser URL for the work item */
  url?: string;

  /** Work item type (User Story, Bug, Task, etc.) */
  type: WorkItemType;

  /** Current state (New, Active, Resolved, etc.) */
  state: string;

  /** Assigned user email or identifier */
  assignedTo?: string;

  /** Estimate in the work item's own unit, read through the platform's estimation field chain */
  estimation?: StoryEstimate;

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

  /** IDs of work items this depends on (predecessors) */
  predecessorIds?: string[];

  /** IDs of work items that depend on this (successors) */
  successorIds?: string[];

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
 * Platform-native work item type name (e.g. "User Story", "Product Backlog Item", "Sub-task").
 */
export type WorkItemType = string;

/**
 * A Story Estimate in the Story's own unit: points, hours, or a category such as a t-shirt size.
 */
export type StoryEstimate = number | string;

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

  /** Iteration/sprint path (inherited from parent) */
  iteration?: string;

  /** Area path (inherited from parent) */
  areaPath?: string;

  /** Parent work item ID */
  parentId?: string;

  /** IDs of tasks this task depends on */
  dependsOn?: string[];

  /** Custom fields to set on the work item (keyed by reference name, e.g. "Custom.ClientTier") */
  customFields?: Record<string, string | number | boolean>;
}
