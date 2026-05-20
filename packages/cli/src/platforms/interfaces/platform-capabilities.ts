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

export interface StoryLearningPlatform
  extends Pick<WorkItemReader, "getWorkItem">,
    ChildTaskReader {}

export interface TaskWriter {
  createTasksBulk(parentId: string, tasks: TaskDefinition[]): Promise<WorkItem[]>;
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
