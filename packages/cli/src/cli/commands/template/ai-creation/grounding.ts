import { confirm, select, text } from "@clack/prompts";
import type { IPlatformAdapter } from "@sppg2001/atomize-core/platforms/interfaces/platform.interface";
import { PlatformFactory } from "@sppg2001/atomize-core/platforms/platform-factory";
import { fetchProjectGrounding, type ProjectGrounding } from "@sppg2001/atomize-core/services/template/project-grounding";
import { fetchStoryGrounding, type StoryGrounding, toStoryGroundingError } from "@sppg2001/atomize-core/services/template/story-grounding";
import { CancellationError, ConfigurationError } from "@sppg2001/atomize-core/utils/errors";
import { assertNotCancelled, createManagedSpinner, isInteractiveTerminal } from "@/cli/utilities/prompt-utilities";
import { browseStoriesInTerminal } from "@/cli/utilities/story-browser";

export interface GroundingInput {
  ground?: boolean;
  ai?: boolean;
  profile?: string;
  /** Comma-separated example Story IDs; implies `ground`. */
  fromStories?: string;
  includeSensitiveAiContext?: boolean;
}

export interface DraftGrounding {
  projectGrounding: ProjectGrounding | null;
  storyGrounding: StoryGrounding | null;
  storyIds: string[];
  sensitiveContextIncluded: boolean;
}

export interface DraftGroundingDeps {
  /** Opens an authenticated adapter for the chosen Connection Profile. */
  connect?: (profile?: string) => Promise<IPlatformAdapter>;
  interactive?: boolean;
  /** Lets the user pick example Stories; defaults to the CLI Story Browser in Story Search. */
  browse?: (adapter: IPlatformAdapter) => Promise<string[]>;
}

type Examples = { how: "flag"; ids: string[] } | { how: "pick" | "enter" } | { how: "none" };

const UNGROUNDED: DraftGrounding = { projectGrounding: null, storyGrounding: null, storyIds: [], sensitiveContextIncluded: false };

/**
 * Grounding for an AI draft (ADR-0069). `--ground` brings Project Grounding, `--from-stories` adds
 * example Stories and implies `--ground`, `--ai` alone is an Ungrounded Draft, and choosing AI from
 * the menu asks. Grounding that was asked for never disappears silently: interactive runs choose to
 * retry, continue without it, or cancel; non-interactive runs stop with an error.
 */
export async function resolveDraftGrounding(options: GroundingInput, deps: DraftGroundingDeps = {}): Promise<DraftGrounding> {
  const interactive = deps.interactive ?? isInteractiveTerminal();
  const connect = deps.connect ?? connectProfile;
  const browse = deps.browse ?? ((adapter) => browseStoriesInTerminal(adapter, {
    message: "Which example Stories show how your team breaks down this kind of work?",
    hasTasks: true,
  }));

  const wantsGrounding = options.fromStories !== undefined || options.ground || (!options.ai && interactive && await askToGround());
  if (!wantsGrounding) return UNGROUNDED;

  let examples: Examples = options.fromStories !== undefined
    ? { how: "flag", ids: parseIds(options.fromStories) }
    : interactive ? await askForExamples() : { how: "none" };
  const sensitive = examples.how === "none" ? false : await chooseSensitive(options, interactive);

  while (true) {
    const spinner = createManagedSpinner();
    try {
      spinner.start("Connecting to Azure DevOps…");
      const adapter = await connect(options.profile);
      spinner.message("Loading project metadata…");
      const projectGrounding = await fetchProjectGrounding(adapter);
      spinner.stop(
        `Project metadata loaded ✓ (${projectGrounding.workItemTypes.length} work item types, ${projectGrounding.savedQueries.length} saved queries)`,
      );
      if (examples.how === "none") return { ...UNGROUNDED, projectGrounding };

      const ids = examples.how === "flag" ? examples.ids : examples.how === "pick" ? await browse(adapter) : await enterStoryIds();
      const storySpinner = createManagedSpinner();
      storySpinner.start("Loading the example Stories and their Tasks…");
      try {
        const storyGrounding = await fetchStoryGrounding(adapter, ids, { includeSensitive: sensitive });
        storySpinner.stop(`Learning from ${storyGrounding.stories.length} example ${storyGrounding.stories.length === 1 ? "Story" : "Stories"} ✓`);
        return { projectGrounding, storyGrounding, storyIds: ids, sensitiveContextIncluded: sensitive };
      } catch (error) {
        storySpinner.stop("Could not use those Stories");
        throw error;
      }
    } catch (error) {
      spinner.stop("Grounding failed");
      const failure = toStoryGroundingError(error);
      const next = await decideAfterGroundingFailure(failure.message, {
        interactive,
        requestedWith: examples.how === "flag" ? "--from-stories" : "--ground",
        continueLabel: "Continue without grounding",
      });
      if (next === "ungrounded") return UNGROUNDED;
      // Unusable example Stories are re-chosen on retry rather than tried again as they were.
      if (failure.code === "GROUNDING_STORIES_UNUSABLE" && examples.how !== "flag") examples = await askForExamples();
    }
  }
}

/**
 * Grounding the user asked for never disappears silently (ADR-0069): an interactive run chooses to
 * retry, continue without it, or cancel; a non-interactive run stops with an error.
 */
export async function decideAfterGroundingFailure(
  message: string,
  context: { interactive: boolean; requestedWith: string; continueLabel: string },
): Promise<"retry" | "ungrounded"> {
  if (!context.interactive) {
    throw new ConfigurationError(
      `${message} Grounding was requested (${context.requestedWith}), so Atomize stopped instead of continuing without it.`,
    );
  }
  const next = assertNotCancelled(
    await select({
      message: `${message} What would you like to do?`,
      options: [
        { label: "Retry", value: "retry" },
        { label: context.continueLabel, value: "ungrounded" },
        { label: "Cancel", value: "cancel" },
      ],
    }),
  ) as string;
  if (next === "cancel") throw new CancellationError("AI request cancelled");
  return next as "retry" | "ungrounded";
}

async function askToGround(): Promise<boolean> {
  const choice = assertNotCancelled(
    await select({
      message: "Ground the draft in your Azure DevOps project?",
      options: [
        { label: "Yes — use the project's work item types, fields, and saved queries", value: "project" },
        { label: "No — draft without project metadata", value: "none" },
      ],
    }),
  ) as string;
  return choice === "project";
}

async function askForExamples(): Promise<Examples> {
  const choice = assertNotCancelled(
    await select({
      message: "Add example Stories your team broke down well? (optional)",
      options: [
        { label: "No — use project metadata only", value: "none" },
        { label: "Pick example Stories", value: "pick" },
        { label: "Enter Story IDs", value: "enter" },
      ],
    }),
  ) as string;
  return { how: choice as "none" | "pick" | "enter" };
}

/** Sensitive AI Context is a per-run choice, asked only when not already given on the command line. */
async function chooseSensitive(options: GroundingInput, interactive: boolean): Promise<boolean> {
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
      message: "Example Story IDs (comma-separated):",
      placeholder: "123, 456",
      validate: (input): string | undefined => (parseIds(input ?? "").length > 0 ? undefined : "Enter at least one Story ID"),
    }),
  );
  return parseIds(value);
}

function parseIds(value: string): string[] {
  return [...new Set(value.split(/[\s,]+/).map((id) => id.replace(/^#/, "").trim()).filter(Boolean))];
}

/** Opens an authenticated Azure DevOps adapter for a Connection Profile (the default one when omitted). */
export async function connectProfile(profile?: string): Promise<IPlatformAdapter> {
  const { resolveAzureConfig } = await import("@config/profile-resolver");
  const platform = PlatformFactory.create("azure-devops", await resolveAzureConfig(profile));
  await platform.authenticate();
  return platform;
}
