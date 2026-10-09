import { autocomplete, autocompleteMultiselect } from "@clack/prompts";
import { requireProjectMetadataReader } from "@sppg2001/atomize-core/platforms/capabilities";
import type { IPlatformAdapter } from "@sppg2001/atomize-core/platforms/interfaces/platform.interface";
import { type StorySummary, searchStories } from "@sppg2001/atomize-core/services/story-search";
import { listAppliedStories } from "@sppg2001/atomize-core/services/template/story-grounding";
import type { FilterCriteria as TemplateFilter } from "@sppg2001/atomize-core/templates/schema";
import { assertNotCancelled, sanitizeTty } from "@/cli/utilities/prompt-utilities";

const SEARCH = "__search__";
const ANY = "__any__";

export interface TerminalStoryBrowserOptions {
  message: string;
  /** Opens on the Stories this Template has been applied to; omit to open straight in Story Search. */
  templateFilter?: TemplateFilter;
  /** Whether Story Search keeps only Stories that already have Tasks. */
  hasTasks?: boolean;
}

/**
 * The CLI Story Browser (see CONTEXT.md): type to filter by ID or title and pick several Stories,
 * switching to a Story Search narrowed by area path and iteration when a Story isn't listed.
 * Nothing is pre-selected, and at least one Story must be chosen.
 */
export async function browseStoriesInTerminal(adapter: IPlatformAdapter, options: TerminalStoryBrowserOptions): Promise<string[]> {
  if (options.templateFilter) {
    const applied = await listAppliedStories(adapter, options.templateFilter);
    if (applied.length > 0) {
      const picked = await pickStories(options.message, applied, true);
      if (!picked.includes(SEARCH)) return picked;
    }
  }
  return pickStories(options.message, await searchInTerminal(adapter, options.hasTasks ?? true), false);
}

async function pickStories(message: string, stories: StorySummary[], offerSearch: boolean): Promise<string[]> {
  if (stories.length === 0) throw new Error("No Stories match. Try a different area or iteration, or enter Story IDs instead.");
  const picked = assertNotCancelled(
    await autocompleteMultiselect<string>({
      message,
      placeholder: "Type an ID or part of a title",
      options: [
        ...stories.map((story) => ({
          value: story.id,
          label: sanitizeTty(`#${story.id} ${story.title}`),
          hint: `${story.taskCount} ${story.taskCount === 1 ? "task" : "tasks"}`,
        })),
        ...(offerSearch ? [{ value: SEARCH, label: "Search all Stories instead…" }] : []),
      ],
      required: true,
    }),
  ) as string[];
  return picked.includes(SEARCH) ? [SEARCH] : picked;
}

async function searchInTerminal(adapter: IPlatformAdapter, hasTasks: boolean): Promise<StorySummary[]> {
  const metadata = requireProjectMetadataReader(adapter);
  const [areaPaths, iterations] = await Promise.all([metadata.getAreaPaths(), metadata.getIterationPaths()]);
  const area = await choosePath("Narrow to an area path (includes its sub-areas):", "Any area", areaPaths);
  const iteration = await choosePath("Narrow to an iteration (includes its sub-iterations):", "Any iteration", iterations);
  return searchStories(adapter, {
    ...(area ? { areaPaths: [area] } : {}),
    ...(iteration ? { iterations: [iteration] } : {}),
    ...(hasTasks ? { hasTasks: true } : {}),
  });
}

async function choosePath(message: string, anyLabel: string, paths: string[]): Promise<string | undefined> {
  const choice = assertNotCancelled(
    await autocomplete<string>({
      message,
      placeholder: "Type to filter",
      options: [{ value: ANY, label: anyLabel }, ...paths.map((path) => ({ value: path, label: sanitizeTty(path) }))],
    }),
  ) as string;
  return choice === ANY ? undefined : choice;
}
