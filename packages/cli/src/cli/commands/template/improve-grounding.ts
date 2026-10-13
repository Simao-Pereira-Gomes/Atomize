import { select } from "@clack/prompts";
import type { IPlatformAdapter } from "@sppg2001/atomize-core/platforms/interfaces/platform.interface";
import type { ProjectGrounding } from "@sppg2001/atomize-core/services/template/project-grounding";
import { assertNotCancelled } from "@/cli/utilities/prompt-utilities";
import { loadProjectGrounding } from "./ai-creation/grounding";

export interface ImproveGroundingOptions {
  ground?: boolean;
  profile?: string;
}

export interface ImproveGrounding {
  projectGrounding: ProjectGrounding | null;
}

export interface ImproveGroundingDeps {
  /** Opens an authenticated adapter for the chosen Connection Profile. */
  connect: (profile?: string) => Promise<IPlatformAdapter>;
  interactive: boolean;
}

/**
 * Grounding for a Template Improvement (ADR-0069): `--ground` brings Project Grounding; leaving it
 * out is an ungrounded improvement, and interactive runs ask.
 */
export async function resolveImproveGrounding(options: ImproveGroundingOptions, deps: ImproveGroundingDeps): Promise<ImproveGrounding> {
  const wantsGrounding = options.ground || (deps.interactive && await askToGround());
  if (!wantsGrounding) return { projectGrounding: null };
  return { projectGrounding: await loadProjectGrounding(options.profile, deps.connect, deps.interactive) };
}

async function askToGround(): Promise<boolean> {
  const choice = assertNotCancelled(
    await select({
      message: "Ground the improvement in your Azure DevOps project?",
      options: [
        { label: "Yes: use the project's work item types, fields, and saved queries", value: "project" },
        { label: "No grounding: review the Template on its own", value: "none" },
      ],
    }),
  ) as string;
  return choice === "project";
}
