/**
 * A Template-independent query for Stories (see CONTEXT.md, "Story Search").
 * Deliberately separate from FilterCriteria: a Story Search is never part of a Template.
 */
export interface StorySearch {
  /** Matched against a Story's ID exactly, or its title by case-insensitive substring. */
  text?: string;
  workItemTypes?: string[];
  /** Types never returned, e.g. the platform's Task type when no types are chosen. */
  excludeWorkItemTypes?: string[];
  states?: string[];
  /** Area paths, each including its descendants. */
  areaPaths?: string[];
  /** Iteration paths, each including its descendants. */
  iterations?: string[];
  /** true: only Stories that already have child Work Items; false: only Stories without any; omitted: either. */
  hasTasks?: boolean;
  /** Only Stories in the team's current or next sprint. Needs the connection's team. */
  currentAndNextSprint?: boolean;
  /** Leave out Stories in a closed state: any state in the Completed or Removed category. */
  excludeClosed?: boolean;
  /** State names to leave out; adapters fill this in to honour `excludeClosed`. */
  excludeStates?: string[];
  /** Maximum number of Stories returned, newest first. */
  limit: number;
}
