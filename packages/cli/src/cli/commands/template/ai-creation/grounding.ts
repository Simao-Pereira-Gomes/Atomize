import { select } from "@clack/prompts";
import { PlatformFactory } from "@sppg2001/atomize-core/platforms/platform-factory";
import {
  fetchProjectGrounding,
  type ProjectGrounding,
  toProjectGroundingError,
} from "@sppg2001/atomize-core/services/template/project-grounding";
import { CancellationError, ConfigurationError } from "@sppg2001/atomize-core/utils/errors";
import { assertNotCancelled, createManagedSpinner, isInteractiveTerminal } from "@/cli/utilities/prompt-utilities";

export interface GroundingInput {
  ground?: boolean;
  ai?: boolean;
  profile?: string;
}

export type ProjectGroundingLoader = (profile?: string) => Promise<ProjectGrounding>;

/**
 * Decides whether an AI draft gets Project Grounding and fetches it (ADR-0069). `--ground` asks
 * for it, `--ai` alone means an Ungrounded Draft, and choosing AI from the menu asks the user.
 * Grounding that was asked for never disappears silently: interactive runs choose to retry,
 * continue without it, or cancel; non-interactive runs stop with an error.
 */
export async function resolveProjectGrounding(
  options: GroundingInput,
  deps: { load?: ProjectGroundingLoader; interactive?: boolean } = {},
): Promise<ProjectGrounding | null> {
  const load = deps.load ?? loadProjectGrounding;
  const interactive = deps.interactive ?? isInteractiveTerminal();

  if (!options.ground) {
    if (options.ai || !interactive) return null;
    const choice = assertNotCancelled(
      await select({
        message: "Ground the draft in your Azure DevOps project?",
        options: [
          { label: "Yes — use the project's work item types, fields, and saved queries", value: "project" },
          { label: "No — draft without project metadata", value: "none" },
        ],
      }),
    ) as string;
    if (choice === "none") return null;
  }

  while (true) {
    const spinner = createManagedSpinner();
    spinner.start("Loading project metadata…");
    try {
      const grounding = await load(options.profile);
      spinner.stop(
        `Project metadata loaded ✓ (${grounding.workItemTypes.length} work item types, ${grounding.savedQueries.length} saved queries)`,
      );
      return grounding;
    } catch (error) {
      spinner.stop("Could not load project metadata");
      const next = await decideAfterGroundingFailure(toProjectGroundingError(error).message, {
        interactive,
        requestedWith: "--ground",
        continueLabel: "Continue without project metadata",
      });
      if (next === "ungrounded") return null;
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

async function loadProjectGrounding(profile?: string): Promise<ProjectGrounding> {
  const { resolveAzureConfig } = await import("@config/profile-resolver");
  const platform = PlatformFactory.create("azure-devops", await resolveAzureConfig(profile));
  await platform.authenticate();
  return fetchProjectGrounding(platform);
}
