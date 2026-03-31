import type { ADoFieldSchema } from "./field-schema.interface";
import type { FilterCriteria, QueryResult } from "./filter.interface";
import type { TaskDefinition, WorkItem } from "./work-item.interface";

/**
 * A single Azure DevOps saved query returned by listSavedQueries
 */
export interface SavedQueryInfo {
  id: string;
  name: string;
  path: string;
  isPublic: boolean;
}

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

  /**
   * Create a dependency link between two work items
   * @param dependentId - The ID of the task that depends on another
   * @param predecessorId - The ID of the task that must be completed first
   */
  createDependencyLink?(
    dependentId: string,
    predecessorId: string
  ): Promise<void>;

  /**
   * List saved queries in the project (Azure DevOps only).
   * @param folder Optional folder path prefix to filter results.
   */
  listSavedQueries?(folder?: string): Promise<SavedQueryInfo[]>;

  /**
   * Fetch field schemas for a given work item type (or all fields if omitted).
   * Results are cached per session by the implementation.
   */
  getFieldSchemas?(workItemType?: string): Promise<ADoFieldSchema[]>;

  /** Returns available work item type names for the project */
  getWorkItemTypes?(): Promise<string[]>;
  /** Returns available state names for a given work item type */
  getStatesForWorkItemType?(workItemType: string): Promise<string[]>;
  /** Returns all area paths in the project */
  getAreaPaths?(): Promise<string[]>;
  /** Returns all iteration paths in the project */
  getIterationPaths?(): Promise<string[]>;
  /** Returns team names in the project */
  getTeams?(): Promise<string[]>;
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
