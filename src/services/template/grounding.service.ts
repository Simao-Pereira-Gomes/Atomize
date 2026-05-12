import { hasStoryLearningPlatform } from "@platforms/capabilities";
import type { IPlatformAdapter } from "@platforms/interfaces/platform.interface";
import { summarizePatterns } from "./pattern-summarizer";
import { StoryLearner } from "./story-learner";

const AUTO_FETCH_TARGET = 10;
const AUTO_FETCH_CANDIDATE_LIMIT = 30;

export type GroundingOptions =
  | { mode: "auto"; limit?: number }
  | { mode: "explicit"; storyIds: string[] };

export class GroundingService {
  constructor(private platform: IPlatformAdapter) {}

  async fetchAndSummarize(options: GroundingOptions): Promise<string | null> {
    if (!hasStoryLearningPlatform(this.platform)) return null;

    const storyIds =
      options.mode === "explicit"
        ? await this.resolveExplicitIds(options.storyIds)
        : await this.autoFetchIds(options.limit ?? AUTO_FETCH_TARGET);

    if (storyIds.length === 0) return null;

    try {
      const learner = new StoryLearner(this.platform);
      const result = await learner.learnFromStories(storyIds);
      if (result.analyses.length === 0) return null;
      return summarizePatterns(result.patterns);
    } catch {
      return null;
    }
  }

  private async resolveExplicitIds(storyIds: string[]): Promise<string[]> {
    if (!this.platform.getWorkItem) return storyIds;

    const checks = await Promise.allSettled(
      storyIds.map(async (id) => ({
        id,
        exists: !!(await this.platform.getWorkItem?.(id)),
        hasChildren: (await this.platform.getChildren?.(id))?.length ?? 0,
      })),
    );

    return checks
      .filter((r): r is PromiseFulfilledResult<{ id: string; exists: boolean; hasChildren: number }> => r.status === "fulfilled")
      .filter((r) => r.value.exists && r.value.hasChildren > 0)
      .map((r) => r.value.id);
  }

  private async autoFetchIds(target: number): Promise<string[]> {
    let candidates: { id: string }[] = [];

    try {
      const items = await this.platform.queryWorkItems({
        excludeIfHasTasks: false,
      });
      candidates = items.slice(0, AUTO_FETCH_CANDIDATE_LIMIT).map((i) => ({
        id: String(i.id),
      }));
    } catch {
      return [];
    }

    if (!this.platform.getChildren) return [];

    const usable: string[] = [];
    for (const candidate of candidates) {
      if (usable.length >= target) break;
      try {
        const children = await this.platform.getChildren(candidate.id);
        if (children.length > 0) usable.push(candidate.id);
      } catch {
        // skip unreachable items
      }
    }

    return usable;
  }
}
