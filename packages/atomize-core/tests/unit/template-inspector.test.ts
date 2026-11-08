import { describe, expect, test } from "bun:test";
import type { TaskTemplate } from "../../src/templates/schema";
import {
  inspectTemplate,
  parseMockStory,
  runPreview,
} from "../../src/templates/template-inspector";

function makeTemplate(overrides: Partial<TaskTemplate> = {}): TaskTemplate {
  return {
    version: "1.0",
    name: "Test Template",
    filter: {},
    tasks: [
      { title: "Task A", estimationPercent: 60 },
      { title: "Task B", estimationPercent: 40 },
    ],
    ...overrides,
  };
}


describe("inspectTemplate", () => {
  test("returns empty fields when no conditions and no relevant filter", async () => {
    const result = inspectTemplate(
      makeTemplate({
        tasks: [
          { title: "Task A", estimationFixed: 1 },
          { title: "Task B", estimationFixed: 2 },
        ],
      }),
    );
    expect(result.fields).toHaveLength(0);
  });

  test("requires estimation for percentage-based tasks", async () => {
    const result = inspectTemplate(makeTemplate());

    const field = result.fields.find((f) => f.name === "estimation");
    expect(field).toBeDefined();
    expect(field?.type).toBe("number");
    expect(field?.sources).toContain("estimation");
    expect(field?.required).toBe(true);
  });

  test("extracts standard field refs from task conditions", async () => {
    const result = inspectTemplate(
      makeTemplate({
        tasks: [
          {
            title: "Backend task",
            estimationPercent: 100,
            condition: { field: "tags", operator: "contains", value: "backend" },
          },
        ],
      }),
    );

    const field = result.fields.find((f) => f.name === "tags");
    expect(field).toBeDefined();
    expect(field?.type).toBe("string[]");
    expect(field?.sources).toContain("condition");
  });

  test("extracts custom field refs from task conditions", async () => {
    const result = inspectTemplate(
      makeTemplate({
        tasks: [
          {
            title: "Enterprise task",
            estimationPercent: 100,
            condition: { customField: "Custom.ClientTier", operator: "equals", value: "Enterprise" },
          },
        ],
      }),
    );

    const field = result.fields.find((f) => f.name === "Custom.ClientTier");
    expect(field).toBeDefined();
    expect(field?.type).toBe("unknown");
    expect(field?.sources).toContain("condition");
  });

  test("extracts filter fields: tags, type, state, assignedTo, priority", async () => {
    const result = inspectTemplate(
      makeTemplate({
        filter: {
          tags: { include: ["backend"] },
          workItemTypes: ["User Story"],
          states: ["Active"],
          assignedTo: ["@Me"],
          priority: { min: 1 },
        },
      }),
    );

    const names = result.fields.map((f) => f.name);
    expect(names).toContain("tags");
    expect(names).toContain("type");
    expect(names).toContain("state");
    expect(names).toContain("assignedTo");
    expect(names).toContain("priority");

    expect(result.fields.find((f) => f.name === "tags")?.sources).toEqual(["filter"]);
  });

  test("does not extract irrelevant filter fields (savedQuery, team, areaPaths)", async () => {
    const result = inspectTemplate(
      makeTemplate({
        filter: {
          areaPaths: ["MyProject"],
          team: "MyTeam",
        },
      }),
    );
    const names = result.fields.map((f) => f.name);
    expect(names).not.toContain("areaPath");
    expect(names).not.toContain("team");
  });

  test("merges sources when a field appears in both filter and condition", async () => {
    const result = inspectTemplate(
      makeTemplate({
        filter: { tags: { include: ["backend"] } },
        tasks: [
          {
            title: "Task",
            estimationPercent: 100,
            condition: { field: "tags", operator: "contains", value: "backend" },
          },
        ],
      }),
    );

    const field = result.fields.find((f) => f.name === "tags");
    expect(field?.sources).toHaveLength(2);
    expect(field?.sources).toContain("filter");
    expect(field?.sources).toContain("condition");
  });

  test("deduplicates fields referenced in multiple conditions", async () => {
    const result = inspectTemplate(
      makeTemplate({
        tasks: [
          {
            title: "Task A",
            estimationPercent: 50,
            condition: { field: "estimation", operator: "gt", value: 3 },
          },
          {
            title: "Task B",
            estimationPercent: 50,
            condition: { field: "estimation", operator: "lte", value: 10 },
          },
        ],
      }),
    );

    const estimationFields = result.fields.filter((f) => f.name === "estimation");
    expect(estimationFields).toHaveLength(1);
    expect(estimationFields[0]?.type).toBe("number");
  });

  test("extracts fields from estimationPercentCondition", async () => {
    const result = inspectTemplate(
      makeTemplate({
        tasks: [
          {
            title: "Task",
            estimationPercentCondition: [
              {
                condition: { field: "priority", operator: "equals", value: 1 },
                percent: 30,
              },
            ],
          },
        ],
      }),
    );

    const field = result.fields.find((f) => f.name === "priority");
    expect(field).toBeDefined();
    expect(field?.type).toBe("number");
  });

  test("traverses compound all/any conditions", async () => {
    const result = inspectTemplate(
      makeTemplate({
        tasks: [
          {
            title: "Task",
            estimationPercent: 100,
            condition: {
              all: [
                { field: "estimation", operator: "gt", value: 5 },
                {
                  any: [
                    { field: "tags", operator: "contains", value: "backend" },
                    { customField: "Custom.Flag", operator: "equals", value: true },
                  ],
                },
              ],
            },
          },
        ],
      }),
    );

    const names = result.fields.map((f) => f.name);
    expect(names).toContain("estimation");
    expect(names).toContain("tags");
    expect(names).toContain("Custom.Flag");
  });

  test("assigns correct types to known fields", async () => {
    const result = inspectTemplate(
      makeTemplate({
        tasks: [
          {
            title: "Task",
            estimationPercent: 100,
            condition: {
              all: [
                { field: "estimation", operator: "gt", value: 0 },
                { field: "state", operator: "equals", value: "Active" },
                { field: "assignedTo", operator: "not-equals", value: "" },
              ],
            },
          },
        ],
      }),
    );

    expect(result.fields.find((f) => f.name === "estimation")?.type).toBe("number");
    expect(result.fields.find((f) => f.name === "state")?.type).toBe("string");
    expect(result.fields.find((f) => f.name === "assignedTo")?.type).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// parseMockStory
// ---------------------------------------------------------------------------

describe("parseMockStory", () => {
  test("applies defaults for all required WorkItem fields", async () => {
    const story = parseMockStory("{}");
    expect(story.id).toBe("mock");
    expect(story.title).toBe("Mock Story");
    expect(story.type).toBe("User Story");
    expect(story.state).toBe("Active");
  });

  test("preserves user-provided fields", async () => {
    const story = parseMockStory('{"estimation":8,"tags":["backend"]}');
    expect(story.estimation).toBe(8);
    expect(story.tags).toEqual(["backend"]);
  });

  test("user values override defaults", async () => {
    const story = parseMockStory('{"state":"Resolved","type":"Bug"}');
    expect(story.state).toBe("Resolved");
    expect(story.type).toBe("Bug");
  });

  test("throws a clear error on invalid JSON", async () => {
    expect(() => parseMockStory("{not json}")).toThrow("Invalid mock story JSON");
  });

  test("throws when JSON is an array", async () => {
    expect(() => parseMockStory("[1,2,3]")).toThrow("JSON object");
  });

  test("throws when JSON is a primitive", async () => {
    expect(() => parseMockStory('"hello"')).toThrow("JSON object");
  });
});

// ---------------------------------------------------------------------------
// runPreview
// ---------------------------------------------------------------------------

describe("runPreview", () => {
  test("Mock Preview carries the unit of the default estimate fields, and none for overridden fields", async () => {
    expect((await runPreview(makeTemplate(), '{"estimation":10}')).estimateUnit).toBe("hours");
    const overridden = makeTemplate({ estimation: { strategy: "percentage", rounding: "none", targetFields: ["Custom.Effort"] } });
    expect((await runPreview(overridden, '{"estimation":10}')).estimateUnit).toBeUndefined();
  });

  const tShirtTemplate = () =>
    makeTemplate({
      tasks: [
        { title: "Task A", estimationPercent: 80 },
        { title: "Task B", estimationPercent: 20 },
      ],
      estimation: { strategy: "percentage", rounding: "none", source: "Custom.TShirtSize", conversion: { table: { L: 5 } } },
    });

  test("Mock Preview reads the Story Estimate from the overridden source field", async () => {
    const result = await runPreview(tShirtTemplate(), '{"estimation":40,"customFields":{"Custom.TShirtSize":"L"}}');

    expect(result.tasks.map((t) => t.estimation)).toEqual([4, 1]);
    expect(result.estimationSummary.storyEstimation).toBe(5);
  });

  test("Mock Preview shows an Unresolvable Story Estimate when the Mock Story lacks the source field", async () => {
    const result = await runPreview(tShirtTemplate(), '{"estimation":40}');

    expect(result.tasks.every((t) => t.estimation === undefined)).toBe(true);
    expect(result.unresolvedEstimate?.action).toBe("blank");
  });

  test("inspection asks for the overridden source field instead of estimation", async () => {
    const fields = inspectTemplate(tShirtTemplate()).fields.map((f) => f.name);

    expect(fields).toContain("Custom.TShirtSize");
    expect(fields).not.toContain("estimation");
  });

  test("Mock Preview leaves Task Estimates blank and explains why when the Story has no estimate", async () => {
    const result = await runPreview(makeTemplate(), "{}");

    expect(result.tasks.every((t) => t.estimation === undefined)).toBe(true);
    expect(result.unresolvedEstimate).toEqual({ action: "blank", reason: "Story has no estimate" });
  });

  test("Mock Preview shows the converted Story total and converted Task Estimates", async () => {
    const template = makeTemplate({
      tasks: [
        { title: "Task A", estimationPercent: 60 },
        { title: "Task B", estimationPercent: 40 },
      ],
      estimation: { strategy: "percentage", rounding: "none", conversion: { factor: 4 } },
    });
    const result = await runPreview(template, '{"estimation":5}');

    expect(result.estimationSummary.storyEstimation).toBe(20);
    expect(result.tasks.map((t) => t.estimation)).toEqual([12, 8]);
  });

  test("returns all tasks when no conditions", async () => {
    const template = makeTemplate();
    const result = await runPreview(template, '{"estimation":10}');

    expect(result.tasks).toHaveLength(2);
    expect(result.skippedTasks).toHaveLength(0);
  });

  test("calculates estimations correctly", async () => {
    const template = makeTemplate({
      tasks: [
        { title: "Task A", estimationPercent: 60 },
        { title: "Task B", estimationPercent: 40 },
      ],
    });
    const result = await runPreview(template, '{"estimation":10}');

    expect(result.tasks.find((t) => t.title === "Task A")?.estimation).toBe(6);
    expect(result.tasks.find((t) => t.title === "Task B")?.estimation).toBe(4);
  });

  test("includes estimationPercent in task output", async () => {
    const template = makeTemplate({
      tasks: [
        { title: "Task A", estimationPercent: 75 },
        { title: "Task B", estimationPercent: 25 },
      ],
    });
    const result = await runPreview(template, '{"estimation":8}');

    expect(result.tasks.find((t) => t.title === "Task A")?.estimationPercent).toBe(75);
    expect(result.tasks.find((t) => t.title === "Task B")?.estimationPercent).toBe(25);
  });

  test("excludes conditional tasks whose condition is not met", async () => {
    const template = makeTemplate({
      tasks: [
        { title: "Always", estimationPercent: 60 },
        {
          title: "Backend only",
          estimationPercent: 40,
          condition: { field: "tags", operator: "contains", value: "backend" },
        },
      ],
    });

    const result = await runPreview(template, '{"estimation":10,"tags":["frontend"]}');

    expect(result.tasks.map((t) => t.title)).toEqual(["Always"]);
    expect(result.skippedTasks).toHaveLength(1);
    expect(result.skippedTasks[0]?.title).toBe("Backend only");
  });

  test("includes conditional tasks when condition is met", async () => {
    const template = makeTemplate({
      tasks: [
        { title: "Always", estimationPercent: 60 },
        {
          title: "Backend only",
          estimationPercent: 40,
          condition: { field: "tags", operator: "contains", value: "backend" },
        },
      ],
    });

    const result = await runPreview(template, '{"estimation":10,"tags":["backend"]}');

    expect(result.tasks.map((t) => t.title)).toEqual(["Always", "Backend only"]);
    expect(result.skippedTasks).toHaveLength(0);
  });

  test("skipped task includes title and reason", async () => {
    const template = makeTemplate({
      tasks: [
        {
          title: "Conditional",
          estimationPercent: 100,
          condition: { field: "estimation", operator: "gt", value: 100 },
        },
      ],
    });

    const result = await runPreview(template, '{"estimation":5}');

    expect(result.skippedTasks[0]?.title).toBe("Conditional");
    expect(result.skippedTasks[0]?.reason).toBeTruthy();
  });

  test("returns correct estimationSummary", async () => {
    const template = makeTemplate({
      tasks: [
        { title: "Task A", estimationPercent: 60 },
        { title: "Task B", estimationPercent: 40 },
      ],
    });

    const result = await runPreview(template, '{"estimation":10}');

    expect(result.estimationSummary.storyEstimation).toBe(10);
    expect(result.estimationSummary.totalTaskEstimation).toBe(10);
    expect(result.estimationSummary.percentageUsed).toBe(100);
  });

  test("reflects dependency order in task list", async () => {
    const template = makeTemplate({
      tasks: [
        { id: "b", title: "Task B", estimationPercent: 40, dependsOn: ["a"] },
        { id: "a", title: "Task A", estimationPercent: 60 },
      ],
    });

    const result = await runPreview(template, '{"estimation":10}');

    const titles = result.tasks.map((t) => t.title);
    expect(titles.indexOf("Task A")).toBeLessThan(titles.indexOf("Task B"));
  });

  test("throws on invalid mock story JSON", async () => {
    const template = makeTemplate();
    await expect(runPreview(template, "not json")).rejects.toThrow("Invalid mock story JSON");
  });
});
