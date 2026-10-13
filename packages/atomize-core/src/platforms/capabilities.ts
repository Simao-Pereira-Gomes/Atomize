import { ConfigurationError } from "../utils/errors";
import type { IPlatformAdapter } from "./interfaces/platform.interface";
import type {
  ProjectMetadataReader,
  SavedQueryReader,
} from "./interfaces/platform-capabilities";

type PlatformCapability = keyof IPlatformAdapter;

export function hasPlatformMethod<T extends PlatformCapability>(
  platform: IPlatformAdapter,
  method: T,
): platform is IPlatformAdapter & Required<Pick<IPlatformAdapter, T>> {
  return typeof platform[method] === "function";
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

export function hasStorySearch(
  platform: IPlatformAdapter,
): platform is IPlatformAdapter & Required<Pick<IPlatformAdapter, "searchStories">> {
  return hasPlatformMethod(platform, "searchStories");
}

export function hasWikiReader(
  platform: IPlatformAdapter,
): platform is IPlatformAdapter & Required<Pick<IPlatformAdapter, "listWikis" | "listWikiPages" | "readWikiPage">> {
  return hasPlatformMethod(platform, "listWikis")
    && hasPlatformMethod(platform, "listWikiPages")
    && hasPlatformMethod(platform, "readWikiPage");
}

export function hasSavedQueryReader(
  platform: IPlatformAdapter,
): platform is IPlatformAdapter & Required<SavedQueryReader> {
  return hasPlatformMethod(platform, "listSavedQueries");
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
