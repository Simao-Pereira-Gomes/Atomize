import { type TaskTemplate, TaskTemplateSchema } from "@sppg2001/atomize-schema";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { createAuthoringStore, isAuthoringStoreReadyForReview } from "../sections";

const baseTemplate: TaskTemplate = {
  version: "1.0",
  name: "Base Template",
  filter: {
    workItemTypes: ["User Story"],
    excludeIfHasTasks: true,
  },
  tasks: [
    {
      id: "analysis",
      title: "Analysis",
      estimationPercent: 100,
    },
  ],
};

function serialisedObject(store = createAuthoringStore()) {
  return parse(store.serialise()) as unknown;
}

describe("createAuthoringStore", () => {
  it("serialises Basic Info fields into Atomize YAML", () => {
    const store = createAuthoringStore();
    store.loadTemplate({
      ...baseTemplate,
      name: "Frontend Feature",
      description: "Build a frontend feature.",
      author: "Product Engineering",
      tags: ["frontend", "feature"],
    });

    expect(serialisedObject(store)).toEqual({
      version: "1.0",
      name: "Frontend Feature",
      description: "Build a frontend feature.",
      author: "Product Engineering",
      tags: ["frontend", "feature"],
      filter: {
        workItemTypes: ["User Story"],
        excludeIfHasTasks: true,
      },
      tasks: [
        {
          id: "analysis",
          title: "Analysis",
          estimationPercent: 100,
        },
      ],
    });
  });

  it("serialises build-mode Filter fields into Atomize YAML", () => {
    const store = createAuthoringStore();
    store.loadTemplate(baseTemplate);
    store.filter.set("states", ["New", "Active"]);
    store.filter.set("statesExclude", ["Closed"]);
    store.filter.set("areaPaths", ["Platform\\Team"]);
    store.filter.set("iterations", ["@CurrentIteration"]);
    store.filter.set("tagsInclude", ["ready"]);
    store.filter.set("tagsExclude", ["blocked"]);
    store.filter.set("assignedTo", ["@Me"]);

    expect(serialisedObject(store)).toMatchObject({
      filter: {
        workItemTypes: ["User Story"],
        states: ["New", "Active"],
        statesExclude: ["Closed"],
        areaPaths: ["Platform\\Team"],
        iterations: ["@CurrentIteration"],
        tags: {
          include: ["ready"],
          exclude: ["blocked"],
        },
        excludeIfHasTasks: true,
        assignedTo: ["@Me"],
      },
    });
  });

  it("serialises query-mode Filter fields into Atomize YAML", () => {
    const store = createAuthoringStore();
    store.loadTemplate(baseTemplate);
    store.filter.set("filterMode", "query");
    store.filter.set("savedQueryIds", ["11111111-1111-4111-8111-111111111111"]);

    expect(serialisedObject(store)).toMatchObject({
      filter: {
        savedQuery: {
          id: "11111111-1111-4111-8111-111111111111",
        },
        excludeIfHasTasks: true,
      },
    });
  });

  it("preserves saved query paths loaded from existing templates", () => {
    const store = createAuthoringStore();
    store.loadTemplate({
      ...baseTemplate,
      filter: {
        savedQuery: {
          path: "Shared Queries/Current Sprint",
        },
        excludeIfHasTasks: true,
      },
    });

    expect(serialisedObject(store)).toMatchObject({
      filter: {
        savedQuery: {
          path: "Shared Queries/Current Sprint",
        },
        excludeIfHasTasks: true,
      },
    });
  });

  it("rejects multiple saved queries instead of serialising only the first", () => {
    const store = createAuthoringStore();
    store.loadTemplate(baseTemplate);
    store.filter.set("filterMode", "query");
    store.filter.set("savedQueryIds", [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);

    expect(store.filter.isValid()).toBe(false);
    expect(() => store.serialise()).toThrow();
  });

  it("is ready for Review when optional Estimation and Validation are omitted", () => {
    const store = createAuthoringStore();
    store.loadTemplate(baseTemplate);

    expect(store.estimation.fields.source).toBe("");
    expect(store.validation.fields.mode).toBe("");
    expect(isAuthoringStoreReadyForReview(store)).toBe(true);
    expect(serialisedObject(store)).not.toHaveProperty("estimation");
    expect(serialisedObject(store)).not.toHaveProperty("validation");
  });


  it("serialises Tasks fields into Atomize YAML", () => {
    const store = createAuthoringStore();
    store.loadTemplate({
      ...baseTemplate,
      tasks: [
        {
          id: "build",
          title: "Build",
          description: "Implement the change.",
          estimationPercent: 60,
          tags: ["dev"],
        },
        {
          id: "test",
          title: "Test",
          estimationPercent: 40,
          dependsOn: ["build"],
        },
      ],
    });

    expect(serialisedObject(store)).toMatchObject({
      tasks: [
        {
          id: "build",
          title: "Build",
          description: "Implement the change.",
          estimationPercent: 60,
          tags: ["dev"],
        },
        {
          id: "test",
          title: "Test",
          estimationPercent: 40,
          dependsOn: ["build"],
        },
      ],
    });
  });

  it("serialises Estimation fields into Atomize YAML", () => {
    const store = createAuthoringStore();
    store.loadTemplate(baseTemplate);
    store.estimation.set("source", "story-points");
    store.estimation.set("rounding", "nearest");
    store.estimation.set("minimumTaskPoints", "0.5");

    expect(serialisedObject(store)).toMatchObject({
      estimation: {
        strategy: "percentage",
        source: "story-points",
        rounding: "nearest",
        minimumTaskPoints: 0.5,
      },
    });
  });

  it("serialises Validation fields into Atomize YAML", () => {
    const store = createAuthoringStore();
    store.loadTemplate(baseTemplate);
    store.validation.set("mode", "strict");
    store.validation.set("totalEstimationMustBe", "100");
    store.validation.set("minTasks", "1");
    store.validation.set("maxTasks", "3");

    expect(serialisedObject(store)).toMatchObject({
      validation: {
        mode: "strict",
        totalEstimationMustBe: 100,
        minTasks: 1,
        maxTasks: 3,
      },
    });
  });

  it("serialises all Estimation settings and Validation rules into Atomize YAML", () => {
    const store = createAuthoringStore();
    store.loadTemplate(baseTemplate);
    store.estimation.set("ifParentHasNoEstimation", "use-default");
    store.estimation.set("defaultParentEstimation", "8");
    store.validation.set("totalEstimationRangeMin", "90");
    store.validation.set("totalEstimationRangeMax", "100");
    store.validation.set("taskEstimationRangeMin", "5");
    store.validation.set("taskEstimationRangeMax", "80");
    store.validation.addRequiredTask();
    store.validation.set("requiredTasks", 0, "title", "Analysis");
    store.validation.set("requiredTasks", 0, "id", "analysis");

    expect(serialisedObject(store)).toMatchObject({
      estimation: {
        ifParentHasNoEstimation: "use-default",
        defaultParentEstimation: 8,
      },
      validation: {
        totalEstimationRange: { min: 90, max: 100 },
        taskEstimationRange: { min: 5, max: 80 },
        requiredTasks: [{ title: "Analysis", id: "analysis" }],
      },
    });
  });

  it("serialises Metadata fields into Atomize YAML", () => {
    const store = createAuthoringStore();
    store.loadTemplate(baseTemplate);
    store["basic-info"].set("category", "Frontend");
    store.metadata.set("difficulty", "intermediate");
    store.metadata.set("estimationGuidelines", "Estimate the parent story before generation.");
    store.metadata.set("notes", "Use this template for product work.");

    expect(serialisedObject(store)).toMatchObject({
      metadata: {
        category: "Frontend",
        difficulty: "intermediate",
        estimationGuidelines: "Estimate the parent story before generation.",
        notes: "Use this template for product work.",
      },
    });
  });

  it("round-trips a fully populated store through serialised valid Atomize YAML", () => {
    const store = createAuthoringStore();
    store.loadTemplate({
      version: "1.0",
      name: "Full Template",
      description: "A complete template.",
      author: "Atomize",
      tags: ["full"],
      created: "2026-06-05",
      lastModified: "2026-06-05",
      origin: "template:base",
      filter: {
        team: "Platform Team",
        workItemTypes: ["User Story"],
        states: ["Ready for Sprint"],
        tags: {
          exclude: ["skip"],
        },
        excludeIfHasTasks: true,
        iterations: ["@CurrentIteration"],
      },
      tasks: [
        {
          id: "analysis",
          title: "Analysis",
          description: "Clarify the work.",
          estimationPercent: 40,
          activity: "Development",
          condition: {
            field: "tags",
            operator: "not-contains",
            value: "Testing Only",
          },
        },
        {
          id: "test",
          title: "Test",
          estimationPercent: 60,
          dependsOn: ["analysis"],
          acceptanceCriteria: ["The happy path is covered"],
        },
      ],
      estimation: {
        strategy: "percentage",
        source: "story-points",
        rounding: "none",
        minimumTaskPoints: 0,
      },
      validation: {
        mode: "strict",
        totalEstimationMustBe: 60,
        minTasks: 2,
        maxTasks: 5,
      },
      metadata: {
        category: "Agile Project",
        difficulty: "advanced",
        recommendedFor: ["User Story"],
        estimationGuidelines: "Use story points.",
      },
    });

    const parsed = parse(store.serialise());

    expect(TaskTemplateSchema.parse(parsed)).toEqual(store.toTemplate());
    expect(parsed).toMatchObject({
      name: "Full Template",
      filter: {
        team: "Platform Team",
      },
      tasks: [
        {
          condition: {
            field: "tags",
            operator: "not-contains",
            value: "Testing Only",
          },
        },
        {
          dependsOn: ["analysis"],
          acceptanceCriteria: ["The happy path is covered"],
        },
      ],
      metadata: {
        recommendedFor: ["User Story"],
      },
    });
  });

  it("exposes section validity, fails serialise when invalid, and resets to empty defaults", () => {
    const store = createAuthoringStore();

    expect(store["basic-info"].isValid()).toBe(false);
    expect(store.filter.isValid()).toBe(true);
    expect(store.tasks.isValid()).toBe(false);
    expect(() => store.serialise()).toThrow();

    store.loadTemplate(baseTemplate);
    expect(store["basic-info"].isValid()).toBe(true);
    expect(store.tasks.isValid()).toBe(true);

    store.reset();

    expect(store["basic-info"].fields.name).toBe("");
    expect(store.tasks.fields.items).toHaveLength(1);
    expect(store.tasks.fields.items[0]?.fields.title).toBe("");
    expect(store["basic-info"].advanced.origin).toBeUndefined();
    expect(() => store.serialise()).toThrow();
  });
});
