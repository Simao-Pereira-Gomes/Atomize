import type { AtomizationReport } from "@core/atomizer";
import type {
  GenerationPlatform,
  PlatformAuthenticator,
  ProjectMetadataReader,
} from "@platforms/interfaces/platform-capabilities";
import type { TaskTemplate } from "@templates/schema";
import type { OutputSink } from "@/cli/utilities/output-sink";
import { connectPlatform, runAtomization } from "./atomize-orchestrator";
import { validateCustomFieldsPreFlight } from "./generation-preflight";

export interface GenerateWorkflowOptions {
  dryRun: boolean;
  continueOnError: boolean;
  limit?: number;
  storyIds?: string[];
  storyConcurrency: number;
  dependencyConcurrency: number;
  forceNormalize: boolean;
  isTTYSession: boolean;
  profileLabel?: string;
}

export async function runGenerateWorkflow(
  template: TaskTemplate,
  platform: PlatformAuthenticator & GenerationPlatform & ProjectMetadataReader,
  options: GenerateWorkflowOptions,
  output: OutputSink,
): Promise<AtomizationReport> {
  await connectPlatform(
    platform,
    { isTTYSession: options.isTTYSession, profileLabel: options.profileLabel },
    output,
  );

  await validateCustomFieldsPreFlight(template, platform);

  return runAtomization(template, platform, {
    dryRun: options.dryRun,
    continueOnError: options.continueOnError,
    limit: options.limit,
    storyIds: options.storyIds,
    storyConcurrency: options.storyConcurrency,
    dependencyConcurrency: options.dependencyConcurrency,
    forceNormalize: options.forceNormalize,
    isTTYSession: options.isTTYSession,
  }, output);
}
