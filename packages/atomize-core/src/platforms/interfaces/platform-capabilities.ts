import type { EstimationDefaultsProvider } from "./estimation-defaults.interface";
import type { FilterCriteria } from "./filter.interface";
import type { TaskDefinition, WorkItem } from "./work-item.interface";

export interface PlatformAuthenticator {
  authenticate(): Promise<void>;
  getPlatformMetadata(): {
    name: string;
    version: string;
    features?: string[];
    connected?: boolean;
  };
}

export interface WorkItemReader {
  getConnectUserEmail(): Promise<string>;
  queryWorkItems(filter: FilterCriteria): Promise<WorkItem[]>;
  getWorkItem(id: string): Promise<WorkItem | null>;
}

export interface ChildTaskReader {
  getChildren(parentId: string): Promise<WorkItem[]>;
}

export interface TaskWriter {
  /**
   * Creates the Tasks, returning those that were created in input order. `onTaskCreated` receives
   * each created Task with its index in `tasks`, so callers can tell which inputs failed.
   */
  createTasksBulk(
    parentId: string,
    tasks: TaskDefinition[],
    onTaskCreated?: (task: WorkItem, index: number) => void,
  ): Promise<WorkItem[]>;
  /**
   * True when createTasksBulk links each Task's `predecessorIds` as part of creating it, so
   * dependencies cost no extra request. Otherwise they are linked afterwards via createDependencyLink.
   */
  readonly createsDependencyLinksWithTasks?: boolean;
}

export interface DependencyLinker {
  createDependencyLink(
    dependentId: string,
    predecessorId: string,
  ): Promise<void>;
}

export interface GenerationPlatform
  extends Pick<WorkItemReader, "getConnectUserEmail" | "queryWorkItems">,
    TaskWriter {
  createDependencyLink?: DependencyLinker["createDependencyLink"];
  getEstimationDefaults?: EstimationDefaultsProvider["getEstimationDefaults"];
}

export interface ProjectMetadataReader {
  getFieldSchemas?(
    workItemType?: string,
  ): Promise<import("./field-schema.interface").ADoFieldSchema[]>;
  getWorkItemTypes?(): Promise<string[]>;
  getStatesForWorkItemType?(workItemType: string): Promise<string[]>;
  getAreaPaths?(): Promise<string[]>;
  getIterationPaths?(): Promise<string[]>;
  getTeams?(): Promise<string[]>;
}

export interface SavedQueryReader {
  listSavedQueries?(
    folder?: string,
  ): Promise<import("./platform.interface").SavedQueryInfo[]>;
}
