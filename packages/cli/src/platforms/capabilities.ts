import type { IPlatformAdapter } from "@platforms/interfaces/platform.interface";
import type {
  ProjectMetadataReader,
  SavedQueryReader,
  StoryLearningPlatform,
} from "@platforms/interfaces/platform-capabilities";
import { ConfigurationError } from "@utils/errors";

type PlatformCapability = keyof IPlatformAdapter;

export function hasPlatformMethod<T extends PlatformCapability>(
  platform: IPlatformAdapter,
  method: T,
): platform is IPlatformAdapter & Required<Pick<IPlatformAdapter, T>> {
  return typeof platform[method] === "function";
}

export function hasStoryLearningPlatform(
  platform: IPlatformAdapter,
): platform is IPlatformAdapter & StoryLearningPlatform {
  return hasPlatformMethod(platform, "getWorkItem") && hasPlatformMethod(platform, "getChildren");
}

export function hasProjectMetadataReader(
  platform: IPlatformAdapter,
): platform is IPlatformAdapter & Required<ProjectMetadataReader> {
  return (
    hasPlatformMethod(platform, "getFieldSchemas") &&
    hasPlatformMethod(platform, "getWorkItemTypes") &&
    hasPlatformMethod(platform, "getStatesForWorkItemType") &&
    hasPlatformMethod(platform, "getAreaPaths") &&
    hasPlatformMethod(platform, "getIterationPaths") &&
    hasPlatformMethod(platform, "getTeams")
  );
}

export function hasSavedQueryReader(
  platform: IPlatformAdapter,
): platform is IPlatformAdapter & Required<SavedQueryReader> {
  return hasPlatformMethod(platform, "listSavedQueries");
}

export function requireStoryLearningPlatform(
  platform: IPlatformAdapter,
): StoryLearningPlatform {
  if (hasStoryLearningPlatform(platform)) {
    return platform;
  }

  throw new ConfigurationError(
    "The selected platform cannot learn from stories because it does not expose child tasks.",
  );
}

export function requireProjectMetadataReader(
  platform: IPlatformAdapter,
): Required<ProjectMetadataReader> {
  if (hasProjectMetadataReader(platform)) {
    return platform;
  }

  throw new ConfigurationError(
    "The selected platform cannot provide project metadata for template creation.",
  );
}

export function requireSavedQueryReader(
  platform: IPlatformAdapter,
): Required<SavedQueryReader> {
  if (hasSavedQueryReader(platform)) {
    return platform;
  }

  throw new ConfigurationError(
    "The selected platform cannot list saved queries.",
  );
}
