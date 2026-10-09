import { confirm, select, text } from "@clack/prompts";
import type { IPlatformAdapter } from "@sppg2001/atomize-core/platforms/interfaces/platform.interface";
import { fetchProjectGrounding, type ProjectGrounding } from "@sppg2001/atomize-core/services/template/project-grounding";
import { fetchStoryGrounding, type StoryGrounding, toStoryGroundingError } from "@sppg2001/atomize-core/services/template/story-grounding";
import type { FilterCriteria as TemplateFilter } from "@sppg2001/atomize-core/templates/schema";
import { assertNotCancelled, createManagedSpinner } from "@/cli/utilities/prompt-utilities";
import { browseStoriesInTerminal } from "@/cli/utilities/story-browser";
import { decideAfterGroundingFailure } from "./ai-creation/grounding";

export interface ImproveGroundingOptions {
  ground?: boolean;
  profile?: string;
  /** Comma-separated Story IDs; implies `ground`. */
  fromStories?: string;
  includeSensitiveAiContext?: boolean;
}

export interface ImproveGrounding {
  projectGrounding: ProjectGrounding | null;
  storyGrounding: StoryGrounding | null;
  storyIds: string[];
  sensitiveContextIncluded: boolean;
}

export interface ImproveGroundingDeps {
  /** Opens an authenticated adapter for the chosen Connection Profile. */
  connect: (profile?: string) => Promise<IPlatformAdapter>;
  interactive: boolean;
  /** Lets the user pick Stories; defaults to the CLI Story Browser. */
  browse?: (adapter: IPlatformAdapter, templateFilter: TemplateFilter) => Promise<string[]>;
}

type Plan = { kind: "none" } | { kind: "project" } | { kind: "stories"; ids?: string[]; how: "flag" | "pick" | "enter" };

const UNGROUNDED: ImproveGrounding = { projectGrounding: null, storyGrounding: null, storyIds: [], sensitiveContextIncluded: false };

/**
 * Grounding for a Template Improvement (ADR-0069): a Connection Profile always brings Project
 * Grounding, and Stories the Template was applied to are optional evidence on top. `--from-stories`
 * implies `--ground`; leaving both out is an ungrounded improvement, and interactive runs ask.
 */
export async function resolveImproveGrounding(
  options: ImproveGroundingOptions,
  templateFilter: TemplateFilter,
  deps: ImproveGroundingDeps,
): Promise<ImproveGrounding> {
  const plan = await choosePlan(options, deps.interactive);
  if (plan.kind === "none") return UNGROUNDED;

  const sensitive = plan.kind === "stories" ? await chooseSensitive(options, deps.interactive) : false;
  const browse = deps.browse ?? ((adapter, filter) => browseStoriesInTerminal(adapter, {
    message: "Which Stories should the improvement learn from?",
    templateFilter: filter,
  }));

  while (true) {
    const spinner = createManagedSpinner();
    try {
      spinner.start("Connecting to Azure DevOps…");
      const adapter = await deps.connect(options.profile);
      spinner.message("Loading project metadata…");
      const projectGrounding = await fetchProjectGrounding(adapter);
      spinner.stop("Project metadata loaded ✓");
      if (plan.kind === "project") return { ...UNGROUNDED, projectGrounding };

      const ids = plan.ids ?? (plan.how === "pick" ? await browse(adapter, templateFilter) : await enterStoryIds());
      const storySpinner = createManagedSpinner();
      storySpinner.start("Loading the Stories and their Tasks…");
      try {
        const storyGrounding = await fetchStoryGrounding(adapter, ids, { includeSensitive: sensitive });
        storySpinner.stop(`Learning from ${storyGrounding.stories.length} ${storyGrounding.stories.length === 1 ? "Story" : "Stories"} ✓`);
        return { projectGrounding, storyGrounding, storyIds: ids, sensitiveContextIncluded: sensitive };
      } catch (error) {
        storySpinner.stop("Could not use those Stories");
        throw error;
      }
    } catch (error) {
      spinner.stop("Grounding failed");
      const next = await decideAfterGroundingFailure(toStoryGroundingError(error).message, {
        interactive: deps.interactive,
        requestedWith: plan.kind === "stories" && plan.how === "flag" ? "--from-stories" : "--ground",
        continueLabel: "Continue without grounding",
      });
      if (next === "ungrounded") return UNGROUNDED;
    }
  }
}

async function choosePlan(options: ImproveGroundingOptions, interactive: boolean): Promise<Plan> {
  if (options.fromStories !== undefined) return { kind: "stories", ids: parseIds(options.fromStories), how: "flag" };
  if (options.ground) return { kind: "project" };
  if (!interactive) return { kind: "none" };

  const choice = assertNotCancelled(
    await select({
      message: "Ground the improvement in your Azure DevOps project?",
      options: [
        { label: "Learn from Stories this Template was applied to", value: "pick" },
        { label: "Enter Story IDs to learn from", value: "enter" },
        { label: "Use the project's metadata only", value: "project" },
        { label: "No grounding — review the Template on its own", value: "none" },
      ],
    }),
  ) as string;
  if (choice === "none") return { kind: "none" };
  if (choice === "project") return { kind: "project" };
  return { kind: "stories", how: choice as "pick" | "enter" };
}

/** Sensitive AI Context is a per-run choice, asked only when not already given on the command line. */
async function chooseSensitive(options: ImproveGroundingOptions, interactive: boolean): Promise<boolean> {
  if (options.includeSensitiveAiContext !== undefined) return options.includeSensitiveAiContext;
  if (!interactive) return false;
  return assertNotCancelled(
    await confirm({
      message: "Also send the Stories' descriptions and acceptance criteria? They can hold customer, personal, or internal details.",
      initialValue: false,
    }),
  ) as boolean;
}

async function enterStoryIds(): Promise<string[]> {
  const value = assertNotCancelled(
    await text({
      message: "Story IDs to learn from (comma-separated):",
      placeholder: "123, 456",
      validate: (input): string | undefined => (parseIds(input ?? "").length > 0 ? undefined : "Enter at least one Story ID"),
    }),
  );
  return parseIds(value);
}

function parseIds(value: string): string[] {
  return [...new Set(value.split(/[\s,]+/).map((id) => id.replace(/^#/, "").trim()).filter(Boolean))];
}
