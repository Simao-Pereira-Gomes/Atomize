import { describe, expect, test } from "bun:test";
import type { WorkItem } from "@platforms/interfaces/work-item.interface";
import { TagPatternDetector } from "@services/template/pattern-detection";
import type {
  CommonTaskPattern,
  EnhancedTagInfo,
  StoryAnalysis,
} from "@services/template/story-learner.types";
import type { TaskTemplate } from "@templates/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStory(id: string, estimation = 20): WorkItem {
  return {
    id,
    title: `Story ${id}`,
    type: "User Story",
    state: "Active",
    estimation,
  };
}

function makeTemplate(
  storyId: string,
  tasks: Array<{
    title: string;
    estimationPercent: number;
    activity?: string;
    tags?: string[];
  }>,
): TaskTemplate {
  return {
    version: "1.0",
    name: `Template from ${storyId}`,
    description: "",
    filter: { workItemTypes: ["User Story"] },
    tasks: tasks.map((t, i) => ({
      id: `task-${i + 1}`,
      title: t.title,
      estimationPercent: t.estimationPercent,
      activity: t.activity ?? "Development",
      tags: t.tags,
    })),
    estimation: { strategy: "percentage", rounding: "none" },
  };
}

function makeAnalysis(
  storyId: string,
  tasks: Array<{
    title: string;
    estimationPercent: number;
    activity?: string;
    tags?: string[];
  }>,
  storyEstimation = 20,
): StoryAnalysis {
  const story = makeStory(storyId, storyEstimation);
  return {
    story,
    tasks: tasks.map((t, i) => ({
      id: `${storyId}-task-${i}`,
      title: t.title,
      type: "Task" as const,
      state: "Active",
      estimation: (t.estimationPercent / 100) * storyEstimation,
      tags: t.tags,
    })),
    template: makeTemplate(storyId, tasks),
    warnings: [],
  };
}

function makeCommonTask(
  overrides: Partial<CommonTaskPattern> & { canonicalTitle: string },
): CommonTaskPattern {
  return {
    canonicalTitle: overrides.canonicalTitle,
    titleVariants: overrides.titleVariants ?? [overrides.canonicalTitle],
    frequency: overrides.frequency ?? 1,
    frequencyRatio: overrides.frequencyRatio ?? 1,
    averageEstimationPercent: overrides.averageEstimationPercent ?? 25,
    estimationStdDev: overrides.estimationStdDev ?? 0,
    activity: overrides.activity ?? "Development",
    tagInfo: overrides.tagInfo,
  };
}

function makeTagInfo(
  core: string[] = [],
  optional: string[] = [],
  rare: string[] = [],
  patterns?: EnhancedTagInfo["tagPatterns"],
): EnhancedTagInfo {
  const tagPatterns =
    patterns ??
    [
      ...core.map((tag) => ({
        tag,
        frequency: 10,
        frequencyRatio: 0.9,
        classification: "core" as const,
      })),
      ...optional.map((tag) => ({
        tag,
        frequency: 5,
        frequencyRatio: 0.5,
        classification: "optional" as const,
      })),
      ...rare.map((tag) => ({
        tag,
        frequency: 1,
        frequencyRatio: 0.1,
        classification: "rare" as const,
      })),
    ];

  return { coreTags: core, optionalTags: optional, rareTags: rare, tagPatterns };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TagPatternDetector", () => {
  const detector = new TagPatternDetector();

  // -----------------------------------------------------------------------
  // detectTaskTagPatterns
  // -----------------------------------------------------------------------
  describe("detectTaskTagPatterns", () => {
    test("should return empty map for empty inputs", () => {
      const result = detector.detectTaskTagPatterns([], []);
      expect(result.size).toBe(0);
    });

    test("should return empty map when commonTasks is empty", () => {
      const analyses = [
        makeAnalysis("S1", [
          { title: "Design", estimationPercent: 50, tags: ["frontend"] },
          { title: "Code", estimationPercent: 50, tags: ["backend"] },
        ]),
      ];
      const result = detector.detectTaskTagPatterns(analyses, []);
      expect(result.size).toBe(0);
    });

    test("should return entries with empty tag lists when tasks have no tags", () => {
      const analyses = [
        makeAnalysis("S1", [
          { title: "Design", estimationPercent: 50 },
          { title: "Code", estimationPercent: 50 },
        ]),
      ];
      const commonTasks = [makeCommonTask({ canonicalTitle: "Design" })];
      const result = detector.detectTaskTagPatterns(analyses, commonTasks);

      expect(result.size).toBe(1);
      const tagInfo = result.get("Design");
      expect(tagInfo).toBeDefined();
      expect(tagInfo?.coreTags).toHaveLength(0);
      expect(tagInfo?.optionalTags).toHaveLength(0);
      expect(tagInfo?.rareTags).toHaveLength(0);
    });

    test("should classify tags as core when appearing in >= 80% of instances", () => {
      // "frontend" appears in 5/5 instances => 100% => core
      const analyses = Array.from({ length: 5 }, (_, i) =>
        makeAnalysis(`S${i}`, [
          { title: "Design", estimationPercent: 100, tags: ["frontend"] },
        ]),
      );
      const commonTasks = [makeCommonTask({ canonicalTitle: "Design" })];
      const result = detector.detectTaskTagPatterns(analyses, commonTasks);

      const tagInfo = result.get("Design");
      expect(tagInfo?.coreTags).toContain("frontend");
      expect(tagInfo?.optionalTags).not.toContain("frontend");
      expect(tagInfo?.rareTags).not.toContain("frontend");
    });

    test("should classify tags as optional when appearing in 20-80% of instances", () => {
      // "logging" appears in 3/5 instances => 60% => optional
      const analyses = Array.from({ length: 5 }, (_, i) =>
        makeAnalysis(`S${i}`, [
          {
            title: "Code",
            estimationPercent: 100,
            tags: i < 3 ? ["logging"] : undefined,
          },
        ]),
      );
      const commonTasks = [makeCommonTask({ canonicalTitle: "Code" })];
      const result = detector.detectTaskTagPatterns(analyses, commonTasks);

      const tagInfo = result.get("Code");
      expect(tagInfo?.optionalTags).toContain("logging");
      expect(tagInfo?.coreTags).not.toContain("logging");
      expect(tagInfo?.rareTags).not.toContain("logging");
    });

    test("should classify tags as rare when appearing in < 20% of instances", () => {
      // "experimental" appears in 1/10 instances => 10% => rare
      const analyses = Array.from({ length: 10 }, (_, i) =>
        makeAnalysis(`S${i}`, [
          {
            title: "Code",
            estimationPercent: 100,
            tags: i === 0 ? ["experimental"] : undefined,
          },
        ]),
      );
      const commonTasks = [makeCommonTask({ canonicalTitle: "Code" })];
      const result = detector.detectTaskTagPatterns(analyses, commonTasks);

      const tagInfo = result.get("Code");
      expect(tagInfo?.rareTags).toContain("experimental");
      expect(tagInfo?.coreTags).not.toContain("experimental");
      expect(tagInfo?.optionalTags).not.toContain("experimental");
    });

    test("should handle multiple tags with mixed classifications", () => {
      // 10 analyses:
      // "backend" on all 10 => core (100%)
      // "cache" on 5 => optional (50%)
      // "experimental" on 1 => rare (10%)
      const analyses = Array.from({ length: 10 }, (_, i) => {
        const tags = ["backend"];
        if (i < 5) tags.push("cache");
        if (i === 0) tags.push("experimental");
        return makeAnalysis(`S${i}`, [
          { title: "Implement", estimationPercent: 100, tags },
        ]);
      });
      const commonTasks = [makeCommonTask({ canonicalTitle: "Implement" })];
      const result = detector.detectTaskTagPatterns(analyses, commonTasks);

      const tagInfo = result.get("Implement");
      expect(tagInfo?.coreTags).toContain("backend");
      expect(tagInfo?.optionalTags).toContain("cache");
      expect(tagInfo?.rareTags).toContain("experimental");
    });

    test("should produce tag patterns sorted by frequencyRatio descending", () => {
      const analyses = Array.from({ length: 10 }, (_, i) => {
        const tags: string[] = [];
        if (i < 10) tags.push("always"); // 100%
        if (i < 5) tags.push("half"); // 50%
        if (i < 1) tags.push("once"); // 10%
        return makeAnalysis(`S${i}`, [
          { title: "Task", estimationPercent: 100, tags },
        ]);
      });
      const commonTasks = [makeCommonTask({ canonicalTitle: "Task" })];
      const result = detector.detectTaskTagPatterns(analyses, commonTasks);

      const patterns = result.get("Task")?.tagPatterns;
      for (let i = 1; i < (patterns?.length ?? 0); i++) {
        expect(patterns?.[i]?.frequencyRatio).toBeLessThanOrEqual(
          patterns?.[i - 1]?.frequencyRatio ?? 0,
        );
      }
    });

    test("should match tasks by titleVariants", () => {
      const analyses = [
        makeAnalysis("S1", [
          { title: "Write Tests", estimationPercent: 100, tags: ["testing"] },
        ]),
        makeAnalysis("S2", [
          {
            title: "Write Unit Tests",
            estimationPercent: 100,
            tags: ["testing"],
          },
        ]),
      ];
      const commonTasks = [
        makeCommonTask({
          canonicalTitle: "Write Tests",
          titleVariants: ["Write Tests", "Write Unit Tests"],
        }),
      ];
      const result = detector.detectTaskTagPatterns(analyses, commonTasks);

      const tagInfo = result.get("Write Tests");
      expect(tagInfo?.coreTags).toContain("testing");
      // Frequency 2/2 => core
      const testingPattern = tagInfo?.tagPatterns.find(
        (p) => p.tag === "testing",
      );
      expect(testingPattern).toBeDefined();
      expect(testingPattern?.frequencyRatio).toBe(1);
    });

    test("should match tasks by similarity fallback", () => {
      // "API schema setup" normalizes to "api schema setup", similar to "api schema"
      const analyses = [
        makeAnalysis("S1", [
          {
            title: "API schema setup",
            estimationPercent: 100,
            tags: ["api"],
          },
        ]),
      ];
      const commonTasks = [
        makeCommonTask({
          canonicalTitle: "API schema",
          titleVariants: ["API schema"],
        }),
      ];
      const result = detector.detectTaskTagPatterns(analyses, commonTasks);

      const tagInfo = result.get("API schema");
      expect(tagInfo).toBeDefined();
      expect(tagInfo?.coreTags).toContain("api");
    });

    test("should handle map with multiple common tasks", () => {
      // Use distinct titles that don't normalize to empty strings
      // (normalizeTitle strips prefixes like "design", "test", etc.)
      const analyses = [
        makeAnalysis("S1", [
          { title: "UI wireframes", estimationPercent: 30, tags: ["ux"] },
          { title: "Backend service", estimationPercent: 40, tags: ["backend"] },
          { title: "QA validation", estimationPercent: 30, tags: ["qa"] },
        ]),
      ];
      const commonTasks = [
        makeCommonTask({ canonicalTitle: "UI wireframes" }),
        makeCommonTask({ canonicalTitle: "Backend service" }),
        makeCommonTask({ canonicalTitle: "QA validation" }),
      ];
      const result = detector.detectTaskTagPatterns(analyses, commonTasks);

      expect(result.size).toBe(3);
      expect(result.get("UI wireframes")?.coreTags).toContain("ux");
      expect(result.get("Backend service")?.coreTags).toContain("backend");
      expect(result.get("QA validation")?.coreTags).toContain("qa");
    });
  });

  // -----------------------------------------------------------------------
  // calculateTagDistribution
  // -----------------------------------------------------------------------
  describe("calculateTagDistribution", () => {
    test("should return empty object for empty analyses", () => {
      const result = detector.calculateTagDistribution([]);
      expect(result).toEqual({});
    });

    test("should return empty object when tasks have no tags", () => {
      const analyses = [
        makeAnalysis("S1", [
          { title: "Design", estimationPercent: 50 },
          { title: "Code", estimationPercent: 50 },
        ]),
      ];
      const result = detector.calculateTagDistribution(analyses);
      expect(result).toEqual({});
    });

    test("should calculate correct percentage for a single tag across all tasks", () => {
      // 2 tasks, both have "backend" => 100%
      const analyses = [
        makeAnalysis("S1", [
          { title: "Design", estimationPercent: 50, tags: ["backend"] },
          { title: "Code", estimationPercent: 50, tags: ["backend"] },
        ]),
      ];
      const result = detector.calculateTagDistribution(analyses);
      expect(result.backend).toBe(100);
    });

    test("should calculate correct percentage when tag appears on some tasks", () => {
      // 4 tasks total, "frontend" on 2 => 50%
      const analyses = [
        makeAnalysis("S1", [
          { title: "Design", estimationPercent: 50, tags: ["frontend"] },
          { title: "Code", estimationPercent: 50 },
        ]),
        makeAnalysis("S2", [
          { title: "Design", estimationPercent: 50, tags: ["frontend"] },
          { title: "Code", estimationPercent: 50 },
        ]),
      ];
      const result = detector.calculateTagDistribution(analyses);
      expect(result.frontend).toBe(50);
    });

    test("should handle multiple different tags", () => {
      // 4 tasks: "api" on 3, "security" on 1
      const analyses = [
        makeAnalysis("S1", [
          { title: "A", estimationPercent: 50, tags: ["api"] },
          { title: "B", estimationPercent: 50, tags: ["api", "security"] },
        ]),
        makeAnalysis("S2", [
          { title: "C", estimationPercent: 50, tags: ["api"] },
          { title: "D", estimationPercent: 50 },
        ]),
      ];
      const result = detector.calculateTagDistribution(analyses);
      expect(result.api).toBe(75); // 3/4
      expect(result.security).toBe(25); // 1/4
    });

    test("should round percentage values to two decimal places", () => {
      // 3 tasks, "tag" on 1 => 33.33%
      const analyses = [
        makeAnalysis("S1", [
          { title: "A", estimationPercent: 34, tags: ["tag"] },
          { title: "B", estimationPercent: 33 },
          { title: "C", estimationPercent: 33 },
        ]),
      ];
      const result = detector.calculateTagDistribution(analyses);
      expect(result.tag).toBe(33.33);
    });

    test("should span across multiple analyses", () => {
      // 6 tasks across 3 analyses, "shared" on all 6 => 100%
      const analyses = [
        makeAnalysis("S1", [
          { title: "A", estimationPercent: 50, tags: ["shared"] },
          { title: "B", estimationPercent: 50, tags: ["shared"] },
        ]),
        makeAnalysis("S2", [
          { title: "C", estimationPercent: 50, tags: ["shared"] },
          { title: "D", estimationPercent: 50, tags: ["shared"] },
        ]),
        makeAnalysis("S3", [
          { title: "E", estimationPercent: 50, tags: ["shared"] },
          { title: "F", estimationPercent: 50, tags: ["shared"] },
        ]),
      ];
      const result = detector.calculateTagDistribution(analyses);
      expect(result.shared).toBe(100);
    });
  });

  // -----------------------------------------------------------------------
  // augmentCommonTasks
  // -----------------------------------------------------------------------
  describe("augmentCommonTasks", () => {
    test("should return tasks unchanged when map is empty", () => {
      const commonTasks = [makeCommonTask({ canonicalTitle: "Design" })];
      const result = detector.augmentCommonTasks(commonTasks, new Map());

      expect(result).toHaveLength(1);
      expect(result[0]?.tagInfo).toBeUndefined();
    });

    test("should augment tasks with tagInfo from map", () => {
      const commonTasks = [
        makeCommonTask({ canonicalTitle: "Design" }),
        makeCommonTask({ canonicalTitle: "Code" }),
      ];
      const tagMap = new Map<string, EnhancedTagInfo>();
      const designTagInfo = makeTagInfo(["frontend"], ["ux"], []);
      const codeTagInfo = makeTagInfo(["backend"], [], ["debug"]);
      tagMap.set("Design", designTagInfo);
      tagMap.set("Code", codeTagInfo);

      const result = detector.augmentCommonTasks(commonTasks, tagMap);

      expect(result).toHaveLength(2);
      expect(result[0]?.tagInfo).toEqual(designTagInfo);
      expect(result[1]?.tagInfo).toEqual(codeTagInfo);
    });

    test("should leave tagInfo undefined for tasks not in map", () => {
      const commonTasks = [
        makeCommonTask({ canonicalTitle: "Design" }),
        makeCommonTask({ canonicalTitle: "Test" }),
      ];
      const tagMap = new Map<string, EnhancedTagInfo>();
      tagMap.set("Design", makeTagInfo(["frontend"]));

      const result = detector.augmentCommonTasks(commonTasks, tagMap);

      expect(result[0]?.tagInfo).toBeDefined();
      expect(result[1]?.tagInfo).toBeUndefined();
    });

    test("should not mutate original common tasks", () => {
      const commonTasks = [makeCommonTask({ canonicalTitle: "Design" })];
      const tagMap = new Map<string, EnhancedTagInfo>();
      tagMap.set("Design", makeTagInfo(["frontend"]));

      detector.augmentCommonTasks(commonTasks, tagMap);

      // Original should be unmodified
      expect(commonTasks[0]?.tagInfo).toBeUndefined();
    });

    test("should handle empty common tasks array", () => {
      const tagMap = new Map<string, EnhancedTagInfo>();
      tagMap.set("Design", makeTagInfo(["frontend"]));

      const result = detector.augmentCommonTasks([], tagMap);
      expect(result).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // getSuggestedTags
  // -----------------------------------------------------------------------
  describe("getSuggestedTags", () => {
    test("should return only core tags when includeOptional is false", () => {
      const tagInfo = makeTagInfo(["frontend", "api"], ["logging"], ["debug"]);
      const result = detector.getSuggestedTags(tagInfo, false);

      expect(result).toContain("frontend");
      expect(result).toContain("api");
      expect(result).not.toContain("logging");
      expect(result).not.toContain("debug");
    });

    test("should include core tags and optional tags with frequency >= 40% when includeOptional is true", () => {
      const tagInfo = makeTagInfo(
        ["core-tag"],
        ["high-optional", "low-optional"],
        [],
        [
          {
            tag: "core-tag",
            frequency: 10,
            frequencyRatio: 0.9,
            classification: "core",
          },
          {
            tag: "high-optional",
            frequency: 5,
            frequencyRatio: 0.5,
            classification: "optional",
          },
          {
            tag: "low-optional",
            frequency: 3,
            frequencyRatio: 0.25,
            classification: "optional",
          },
        ],
      );

      const result = detector.getSuggestedTags(tagInfo, true);

      expect(result).toContain("core-tag");
      expect(result).toContain("high-optional");
      expect(result).not.toContain("low-optional");
    });

    test("should include optional tags exactly at the 40% boundary", () => {
      const tagInfo = makeTagInfo(
        [],
        ["boundary-tag"],
        [],
        [
          {
            tag: "boundary-tag",
            frequency: 4,
            frequencyRatio: 0.4,
            classification: "optional",
          },
        ],
      );

      const result = detector.getSuggestedTags(tagInfo, true);
      expect(result).toContain("boundary-tag");
    });

    test("should exclude optional tags just below the 40% boundary", () => {
      const tagInfo = makeTagInfo(
        [],
        ["below-boundary"],
        [],
        [
          {
            tag: "below-boundary",
            frequency: 3,
            frequencyRatio: 0.39,
            classification: "optional",
          },
        ],
      );

      const result = detector.getSuggestedTags(tagInfo, true);
      expect(result).not.toContain("below-boundary");
    });

    test("should never include rare tags", () => {
      const tagInfo = makeTagInfo(
        [],
        [],
        ["rare-tag"],
        [
          {
            tag: "rare-tag",
            frequency: 1,
            frequencyRatio: 0.1,
            classification: "rare",
          },
        ],
      );

      const resultWithOptional = detector.getSuggestedTags(tagInfo, true);
      const resultWithoutOptional = detector.getSuggestedTags(tagInfo, false);
      expect(resultWithOptional).not.toContain("rare-tag");
      expect(resultWithoutOptional).not.toContain("rare-tag");
    });

    test("should deduplicate tags in result", () => {
      // Core tags list contains "api" and a pattern also lists "api" as optional with high ratio
      const tagInfo: EnhancedTagInfo = {
        coreTags: ["api"],
        optionalTags: ["api"],
        rareTags: [],
        tagPatterns: [
          {
            tag: "api",
            frequency: 10,
            frequencyRatio: 0.9,
            classification: "core",
          },
          {
            tag: "api",
            frequency: 5,
            frequencyRatio: 0.5,
            classification: "optional",
          },
        ],
      };

      const result = detector.getSuggestedTags(tagInfo, true);
      const apiCount = result.filter((t) => t === "api").length;
      expect(apiCount).toBe(1);
    });

    test("should default includeOptional to true", () => {
      const tagInfo = makeTagInfo(
        ["core-tag"],
        ["opt-tag"],
        [],
        [
          {
            tag: "core-tag",
            frequency: 10,
            frequencyRatio: 0.9,
            classification: "core",
          },
          {
            tag: "opt-tag",
            frequency: 5,
            frequencyRatio: 0.5,
            classification: "optional",
          },
        ],
      );

      const result = detector.getSuggestedTags(tagInfo);
      expect(result).toContain("core-tag");
      expect(result).toContain("opt-tag");
    });

    test("should return empty array when there are no core or qualifying optional tags", () => {
      const tagInfo = makeTagInfo(
        [],
        [],
        ["only-rare"],
        [
          {
            tag: "only-rare",
            frequency: 1,
            frequencyRatio: 0.05,
            classification: "rare",
          },
        ],
      );
      const result = detector.getSuggestedTags(tagInfo, true);
      expect(result).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // mergeTagsWithFrequency
  // -----------------------------------------------------------------------
  describe("mergeTagsWithFrequency", () => {
    test("should return only core tags when coreOnly is true", () => {
      const tagInfo = makeTagInfo(["backend", "api"], ["logging"], ["debug"]);
      const result = detector.mergeTagsWithFrequency(tagInfo, true);

      expect(result).toEqual(["backend", "api"]);
    });

    test("should return core + optional tags when coreOnly is false", () => {
      const tagInfo = makeTagInfo(["backend"], ["logging", "cache"], ["debug"]);
      const result = detector.mergeTagsWithFrequency(tagInfo, false);

      expect(result).toEqual(["backend", "logging", "cache"]);
    });

    test("should default coreOnly to false", () => {
      const tagInfo = makeTagInfo(["core"], ["opt"], []);
      const result = detector.mergeTagsWithFrequency(tagInfo);

      expect(result).toContain("core");
      expect(result).toContain("opt");
    });

    test("should never include rare tags", () => {
      const tagInfo = makeTagInfo([], [], ["rare"]);

      const coreOnlyResult = detector.mergeTagsWithFrequency(tagInfo, true);
      const withOptionalResult = detector.mergeTagsWithFrequency(tagInfo, false);

      expect(coreOnlyResult).not.toContain("rare");
      expect(withOptionalResult).not.toContain("rare");
    });

    test("should return empty array when no core or optional tags exist", () => {
      const tagInfo = makeTagInfo([], [], ["rare1", "rare2"]);
      expect(detector.mergeTagsWithFrequency(tagInfo, true)).toHaveLength(0);
      expect(detector.mergeTagsWithFrequency(tagInfo, false)).toHaveLength(0);
    });

    test("should return a new array (not a reference to internal arrays)", () => {
      const tagInfo = makeTagInfo(["core"], ["opt"], []);
      const result = detector.mergeTagsWithFrequency(tagInfo, false);
      result.push("mutated");

      expect(tagInfo.coreTags).not.toContain("mutated");
      expect(tagInfo.optionalTags).not.toContain("mutated");
    });
  });

  // -----------------------------------------------------------------------
  // detectTagBasedGroups
  // -----------------------------------------------------------------------
  describe("detectTagBasedGroups", () => {
    test("should return empty map for empty input", () => {
      const result = detector.detectTagBasedGroups([]);
      expect(result.size).toBe(0);
    });

    test("should return empty map when no tasks have tagInfo", () => {
      const tasks = [
        makeCommonTask({ canonicalTitle: "Design" }),
        makeCommonTask({ canonicalTitle: "Code" }),
      ];
      const result = detector.detectTagBasedGroups(tasks);
      expect(result.size).toBe(0);
    });

    test("should group tasks by their core tags", () => {
      const tasks = [
        makeCommonTask({
          canonicalTitle: "Design UI",
          tagInfo: makeTagInfo(["frontend"], [], []),
        }),
        makeCommonTask({
          canonicalTitle: "Build Components",
          tagInfo: makeTagInfo(["frontend"], [], []),
        }),
        makeCommonTask({
          canonicalTitle: "Write API",
          tagInfo: makeTagInfo(["backend"], [], []),
        }),
      ];

      const result = detector.detectTagBasedGroups(tasks);

      expect(result.size).toBe(2);
      expect(result.get("frontend")).toHaveLength(2);
      expect(result.get("backend")).toHaveLength(1);
    });

    test("should allow a task to appear in multiple groups when it has multiple core tags", () => {
      const tasks = [
        makeCommonTask({
          canonicalTitle: "Full Stack Integration",
          tagInfo: makeTagInfo(["frontend", "backend"], [], []),
        }),
      ];

      const result = detector.detectTagBasedGroups(tasks);

      expect(result.size).toBe(2);
      expect(result.get("frontend")).toHaveLength(1);
      expect(result.get("backend")).toHaveLength(1);
      expect(result.get("frontend")?.[0]?.canonicalTitle).toBe(
        "Full Stack Integration",
      );
      expect(result.get("backend")?.[0]?.canonicalTitle).toBe(
        "Full Stack Integration",
      );
    });

    test("should only group by core tags, not optional or rare", () => {
      const tasks = [
        makeCommonTask({
          canonicalTitle: "Task A",
          tagInfo: makeTagInfo(["core-tag"], ["optional-tag"], ["rare-tag"]),
        }),
      ];

      const result = detector.detectTagBasedGroups(tasks);

      expect(result.has("core-tag")).toBe(true);
      expect(result.has("optional-tag")).toBe(false);
      expect(result.has("rare-tag")).toBe(false);
    });

    test("should skip tasks without tagInfo", () => {
      const tasks = [
        makeCommonTask({
          canonicalTitle: "With Tags",
          tagInfo: makeTagInfo(["shared"], [], []),
        }),
        makeCommonTask({ canonicalTitle: "Without Tags" }),
      ];

      const result = detector.detectTagBasedGroups(tasks);

      expect(result.size).toBe(1);
      expect(result.get("shared")).toHaveLength(1);
      expect(result.get("shared")?.[0]?.canonicalTitle).toBe("With Tags");
    });
  });

  // -----------------------------------------------------------------------
  // Tag frequency boundary classification
  // -----------------------------------------------------------------------
  describe("tag frequency boundary classification", () => {
    test("exactly 80% frequency should be classified as core", () => {
      // 4 out of 5 => exactly 80%
      const analyses = Array.from({ length: 5 }, (_, i) =>
        makeAnalysis(`S${i}`, [
          {
            title: "Task",
            estimationPercent: 100,
            tags: i < 4 ? ["borderline"] : undefined,
          },
        ]),
      );
      const commonTasks = [makeCommonTask({ canonicalTitle: "Task" })];
      const result = detector.detectTaskTagPatterns(analyses, commonTasks);

      const tagInfo = result.get("Task");
      expect(tagInfo?.coreTags).toContain("borderline");
    });

    test("just below 80% frequency should be classified as optional", () => {
      // 3 out of 5 => 60% => optional
      const analyses = Array.from({ length: 5 }, (_, i) =>
        makeAnalysis(`S${i}`, [
          {
            title: "Task",
            estimationPercent: 100,
            tags: i < 3 ? ["almost-core"] : undefined,
          },
        ]),
      );
      const commonTasks = [makeCommonTask({ canonicalTitle: "Task" })];
      const result = detector.detectTaskTagPatterns(analyses, commonTasks);

      const tagInfo = result.get("Task");
      expect(tagInfo?.optionalTags).toContain("almost-core");
      expect(tagInfo?.coreTags).not.toContain("almost-core");
    });

    test("exactly 20% frequency should be classified as optional", () => {
      // 2 out of 10 => exactly 20%
      const analyses = Array.from({ length: 10 }, (_, i) =>
        makeAnalysis(`S${i}`, [
          {
            title: "Task",
            estimationPercent: 100,
            tags: i < 2 ? ["edge"] : undefined,
          },
        ]),
      );
      const commonTasks = [makeCommonTask({ canonicalTitle: "Task" })];
      const result = detector.detectTaskTagPatterns(analyses, commonTasks);

      const tagInfo = result.get("Task");
      expect(tagInfo?.optionalTags).toContain("edge");
      expect(tagInfo?.rareTags).not.toContain("edge");
    });

    test("just below 20% frequency should be classified as rare", () => {
      // 1 out of 10 => 10% => rare
      const analyses = Array.from({ length: 10 }, (_, i) =>
        makeAnalysis(`S${i}`, [
          {
            title: "Task",
            estimationPercent: 100,
            tags: i < 1 ? ["almost-optional"] : undefined,
          },
        ]),
      );
      const commonTasks = [makeCommonTask({ canonicalTitle: "Task" })];
      const result = detector.detectTaskTagPatterns(analyses, commonTasks);

      const tagInfo = result.get("Task");
      expect(tagInfo?.rareTags).toContain("almost-optional");
      expect(tagInfo?.optionalTags).not.toContain("almost-optional");
    });
  });

  // -----------------------------------------------------------------------
  // Task matching via similarity
  // -----------------------------------------------------------------------
  describe("task matching via similarity", () => {
    test("should match similar task titles even when not in titleVariants", () => {
      // "Design user interface" should match "Design UI" via similarity
      const analyses = [
        makeAnalysis("S1", [
          {
            title: "Design user interface layout",
            estimationPercent: 100,
            tags: ["ui"],
          },
        ]),
      ];
      const commonTasks = [
        makeCommonTask({
          canonicalTitle: "Design user interface",
          titleVariants: ["Design user interface"],
        }),
      ];
      const result = detector.detectTaskTagPatterns(analyses, commonTasks);

      const tagInfo = result.get("Design user interface");
      // The similarity between "design user interface layout" and
      // "design user interface" should be >= 0.6
      expect(tagInfo?.tagPatterns.length).toBeGreaterThanOrEqual(1);
      expect(tagInfo?.coreTags).toContain("ui");
    });

    test("should not match dissimilar task titles", () => {
      const analyses = [
        makeAnalysis("S1", [
          {
            title: "Deploy to production",
            estimationPercent: 100,
            tags: ["devops"],
          },
        ]),
      ];
      const commonTasks = [
        makeCommonTask({
          canonicalTitle: "Design API",
          titleVariants: ["Design API"],
        }),
      ];
      const result = detector.detectTaskTagPatterns(analyses, commonTasks);

      const tagInfo = result.get("Design API");
      expect(tagInfo?.coreTags).toHaveLength(0);
      expect(tagInfo?.optionalTags).toHaveLength(0);
      expect(tagInfo?.rareTags).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Integration-style: end-to-end tag pipeline
  // -----------------------------------------------------------------------
  describe("end-to-end tag analysis pipeline", () => {
    test("should detect, augment, and suggest tags across a realistic scenario", () => {
      // 5 stories: each has a "Design" task and a "Code" task
      // "Design" always has "frontend", sometimes has "ux"
      // "Code" always has "backend", rarely has "perf"
      const analyses = Array.from({ length: 5 }, (_, i) => {
        const designTags = ["frontend"];
        if (i < 3) designTags.push("ux"); // 3/5 = 60% => optional
        const codeTags = ["backend"];
        if (i === 0) codeTags.push("perf"); // 1/5 = 20% => optional (boundary)
        return makeAnalysis(`S${i}`, [
          { title: "Design", estimationPercent: 40, tags: designTags },
          { title: "Code", estimationPercent: 60, tags: codeTags },
        ]);
      });

      const commonTasks = [
        makeCommonTask({ canonicalTitle: "Design", frequency: 5 }),
        makeCommonTask({ canonicalTitle: "Code", frequency: 5 }),
      ];

      // Step 1: detect tag patterns
      const tagMap = detector.detectTaskTagPatterns(analyses, commonTasks);

      // Step 2: augment common tasks
      const augmented = detector.augmentCommonTasks(commonTasks, tagMap);

      // Step 3: verify design task
      const designTagInfo = augmented[0]?.tagInfo;
      expect(designTagInfo?.coreTags).toContain("frontend");
      expect(designTagInfo?.optionalTags).toContain("ux");

      // Step 4: verify code task
      const codeTagInfo = augmented[1]?.tagInfo;
      expect(codeTagInfo?.coreTags).toContain("backend");
      expect(codeTagInfo?.optionalTags).toContain("perf");

      // Step 5: get suggested tags
      expect(designTagInfo).toBeDefined();
      const designSuggested = detector.getSuggestedTags(designTagInfo as EnhancedTagInfo, true);
      expect(designSuggested).toContain("frontend");
      // "ux" at 60% >= 40% threshold => should be included
      expect(designSuggested).toContain("ux");

      // Step 6: merge tags
      expect(codeTagInfo).toBeDefined();
      const coreMerged = detector.mergeTagsWithFrequency(codeTagInfo as EnhancedTagInfo, true);
      expect(coreMerged).toContain("backend");
      expect(coreMerged).not.toContain("perf");

      const allMerged = detector.mergeTagsWithFrequency(codeTagInfo as EnhancedTagInfo, false);
      expect(allMerged).toContain("backend");
      expect(allMerged).toContain("perf");

      // Step 7: detect tag-based groups
      const groups = detector.detectTagBasedGroups(augmented);
      expect(groups.get("frontend")).toHaveLength(1);
      expect(groups.get("backend")).toHaveLength(1);

      // Step 8: calculate distribution
      const dist = detector.calculateTagDistribution(analyses);
      // "frontend" appears on 5 out of 10 total tasks => 50%
      expect(dist.frontend).toBe(50);
      // "backend" appears on 5 out of 10 total tasks => 50%
      expect(dist.backend).toBe(50);
    });
  });
});
