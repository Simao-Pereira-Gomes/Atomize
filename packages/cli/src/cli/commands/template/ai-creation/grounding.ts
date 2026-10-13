import { select } from "@clack/prompts";
import type { IPlatformAdapter } from "@sppg2001/atomize-core/platforms/interfaces/platform.interface";
import { PlatformFactory } from "@sppg2001/atomize-core/platforms/platform-factory";
import { fetchProjectGrounding, type ProjectGrounding, toProjectGroundingError } from "@sppg2001/atomize-core/services/template/project-grounding";
import { CancellationError, ConfigurationError } from "@sppg2001/atomize-core/utils/errors";
import { assertNotCancelled, createManagedSpinner, isInteractiveTerminal } from "@/cli/utilities/prompt-utilities";

export interface GroundingInput {
  ground?: boolean;
  ai?: boolean;
  profile?: string;
}

export interface DraftGrounding {
  projectGrounding: ProjectGrounding | null;
}

export interface DraftGroundingDeps {
  /** Opens an authenticated adapter for the chosen Connection Profile. */
  connect?: (profile?: string) => Promise<IPlatformAdapter>;
  interactive?: boolean;
}

const UNGROUNDED: DraftGrounding = { projectGrounding: null };

/**
 * Grounding for an AI draft (ADR-0069): `--ground` brings Project Grounding, `--ai` alone is an
 * Ungrounded Draft, and choosing AI from the menu asks. Drafts take no Story Grounding: Stories are
 * evidence for improving a Template. Grounding that was asked for never disappears silently:
 * interactive runs choose to retry, continue without it, or cancel; non-interactive runs stop with an error.
 */
export async function resolveDraftGrounding(options: GroundingInput, deps: DraftGroundingDeps = {}): Promise<DraftGrounding> {
  const interactive = deps.interactive ?? isInteractiveTerminal();
  const connect = deps.connect ?? connectProfile;

  const wantsGrounding = options.ground || (!options.ai && interactive && await askToGround());
  if (!wantsGrounding) return UNGROUNDED;

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
      return { projectGrounding };
    } catch (error) {
      spinner.stop("Grounding failed");
      const next = await decideAfterGroundingFailure(toProjectGroundingError(error).message, {
        interactive,
        requestedWith: "--ground",
        continueLabel: "Continue without grounding",
      });
      if (next === "ungrounded") return UNGROUNDED;
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
        { label: "Yes: use the project's work item types, fields, and saved queries", value: "project" },
        { label: "No: draft without project metadata", value: "none" },
      ],
    }),
  ) as string;
  return choice === "project";
}

/** Opens an authenticated Azure DevOps adapter for a Connection Profile (the default one when omitted). */
export async function connectProfile(profile?: string): Promise<IPlatformAdapter> {
  const { resolveAzureConfig } = await import("@config/profile-resolver");
  const platform = PlatformFactory.create("azure-devops", await resolveAzureConfig(profile));
  await platform.authenticate();
  return platform;
}
