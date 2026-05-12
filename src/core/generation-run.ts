import type { GenerationPlatform } from "@platforms/interfaces/platform-capabilities";
import type { TaskTemplate } from "@templates/schema";
import type { AtomizationOptions, AtomizationReport } from "./atomizer";
import { Atomizer } from "./atomizer";

export const DEFAULT_GENERATION_TIMEOUT_MS = 5 * 60 * 1_000;

export interface GenerationRunOptions
  extends Pick<
    AtomizationOptions,
    | "dryRun"
    | "continueOnError"
    | "limit"
    | "storyIds"
    | "storyConcurrency"
    | "dependencyConcurrency"
    | "forceNormalize"
    | "onProgress"
  > {
  timeoutMs?: number;
}

export class GenerationRun {
  constructor(private readonly platform: GenerationPlatform) {}

  execute(
    template: TaskTemplate,
    options: GenerationRunOptions,
  ): Promise<AtomizationReport> {
    const { timeoutMs = DEFAULT_GENERATION_TIMEOUT_MS, ...atomizationOptions } = options;
    return Promise.race([
      new Atomizer(this.platform).atomize(template, atomizationOptions),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("Generation timed out after 5 minutes. The Azure DevOps API may be unresponsive.")),
          timeoutMs,
        ),
      ),
    ]);
  }
}
