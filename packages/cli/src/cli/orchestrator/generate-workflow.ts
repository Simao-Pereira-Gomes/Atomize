import type { AtomizationReport } from "@sppg2001/atomize-core/core/atomizer";
import type {
  GenerationPlatform,
  PlatformAuthenticator,
  ProjectMetadataReader,
} from "@sppg2001/atomize-core/platforms/interfaces/platform-capabilities";
import type { TaskTemplate } from "@sppg2001/atomize-core/templates/schema";
import { type RunTimings, timePhase } from "@sppg2001/atomize-core/utils/run-timings";
import type { OutputSink } from "@/cli/utilities/output-sink";
import { connectPlatform, runAtomization } from "./atomize-orchestrator";
import { validateCustomFieldsPreFlight } from "./generation-preflight";

export interface GenerateWorkflowOptions {
  dryRun: boolean;
  continueOnError: boolean;
  limit?: number;
  storyIds?: string[];
  resume?: boolean;
  storyConcurrency: number;
  dependencyConcurrency: number;
  forceNormalize: boolean;
  isTTYSession: boolean;
  profileLabel?: string;
  jsonStream?: boolean;
  timings?: RunTimings;
}

export async function runGenerateWorkflow(
  template: TaskTemplate,
  platform: PlatformAuthenticator & GenerationPlatform & ProjectMetadataReader,
  options: GenerateWorkflowOptions,
  output: OutputSink,
): Promise<AtomizationReport> {
  const { timings } = options;
  await timePhase(timings, "connect", () =>
    connectPlatform(platform, { isTTYSession: options.isTTYSession, profileLabel: options.profileLabel }, output),
  );

  await timePhase(timings, "fieldSchema", () => validateCustomFieldsPreFlight(template, platform));

  return runAtomization(template, platform, {
    dryRun: options.dryRun,
    continueOnError: options.continueOnError,
    limit: options.limit,
    storyIds: options.storyIds,
    resume: options.resume,
    storyConcurrency: options.storyConcurrency,
    dependencyConcurrency: options.dependencyConcurrency,
    forceNormalize: options.forceNormalize,
    isTTYSession: options.isTTYSession,
    jsonStream: options.jsonStream,
    timings,
  }, output);
}
