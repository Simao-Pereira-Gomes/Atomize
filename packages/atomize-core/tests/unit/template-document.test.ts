import { describe, expect, test } from "bun:test";
import type { TaskTemplate } from "@sppg2001/atomize-core/templates/schema";
import { TemplateDocument } from "@sppg2001/atomize-core/templates/template-document";
import { parse } from "yaml";

const SOURCE = `# Backend API Template — owned by the platform team
version: "1.0"
name: Backend API
description: Standard backend work

filter:
  workItemTypes: ["User Story"] # stories only
  states:
    - Active

tasks:
  # The core of the work
  - id: build
    title: Implementation
    estimationPercent: 70
  # Never skip this
  - id: test
    title: Testing
    estimationPercent: 30
`;

const source = parse(SOURCE) as TaskTemplate;

describe("TemplateDocument.withValue", () => {
  test("returns the source text unchanged when the proposal changes nothing", () => {
    expect(TemplateDocument.parse(SOURCE).withValue(structuredClone(source)).toString()).toBe(SOURCE);
  });

  test("changes only the values that changed, keeping comments, quoting, and key order", () => {
    const proposal = structuredClone(source);
    proposal.tasks[0] = { ...proposal.tasks[0], title: "Implement the endpoint", estimationPercent: 60 } as TaskTemplate["tasks"][number];
    proposal.tasks[1] = { ...proposal.tasks[1], estimationPercent: 40 } as TaskTemplate["tasks"][number];

    const text = TemplateDocument.parse(SOURCE).withValue(proposal).toString();

    expect(parse(text)).toEqual(proposal);
    expect(text).toContain("# Backend API Template — owned by the platform team");
    expect(text).toContain("# stories only");
    expect(text).toContain("# The core of the work");
    expect(text).toContain("# Never skip this");
    expect(text).toContain('version: "1.0"');
    expect(text.indexOf("description:")).toBeLessThan(text.indexOf("filter:"));
  });

  test("adds new keys and Tasks and removes dropped ones", () => {
    const proposal = structuredClone(source) as TaskTemplate & { description?: string };
    delete proposal.description;
    proposal.tasks.push({ id: "review", title: "Code review", estimationPercent: 10 } as TaskTemplate["tasks"][number]);
    proposal.tags = ["backend"];

    const text = TemplateDocument.parse(SOURCE).withValue(proposal).toString();

    expect(parse(text)).toEqual(proposal);
    expect(text).not.toContain("description:");
    expect(text).toContain("# Never skip this");
  });

  test("follows a Task that moved, keeping its comment with it", () => {
    const proposal = structuredClone(source);
    proposal.tasks.reverse();

    const text = TemplateDocument.parse(SOURCE).withValue(proposal).toString();

    expect(parse(text)).toEqual(proposal);
    expect(text.indexOf("# Never skip this")).toBeLessThan(text.indexOf("# The core of the work"));
  });

  test("keeps the source's indentation", () => {
    const fourSpaces = 'version: "1.0"\nname: X\nfilter:\n    workItemTypes:\n        - Bug\ntasks:\n    - title: A\n      estimationPercent: 100\n';
    const proposal = parse(fourSpaces) as TaskTemplate;
    proposal.name = "Y";
    expect(TemplateDocument.parse(fourSpaces).withValue(proposal).toString()).toBe(fourSpaces.replace("name: X", "name: Y"));
  });
});

describe("applyProposalToYaml with YAML anchors", () => {
  const ANCHORED = `name: Anchored
tasks:
  - id: impl
    title: Implement
    estimationPercent: 60
  - id: sec
    title: Security Review
    estimationPercent: 20
    condition: &security
      field: tags
      operator: contains
      value: security
  - id: pentest
    title: Pen test
    estimationPercent: 20
    condition: *security
`;
  const anchored = parse(ANCHORED) as TaskTemplate;
  // A proposal arrives as JSON, so its conditions never share an object the way parse() makes them.
  const fresh = () => JSON.parse(JSON.stringify(anchored)) as TaskTemplate;
  type Condition = { value: string };
  const taskAt = (template: TaskTemplate, index: number) => {
    const task = template.tasks[index];
    if (!task) throw new Error(`No task at index ${index}`);
    return task;
  };
  const conditionOf = (template: TaskTemplate, index: number) => (taskAt(template, index).condition as unknown as Condition);

  test("keeps an alias the proposal doesn't change", () => {
    const proposal = fresh();
    proposal.tasks[0] = { ...proposal.tasks[0], estimationPercent: 55 } as TaskTemplate["tasks"][number];
    proposal.tasks[1] = { ...proposal.tasks[1], estimationPercent: 25 } as TaskTemplate["tasks"][number];

    const text = TemplateDocument.parse(ANCHORED).withValue(proposal).toString();

    expect(parse(text)).toEqual(proposal);
    expect(text).toContain("condition: &security");
    expect(text).toContain("condition: *security");
  });

  test("keeps the alias when the anchored value changes and the alias follows it", () => {
    const proposal = fresh();
    conditionOf(proposal, 1).value = "auth";
    conditionOf(proposal, 2).value = "auth";

    const text = TemplateDocument.parse(ANCHORED).withValue(proposal).toString();

    expect(parse(text)).toEqual(proposal);
    expect(text).toContain("condition: *security");
  });

  test("writes an alias out in full when only that use changes", () => {
    const proposal = fresh();
    conditionOf(proposal, 2).value = "auth";

    const text = TemplateDocument.parse(ANCHORED).withValue(proposal).toString();

    expect(parse(text)).toEqual(proposal);
    expect(text).toContain("condition: &security");
    expect(text).not.toContain("*security");
  });

  test("writes an alias out in full when its Task moves above the anchor", () => {
    const proposal = fresh();
    proposal.tasks = [taskAt(proposal, 0), taskAt(proposal, 2), taskAt(proposal, 1)];

    const text = TemplateDocument.parse(ANCHORED).withValue(proposal).toString();

    expect(parse(text)).toEqual(proposal);
    expect(text).not.toContain("*security");
  });

  test("writes an alias out in full when the Task holding its anchor is removed", () => {
    const proposal = fresh();
    proposal.tasks.splice(1, 1);

    const text = TemplateDocument.parse(ANCHORED).withValue(proposal).toString();

    expect(parse(text)).toEqual(proposal);
    expect(text).not.toContain("*security");
  });
});

describe("TemplateDocument round trip", () => {
  const TEXT = `# Shared settings
name: Round trip # trailing comment
defaults: &defaults
  priority: 2
  tags: [api]
tasks:
  - id: a
    title: A
    estimationPercent: 50
    extra: *defaults
  - id: b
    title: B
    estimationPercent: 50
    <<: *defaults
`;

  test("serializes an unchanged document as the original text", () => {
    expect(TemplateDocument.parse(TEXT).toString()).toBe(TEXT);
  });

  test("reads the value as YAML 1.2, keeping a merge key as an ordinary key", () => {
    const value = TemplateDocument.parse(TEXT).toValue() as { tasks: Array<Record<string, unknown>> };
    expect(value.tasks[0]?.extra).toEqual({ priority: 2, tags: ["api"] });
    expect(value.tasks[1]?.["<<"]).toEqual({ priority: 2, tags: ["api"] });
  });

  test("writes a changed value while anchors, aliases, merge keys and comments survive", () => {
    const value = TemplateDocument.parse(TEXT).toValue() as { name: string; tasks: Array<Record<string, unknown>> };
    value.name = "Renamed";
    (value.tasks[1] as Record<string, unknown>).estimationPercent = 40;
    (value.tasks[0] as Record<string, unknown>).estimationPercent = 60;

    const text = TemplateDocument.parse(TEXT).withValue(value).toString();

    expect(text).toContain("name: Renamed # trailing comment");
    expect(text).toContain("# Shared settings");
    expect(text).toContain("defaults: &defaults");
    expect(text).toContain("extra: *defaults");
    expect(text).toContain("<<: *defaults");
    expect(TemplateDocument.parse(text).toValue()).toEqual(value);
  });

  test("withValue leaves the original document unchanged", () => {
    const original = TemplateDocument.parse(TEXT);
    const value = original.toValue() as { name: string };
    value.name = "Other";

    original.withValue(value);

    expect(original.toString()).toBe(TEXT);
    expect((original.toValue() as { name: string }).name).toBe("Round trip");
  });

  test("throws on text that isn't valid YAML", () => {
    expect(() => TemplateDocument.parse("name: [unclosed")).toThrow();
  });

  test("creates a document from a value for a file that doesn't exist yet", () => {
    const text = TemplateDocument.create({ name: "New", tasks: [{ title: "A", estimationPercent: 100 }] }).toString();
    expect(TemplateDocument.parse(text).toValue()).toEqual({ name: "New", tasks: [{ title: "A", estimationPercent: 100 }] });
  });
});
