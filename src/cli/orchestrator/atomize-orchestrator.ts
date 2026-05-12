import { log, progress } from "@clack/prompts";
import { logger } from "@config/logger";
import type { AtomizationReport, ProgressEvent } from "@core/atomizer";
import { GenerationRun } from "@core/generation-run";
import type {
  GenerationPlatform,
  PlatformAuthenticator,
} from "@platforms/interfaces/platform-capabilities";
import type { TaskTemplate } from "@templates/schema";
import { match } from "ts-pattern";
import type { OutputSink, SpinnerHandle } from "@/cli/utilities/output-sink";
import { sanitizeTty } from "@/cli/utilities/prompt-utilities";

export interface ProgressHandle {
  start(msg: string): void;
  advance(step: number, msg: string): void;
  stop(msg: string): void;
}

export interface AtomizeOptions {
  dryRun: boolean;
  continueOnError: boolean;
  limit?: number;
  storyIds?: string[];
  storyConcurrency: number;
  dependencyConcurrency: number;
  forceNormalize: boolean;
  isTTYSession: boolean;
}

const noopSpinner: SpinnerHandle = { message: () => {}, stop: () => {}, fail: () => {} };

/** @internal Exported for testing */
export function createProgressHandler(
  isTTYSession: boolean,
  querySpinner: Pick<SpinnerHandle, "message" | "stop">,
  storyProgressRef: { current: ProgressHandle | undefined },
  print: (msg: string) => void,
  logSuccess: (msg: string) => void,
  logError: (msg: string) => void,
  makeProgress: (totalStories: number) => ProgressHandle,
): (event: ProgressEvent) => void {
  return (event) =>
    match(event)
      .with({ type: "query_start" }, () => {
        if (isTTYSession) querySpinner.message("Querying work items...");
      })
      .with({ type: "query_complete" }, (e) => {
        if (isTTYSession) {
          querySpinner.stop(`Found ${e.totalStories} stories`);
          storyProgressRef.current = makeProgress(e.totalStories ?? 1);
          storyProgressRef.current.start(
            `Processing stories (0/${e.totalStories})`,
          );
        } else {
          print(`Found ${e.totalStories} stories`);
        }
      })
      .with({ type: "story_start" }, (e) => {
        if (!isTTYSession)
          print(
            `Processing ${(e.storyIndex ?? 0) + 1}/${e.totalStories}: ${sanitizeTty(e.story?.id)}...`,
          );
      })
      .with({ type: "story_complete" }, (e) => {
        if (isTTYSession && storyProgressRef.current) {
          logSuccess(
            `[${e.completedStories}/${e.totalStories}] ${sanitizeTty(e.story?.id)}: ${sanitizeTty(e.story?.title)}`,
          );
          storyProgressRef.current.advance(
            1,
            `${e.completedStories}/${e.totalStories} stories`,
          );
        } else {
          print(
            `✓ [${e.completedStories}/${e.totalStories}] ${sanitizeTty(e.story?.id)}: ${sanitizeTty(e.story?.title)}`,
          );
        }
      })
      .with({ type: "story_error" }, (e) => {
        if (isTTYSession && storyProgressRef.current) {
          logError(
            `[${e.completedStories}/${e.totalStories}] ${sanitizeTty(e.story?.id)}: ${sanitizeTty(e.error)}`,
          );
          storyProgressRef.current.advance(
            1,
            `${e.completedStories}/${e.totalStories} stories`,
          );
        } else {
          print(
            `✗ [${e.completedStories}/${e.totalStories}] ${sanitizeTty(e.story?.id)}: ${sanitizeTty(e.error)}`,
          );
        }
      })
      .with({ type: "task_created" }, (e) => {
        if (isTTYSession && storyProgressRef.current) {
          storyProgressRef.current.advance(
            0,
            `${e.completedStories}/${e.totalStories} stories · ${e.tasksCreated} task${e.tasksCreated === 1 ? "" : "s"} created`,
          );
        }
      })
      .with({ type: "dependency_created" }, (e) => {
        if (isTTYSession && storyProgressRef.current) {
          storyProgressRef.current.advance(
            0,
            `${e.completedStories}/${e.totalStories} stories · ${e.dependenciesCreated} link${e.dependenciesCreated === 1 ? "" : "s"} created`,
          );
        }
      })
      .with({ type: "complete" }, (e) => {
        if (isTTYSession) storyProgressRef.current?.stop(
          `Done — ${e.tasksCreated ?? 0} task${(e.tasksCreated ?? 0) === 1 ? "" : "s"} created`,
        );
        else print(`Done — ${e.tasksCreated ?? 0} task${(e.tasksCreated ?? 0) === 1 ? "" : "s"} created`);
      })
      .exhaustive();
}

export async function runAtomization(
  template: TaskTemplate,
  platform: GenerationPlatform,
  opts: AtomizeOptions,
  output: OutputSink,
): Promise<AtomizationReport> {
  logger.info("Starting atomization...");

  const generationRun = new GenerationRun(platform);
  const storyProgressRef: { current: ProgressHandle | undefined } = { current: undefined };

  const querySpinner = opts.isTTYSession
    ? output.startSpinner("Querying work items...")
    : noopSpinner;
  if (!opts.isTTYSession) output.print("Querying work items...");

  const report = await generationRun.execute(template, {
    dryRun: opts.dryRun,
    continueOnError: opts.continueOnError,
    limit: opts.limit,
    storyIds: opts.storyIds,
    storyConcurrency: opts.storyConcurrency,
    dependencyConcurrency: opts.dependencyConcurrency,
    forceNormalize: opts.forceNormalize,
    onProgress: createProgressHandler(
      opts.isTTYSession,
      querySpinner,
      storyProgressRef,
      output.print,
      log.success,
      log.error,
      (total) => progress({ max: total, style: "block" }),
    ),
  });

  if (report.storiesProcessed > 0) {
    if (opts.isTTYSession && storyProgressRef.current) {
      storyProgressRef.current.stop("Processing complete");
    } else {
      output.print("Processing complete");
    }
  }

  return report;
}

export async function connectPlatform(
  platform: PlatformAuthenticator,
  opts: { isTTYSession: boolean; profileLabel?: string },
  output: OutputSink,
): Promise<void> {
  const authSpinner = opts.isTTYSession
    ? output.startSpinner("Authenticating...")
    : undefined;

  const AUTH_TIMEOUT_MS = 15_000;
  await Promise.race([
    platform.authenticate(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Authentication timed out after 15s. Check your network connection and credentials.")),
        AUTH_TIMEOUT_MS,
      ),
    ),
  ]);

  const metadata = platform.getPlatformMetadata();
  const profileSuffix = opts.profileLabel ? ` · profile: ${opts.profileLabel}` : "";
  const message = `Connected: ${metadata.name} v${metadata.version}${profileSuffix} ✓`;

  if (opts.isTTYSession) authSpinner?.stop(message);
  else output.print(message);
}
