import type { TaskDefinition } from "@templates/schema";
import { PatternDetector } from "./pattern-detector";
import type {
  MergedTask,
  PatternDetectionResult,
  StoryAnalysis,
} from "./story-learner.types";

/**
 * Merges similar tasks from multiple stories into a canonical task list.
 * Uses token-based Jaccard similarity to group tasks and produces
 * averaged estimations with full source tracking.
 */
export class TaskMerger {
  private detector = new PatternDetector();
  private similarityThreshold = 0.45;

  merge(
    analyses: StoryAnalysis[],
    _patterns: PatternDetectionResult,
  ): MergedTask[] {
    if (analyses.length === 0) return [];

    const allTasks: Array<{
      task: TaskDefinition;
      storyId: string;
      normalized: string;
    }> = [];

    for (const analysis of analyses) {
      for (const taskDef of analysis.template.tasks) {
        allTasks.push({
          task: taskDef,
          storyId: analysis.story.id,
          normalized: this.detector.normalizeTitle(taskDef.title),
        });
      }
    }
    const groups = this.detector.clusterItems(
      allTasks,
      (entry) => entry.normalized,
      this.similarityThreshold,
    );
    const mergedTasks: MergedTask[] = groups.map((group, index) => {
      const canonicalTitle = this.pickCanonicalTitle(
        group.map((g) => g.task.title),
      );
      const avgEstimation = this.averageEstimation(
        group.map((g) => g.task.estimationPercent ?? 0),
      );
      const tags = this.mergeTags(group.map((g) => g.task.tags ?? []));
      const activity = this.mostCommonActivity(
        group.map((g) => g.task.activity ?? "Development"),
      );

      const sources = group.map((g) => ({
        storyId: g.storyId,
        taskTitle: g.task.title,
      }));

      const similarity = this.groupSimilarity(group.map((g) => g.normalized));

      const task: TaskDefinition = {
        id: this.generateId(canonicalTitle, index),
        title: canonicalTitle,
        estimationPercent: Math.round(avgEstimation),
        activity,
        tags: tags.length > 0 ? tags : undefined,
        priority: this.averagePriority(
          group
            .map((g) => g.task.priority)
            .filter((p): p is number => p != null),
        ),
      };

      return { task, sources, similarity };
    });

    return this.deduplicateAndOrder(mergedTasks);
  }

  private pickCanonicalTitle(titles: string[]): string {
    const counts = new Map<string, number>();
    for (const title of titles) {
      counts.set(title, (counts.get(title) ?? 0) + 1);
    }

    let best = titles[0] ?? "";
    let bestCount = 0;
    for (const [title, count] of counts) {
      if (
        count > bestCount ||
        (count === bestCount && title.length > best.length)
      ) {
        best = title;
        bestCount = count;
      }
    }
    return best;
  }

  private averageEstimation(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private averagePriority(values: number[]): number | undefined {
    if (values.length === 0) return undefined;
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  }

  private mergeTags(tagArrays: string[][]): string[] {
    const all = new Set<string>();
    for (const tags of tagArrays) {
      for (const tag of tags) {
        all.add(tag);
      }
    }
    return [...all];
  }

  private mostCommonActivity(activities: string[]): string {
    const counts = new Map<string, number>();
    for (const a of activities) {
      counts.set(a, (counts.get(a) ?? 0) + 1);
    }
    let best = "Development";
    let bestCount = 0;
    for (const [activity, count] of counts) {
      if (count > bestCount) {
        best = activity;
        bestCount = count;
      }
    }
    return best;
  }

  private groupSimilarity(normalizedTitles: string[]): number {
    if (normalizedTitles.length <= 1) return 1;

    let totalSimilarity = 0;
    let comparisons = 0;

    for (let i = 0; i < normalizedTitles.length; i++) {
      for (let j = i + 1; j < normalizedTitles.length; j++) {
        const titleI = normalizedTitles[i];
        const titleJ = normalizedTitles[j];
        if (titleI && titleJ) {
          totalSimilarity += this.detector.calculateSimilarity(titleI, titleJ);
          comparisons++;
        }
      }
    }

    return comparisons > 0
      ? Math.round((totalSimilarity / comparisons) * 100) / 100
      : 1;
  }

  private generateId(title: string, index: number): string {
    const slug = title
      .toLowerCase()
      .replace(/\$\{story\.(title|id|description)\}/g, "")
      .replace(/^(task|implement|create|build|design|test|fix)\s*:?\s*/i, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .trim();

    if (slug.length === 0) return `task-${index + 1}`;
    return slug.length > 30 ? slug.substring(0, 30) : slug;
  }

  private deduplicateAndOrder(mergedTasks: MergedTask[]): MergedTask[] {
    return mergedTasks.sort((a, b) => {
      if (b.sources.length !== a.sources.length) {
        return b.sources.length - a.sources.length;
      }
      return (b.task.estimationPercent ?? 0) - (a.task.estimationPercent ?? 0);
    });
  }
}
