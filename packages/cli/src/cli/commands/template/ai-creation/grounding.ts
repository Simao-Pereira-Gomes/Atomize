import { select, text } from "@clack/prompts";
import { PlatformFactory } from "@platforms/platform-factory";
import { GroundingService } from "@services/template/grounding.service";
import { assertNotCancelled, createManagedSpinner } from "@/cli/utilities/prompt-utilities";

export interface GroundingInput {
  ground?: boolean;
  ai?: boolean;
  profile?: string;
}

export async function resolveGrounding(options: GroundingInput): Promise<string | null> {
  const wantsGrounding = options.ground ?? false;
  if (!wantsGrounding && options.ai) return null;

  const groundChoice = wantsGrounding
    ? "auto"
    : (assertNotCancelled(
        await select({
          message: "Ground generation with patterns from your Azure DevOps workspace?",
          options: [
            { label: "Auto-fetch recent stories from Azure DevOps", value: "auto" },
            { label: "Specify story IDs manually", value: "explicit" },
            { label: "Skip", value: "skip" },
          ],
        }),
      ) as string);

  if (groundChoice === "skip") return null;

  const groundSpinner = createManagedSpinner();
  groundSpinner.start("Fetching workspace patterns…");

  try {
    const { resolveAzureConfig } = await import("@config/profile-resolver");
    const adoConfig = await resolveAzureConfig(options.profile);
    const platform = PlatformFactory.create("azure-devops", adoConfig);
    await platform.authenticate();
    const groundingService = new GroundingService(platform);

    let groundingContext: string | null;
    if (groundChoice === "explicit") {
      groundSpinner.stop("Ready for story IDs");
      const storyIdsRaw = assertNotCancelled(
        await text({ message: "Enter story IDs to ground from (comma-separated):" }),
      );
      const storyIds = storyIdsRaw.split(",").map((s) => s.trim()).filter(Boolean);
      groundSpinner.start("Analysing stories…");
      groundingContext = await groundingService.fetchAndSummarize({ mode: "explicit", storyIds });
    } else {
      groundingContext = await groundingService.fetchAndSummarize({ mode: "auto" });
    }

    groundSpinner.stop(
      groundingContext
        ? "Workspace patterns loaded ✓"
        : "No usable patterns found — continuing without grounding",
    );
    return groundingContext;
  } catch {
    groundSpinner.stop("Could not load workspace patterns — continuing without grounding");
    return null;
  }
}
