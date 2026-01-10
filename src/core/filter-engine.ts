import { logger } from "@config/logger";
import type { FilterCriteria as PlatformFilter } from "@platforms/interfaces/filter.interface";
import type { FilterCriteria as TemplateFilter } from "@templates/schema";
import type { WorkItemType } from "@/platforms";

/**
 * Filter Engine
 * Converts template filter criteria to platform-specific queries
 */
export class FilterEngine {
  /**
   * Convert template filter to platform filter
   */
  convertFilter(templateFilter: TemplateFilter): PlatformFilter {
    const platformFilter: PlatformFilter = {};
    const workItems: WorkItemType[] =
      templateFilter.workItemTypes?.map((t) => t as WorkItemType) || [];
    if (templateFilter.workItemTypes) {
      platformFilter.workItemTypes = workItems;
    }

    if (templateFilter.states) {
      platformFilter.states = templateFilter.states;
    }

    if (templateFilter.tags) {
      platformFilter.tags = {
        include: templateFilter.tags.include,
        exclude: templateFilter.tags.exclude,
      };
    }

    if (templateFilter.areaPaths) {
      platformFilter.areaPaths = templateFilter.areaPaths;
    }

    if (templateFilter.iterations) {
      platformFilter.iterations = templateFilter.iterations;
    }

    if (templateFilter.assignedTo) {
      platformFilter.assignedTo = templateFilter.assignedTo;
    }

    if (templateFilter.priority) {
      platformFilter.priority = {
        min: templateFilter.priority.min,
        max: templateFilter.priority.max,
      };
    }

    if (templateFilter.excludeIfHasTasks !== undefined) {
      platformFilter.excludeIfHasTasks = templateFilter.excludeIfHasTasks;
    }

    if (templateFilter.customFields) {
      platformFilter.customFields = templateFilter.customFields;
    }

    if (templateFilter.customQuery) {
      platformFilter.customQuery = templateFilter.customQuery;
    }

    return platformFilter;
  }

  /**
   * Validate filter criteria
   */
  validateFilter(filter: TemplateFilter): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    const hasCriteria =
      filter.workItemTypes ||
      filter.states ||
      filter.tags ||
      filter.areaPaths ||
      filter.iterations ||
      filter.assignedTo ||
      filter.priority ||
      filter.customFields ||
      filter.customQuery;

    if (!hasCriteria) {
      errors.push("Filter must have at least one criterion");
    }

    if (filter.workItemTypes && filter.workItemTypes.length === 0) {
      errors.push("workItemTypes cannot be empty array");
    }

    if (filter.states && filter.states.length === 0) {
      errors.push("states cannot be empty array");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Merge multiple filters (for complex scenarios)
   */
  mergeFilters(filters: TemplateFilter[]): TemplateFilter {
    logger.debug(`FilterEngine: Merging ${filters.length} filters`);

    const merged: TemplateFilter = {};

    for (const filter of filters) {
      if (filter.workItemTypes) {
        merged.workItemTypes = [
          ...(merged.workItemTypes || []),
          ...filter.workItemTypes,
        ];
        merged.workItemTypes = [...new Set(merged.workItemTypes)];
      }

      if (filter.states) {
        merged.states = [...(merged.states || []), ...filter.states];
        merged.states = [...new Set(merged.states)];
      }

      if (filter.tags) {
        if (!merged.tags) {
          merged.tags = {};
        }
        if (filter.tags.include) {
          merged.tags.include = [
            ...(merged.tags.include || []),
            ...filter.tags.include,
          ];
          merged.tags.include = [...new Set(merged.tags.include)];
        }
        if (filter.tags.exclude) {
          merged.tags.exclude = [
            ...(merged.tags.exclude || []),
            ...filter.tags.exclude,
          ];
          merged.tags.exclude = [...new Set(merged.tags.exclude)];
        }
      }

      if (filter.excludeIfHasTasks !== undefined) {
        merged.excludeIfHasTasks = filter.excludeIfHasTasks;
      }
      if (filter.customQuery) {
        merged.customQuery = filter.customQuery;
      }
    }

    return merged;
  }
}
