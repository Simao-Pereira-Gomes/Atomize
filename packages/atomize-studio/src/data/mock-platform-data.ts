// Temporary mock ADO data — replace with CLI invocations when ADO integration lands

export const WORK_ITEM_TYPES = ["User Story", "Bug", "Task", "Feature", "Epic", "Test Case"];
export const STATES          = ["New", "Active", "Resolved", "Closed", "Removed"];
export const AREA_PATHS      = ["@TeamAreas", "MyProject\\Team Alpha", "MyProject\\Team Beta", "MyProject\\Backend", "MyProject\\Frontend"];
export const ITERATIONS      = ["@CurrentIteration", "Sprint 1", "Sprint 2", "Sprint 3", "Sprint 4", "Sprint 5", "Sprint 6"];
export const ASSIGNEES       = ["@Me", "alice@example.com", "bob@example.com", "carol@example.com", "dave@example.com"];

export const SAVED_QUERIES: { id: string; path: string }[] = [
  { id: "a1b2c3d4-0000-0000-0000-000000000001", path: "My Queries/Sprint Stories"            },
  { id: "a1b2c3d4-0000-0000-0000-000000000002", path: "My Queries/Active Bugs"               },
  { id: "a1b2c3d4-0000-0000-0000-000000000003", path: "Shared Queries/Team Alpha/Backlog"    },
  { id: "a1b2c3d4-0000-0000-0000-000000000004", path: "Shared Queries/Team Beta/Backlog"     },
  { id: "a1b2c3d4-0000-0000-0000-000000000005", path: "Shared Queries/All Active Stories"    },
  { id: "a1b2c3d4-0000-0000-0000-000000000006", path: "Shared Queries/Current Sprint"        },
  { id: "a1b2c3d4-0000-0000-0000-000000000007", path: "Shared Queries/Unassigned Work Items" },
];

export function queryPathToId(path: string): string {
  return SAVED_QUERIES.find((q) => q.path === path)?.id ?? path;
}

export function queryIdToPath(id: string): string {
  return SAVED_QUERIES.find((q) => q.id === id)?.path ?? id;
}
