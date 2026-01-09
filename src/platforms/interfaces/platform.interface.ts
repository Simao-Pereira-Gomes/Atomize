import type { FilterCriteria, QueryResult } from "./filter.interface";
import type { TaskDefinition, WorkItem } from "./work-item.interface";

/**
 * Authentication configuration
 */
export interface AuthConfig {
  /** Platform-specific authentication data */
  // biome-ignore lint : The any type is used here for flexibility
  [key: string]: any;
}

/**
 * Platform metadata
 */
export interface PlatformMetadata {
  /** Platform name */
  name: string;
  /** Platform version */
  version: string;
  /** Supported features */
  features?: string[];
  /** Connection status */
  connected?: boolean;
}

/**
 * Platform adapter interface
 * All platform implementations must implement this interface
 */
export interface IPlatformAdapter {
  /**
   * Authenticate with the platform
   */
  authenticate(config?: AuthConfig): Promise<void>;

  getConnectUserEmail(): Promise<string>;

  /**
   * Query work items based on filter criteria
   */
  queryWorkItems(filter: FilterCriteria): Promise<WorkItem[]>;

  /**
   * Query work items with pagination
   */
  queryWorkItemsPaged?(
    filter: FilterCriteria,
    skip: number,
    take: number
  ): Promise<QueryResult<WorkItem>>;

  /**
   * Get a single work item by ID
   */
  getWorkItem?(id: string): Promise<WorkItem | null>;

  /**
   * Create a single task
   */
  createTask(parentId: string, task: TaskDefinition): Promise<WorkItem>;

  /**
   * Create multiple tasks in bulk
   */
  createTasksBulk(
    parentId: string,
    tasks: TaskDefinition[]
  ): Promise<WorkItem[]>;

  /**
   * Update a work item
   */
  updateWorkItem?(id: string, updates: Partial<WorkItem>): Promise<WorkItem>;

  /**
   * Delete a work item
   */
  deleteWorkItem?(id: string): Promise<boolean>;

  /**
   * Get platform metadata
   */
  getPlatformMetadata(): PlatformMetadata;

  /**
   * Test connection
   */
  testConnection?(): Promise<boolean>;

  /**
   * Get child work items
   */
  getChildren?(parentId: string): Promise<WorkItem[]>;
}

/**
 * Platform configuration
 */
export interface PlatformConfig {
  /** Platform type */
  type: PlatformType;

  /** Organization/instance URL */
  organizationUrl?: string;

  /** Project name */
  project?: string;

  /** Authentication token */
  token?: string;

  /** Additional config */
  // biome-ignore lint : The any type is used here for flexibility
  [key: string]: any;
}

/**
 * Supported platform types
 */
export type PlatformType = "mock" | "azure-devops" | "jira" | "github";
