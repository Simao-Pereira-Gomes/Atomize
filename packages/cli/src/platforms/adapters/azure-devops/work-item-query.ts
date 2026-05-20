import type { FilterCriteria } from "@platforms/interfaces/filter.interface";
import { CURRENT_ITERATION, TEAM_AREAS } from "@templates/schema";

const CURRENT_ITERATION_OFFSET_RE = /^@CurrentIteration\s*([+-])\s*(\d+)$/i;
const DATE_MACRO_RE =
  /^(@Today|@StartOfDay|@StartOfMonth|@StartOfWeek|@StartOfYear)(?:\s*([+-])\s*(\d+))?$/i;
const DATE_MACRO_CANONICAL: Record<string, string> = {
  "@today": "@Today",
  "@startofday": "@StartOfDay",
  "@startofmonth": "@StartOfMonth",
  "@startofweek": "@StartOfWeek",
  "@startofyear": "@StartOfYear",
};

export function buildWorkItemWiqlQuery(
  filter: FilterCriteria,
  project: string,
): string {
  const conditions: string[] = [];

  conditions.push(`[System.TeamProject] = '${wiqlEscape(project)}'`);

  if (filter.workItemTypes && filter.workItemTypes.length > 0) {
    const types = filter.workItemTypes
      .map((type) => `'${wiqlEscape(type)}'`)
      .join(", ");
    conditions.push(`[System.WorkItemType] IN (${types})`);
  }

  if (filter.states && filter.states.length > 0) {
    const states = filter.states.map((state) => `'${wiqlEscape(state)}'`).join(", ");
    conditions.push(`[System.State] IN (${states})`);
  }

  if (filter.statesExclude && filter.statesExclude.length > 0) {
    const states = filter.statesExclude
      .map((state) => `'${wiqlEscape(state)}'`)
      .join(", ");
    conditions.push(`[System.State] NOT IN (${states})`);
  }

  if (filter.statesWereEver && filter.statesWereEver.length > 0) {
    const clauses = filter.statesWereEver.map(
      (state) => `[System.State] WAS EVER '${wiqlEscape(state)}'`,
    );
    conditions.push(
      clauses.length === 1 ? clauses.join("") : `(${clauses.join(" OR ")})`,
    );
  }

  if (filter.tags?.include && filter.tags.include.length > 0) {
    const tagConditions = filter.tags.include.map(
      (tag) => `[System.Tags] CONTAINS '${wiqlEscape(tag)}'`,
    );
    conditions.push(`(${tagConditions.join(" OR ")})`);
  }

  if (filter.tags?.exclude && filter.tags.exclude.length > 0) {
    for (const tag of filter.tags.exclude) {
      conditions.push(`[System.Tags] NOT CONTAINS '${wiqlEscape(tag)}'`);
    }
  }

  appendAreaPathConditions(conditions, filter);
  appendIterationConditions(conditions, filter);

  if (filter.assignedTo && filter.assignedTo.length > 0) {
    const users = filter.assignedTo
      .map((user) => `'${wiqlEscape(user)}'`)
      .join(", ");
    conditions.push(`[System.AssignedTo] IN (${users})`);
  }

  if (filter.priority) {
    if (filter.priority.min !== undefined) {
      conditions.push(`[Microsoft.VSTS.Common.Priority] >= ${filter.priority.min}`);
    }
    if (filter.priority.max !== undefined) {
      conditions.push(`[Microsoft.VSTS.Common.Priority] <= ${filter.priority.max}`);
    }
  }

  if (filter.changedAfter) {
    conditions.push(`[System.ChangedDate] >= ${formatDateMacro(filter.changedAfter)}`);
  }

  if (filter.createdAfter) {
    conditions.push(`[System.CreatedDate] >= ${formatDateMacro(filter.createdAfter)}`);
  }

  return `SELECT [System.Id] FROM WorkItems WHERE ${conditions.join(" AND ")}`;
}

export function workItemQueryRequiresTeam(filter: FilterCriteria): boolean {
  if (filter.areaPaths?.includes(TEAM_AREAS)) return true;
  return filter.iterations?.some((iteration) => parseIterationMacro(iteration) !== null) ?? false;
}

function appendAreaPathConditions(
  conditions: string[],
  filter: FilterCriteria,
): void {
  if (filter.areaPaths && filter.areaPaths.length > 0) {
    const hasTeamAreas = filter.areaPaths.includes(TEAM_AREAS);
    const realPaths = filter.areaPaths.filter((path) => path !== TEAM_AREAS);

    if (hasTeamAreas && realPaths.length === 0) {
      conditions.push("[System.AreaPath] IN (@TeamAreas)");
    } else if (!hasTeamAreas && realPaths.length > 0) {
      const quoted = realPaths.map((path) => `'${wiqlEscape(path)}'`).join(", ");
      conditions.push(`[System.AreaPath] IN (${quoted})`);
    } else if (hasTeamAreas && realPaths.length > 0) {
      const quoted = realPaths.map((path) => `'${wiqlEscape(path)}'`).join(", ");
      conditions.push(
        `([System.AreaPath] IN (${quoted}) OR [System.AreaPath] IN (@TeamAreas))`,
      );
    }
  }

  if (filter.areaPathsUnder && filter.areaPathsUnder.length > 0) {
    const clauses = filter.areaPathsUnder.map(
      (path) => `[System.AreaPath] UNDER '${wiqlEscape(path)}'`,
    );
    conditions.push(
      clauses.length === 1 ? clauses.join("") : `(${clauses.join(" OR ")})`,
    );
  }
}

function appendIterationConditions(
  conditions: string[],
  filter: FilterCriteria,
): void {
  if (filter.iterations && filter.iterations.length > 0) {
    const iterConditions: string[] = [];
    const realPaths: string[] = [];

    for (const iteration of filter.iterations) {
      const macro = parseIterationMacro(iteration);
      if (macro) {
        iterConditions.push(`[System.IterationPath] = ${macro}`);
      } else {
        realPaths.push(iteration);
      }
    }

    if (realPaths.length > 0) {
      const quoted = realPaths.map((iteration) => `'${wiqlEscape(iteration)}'`).join(", ");
      iterConditions.push(`[System.IterationPath] IN (${quoted})`);
    }

    if (iterConditions.length > 0) {
      conditions.push(
        iterConditions.length === 1
          ? iterConditions.join("")
          : `(${iterConditions.join(" OR ")})`,
      );
    }
  }

  if (filter.iterationsUnder && filter.iterationsUnder.length > 0) {
    const clauses = filter.iterationsUnder.map(
      (path) => `[System.IterationPath] UNDER '${wiqlEscape(path)}'`,
    );
    conditions.push(
      clauses.length === 1 ? clauses.join("") : `(${clauses.join(" OR ")})`,
    );
  }
}

function wiqlEscape(value: string): string {
  return value.replace(/'/g, "''");
}

function parseIterationMacro(value: string): string | null {
  if (value === CURRENT_ITERATION) return "@CurrentIteration";
  const match = value.match(CURRENT_ITERATION_OFFSET_RE);
  if (match) return `@CurrentIteration ${match[1]} ${match[2]}`;
  return null;
}

function formatDateMacro(value: string): string {
  const match = value.match(DATE_MACRO_RE);
  if (!match?.[1]) return `'${wiqlEscape(value)}'`;
  const canonical = DATE_MACRO_CANONICAL[match[1].toLowerCase()] ?? match[1];
  if (!match[2] || !match[3]) return canonical;
  return `${canonical} ${match[2]} ${match[3]}`;
}
