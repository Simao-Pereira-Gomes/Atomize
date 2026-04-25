import type { PatternDetectionResult } from "./story-learner.types";

const TOKEN_BUDGET = 800;
const MAX_TASKS = 8;
const MIN_CONDITION_FREQUENCY_RATIO = 0.2;

export function summarizePatterns(patterns: PatternDetectionResult): string {
  const lines: string[] = [];

  const topTasks = [...patterns.commonTasks]
    .sort((a, b) => b.frequencyRatio - a.frequencyRatio)
    .slice(0, MAX_TASKS);

  if (topTasks.length > 0) {
    const taskList = topTasks
      .map((t) => `"${t.canonicalTitle}" (${Math.round(t.averageEstimationPercent)}%${t.activity ? `, ${t.activity}` : ""})`)
      .join(", ");
    lines.push(`Common tasks: ${taskList}`);
  }

  const deps = topTasks
    .filter((t) => t.dependsOn && t.dependsOn.length > 0)
    .map((t) => `${t.dependsOn?.join(", ")} → ${t.canonicalTitle}`)
    .join("; ");
  if (deps) lines.push(`Dependency ordering: ${deps}`);

  const conditions = patterns.conditionalPatterns
    .filter((c) => c.confidence >= MIN_CONDITION_FREQUENCY_RATIO)
    .slice(0, 5);
  for (const c of conditions) {
    lines.push(`Conditional: ${c.explanation}`);
  }

  const { learnedFilters } = patterns;
  if (learnedFilters.priorityRange) {
    lines.push(
      `Priority range observed: ${learnedFilters.priorityRange.min}–${learnedFilters.priorityRange.max} (most common: ${learnedFilters.priorityRange.mostCommon})`,
    );
  }
  if (learnedFilters.commonStoryTags && learnedFilters.commonStoryTags.length > 0) {
    const tags = learnedFilters.commonStoryTags
      .filter((t) => t.frequencyRatio >= 0.5)
      .slice(0, 5)
      .map((t) => t.tag);
    if (tags.length > 0) lines.push(`Common story tags: ${tags.join(", ")}`);
  }

  const summary = lines.join("\n");
  if (estimateTokens(summary) > TOKEN_BUDGET) {
    return lines.slice(0, Math.max(1, Math.floor(lines.length * (TOKEN_BUDGET / estimateTokens(summary))))).join("\n");
  }

  return summary;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
