import type { TaskDefinition, TaskTemplate } from "@sppg2001/atomize-schema";
import { describe, expect, it } from "vitest";
import { diffTemplates } from "../diff-templates";

const task = (over: Partial<TaskDefinition>): TaskDefinition => ({ title: "T", ...over }) as TaskDefinition;

const BUILD = task({ id: "build", title: "Build", estimationPercent: 50 });
const TEST = task({ id: "test", title: "Test", estimationPercent: 50 });

function template(overrides: Partial<TaskTemplate> = {}): TaskTemplate {
  return {
    version: "1.0",
    name: "Delivery",
    filter: { workItemTypes: ["User Story"], excludeIfHasTasks: true },
    tasks: [BUILD, TEST],
    ...overrides,
  } as TaskTemplate;
}

describe("diffTemplates", () => {
  it("reports no changes for identical templates", () => {
    expect(diffTemplates(template(), template())).toEqual({ fieldChanges: [], taskChanges: [], identical: true });
  });

  it("treats a task added at the end as added", () => {
    const docs = task({ id: "docs", title: "Docs", estimationPercent: 10 });
    const diff = diffTemplates(template(), template({ tasks: [BUILD, TEST, docs] }));
    expect(diff.identical).toBe(false);
    expect(diff.taskChanges).toEqual([{ key: "docs", status: "added", after: docs, fields: [] }]);
  });

  it("treats a removed task as removed, slotted after its base-side predecessor", () => {
    const diff = diffTemplates(template(), template({ tasks: [BUILD] }));
    expect(diff.taskChanges).toEqual([{ key: "test", status: "removed", before: TEST, fields: [] }]);
  });

  it("slots a removed first task before all surviving tasks", () => {
    const plan = task({ id: "plan", title: "Plan", estimationPercent: 20 });
    const build = task({ id: "build", title: "Build", estimationPercent: 80 });
    const diff = diffTemplates(template({ tasks: [plan, build] }), template({ tasks: [build] }));
    expect(diff.taskChanges.map((c) => [c.status, c.key])).toEqual([["removed", "plan"]]);
  });

  it("detects a pure reorder without flagging unmoved tasks", () => {
    const a = task({ id: "a", title: "A", estimationPercent: 33 });
    const b = task({ id: "b", title: "B", estimationPercent: 33 });
    const c = task({ id: "c", title: "C", estimationPercent: 34 });
    const diff = diffTemplates(template({ tasks: [a, b, c] }), template({ tasks: [c, a, b] }));
    expect(diff.taskChanges).toEqual([
      { key: "c", status: "modified", before: c, after: c, moved: { fromIndex: 2, toIndex: 0 }, fields: [] },
    ]);
  });

  it("does not flag a task as reordered when its raw index shifts only because a task was removed", () => {
    const a = task({ id: "a", title: "A", estimationPercent: 50 });
    const b = task({ id: "b", title: "B", estimationPercent: 25 });
    const c = task({ id: "c", title: "C", estimationPercent: 25 });
    const diff = diffTemplates(template({ tasks: [a, b, c] }), template({ tasks: [a, c] }));
    expect(diff.taskChanges.map((change) => change.status)).toEqual(["removed"]);
    expect(diff.taskChanges.every((change) => change.moved === undefined)).toBe(true);
  });

  it("reports a changed scalar field as a leaf change", () => {
    const diff = diffTemplates(template(), template({ description: "Now with docs" }));
    expect(diff.fieldChanges).toEqual([{ path: ["description"], before: undefined, after: "Now with docs" }]);
  });

  it("reports nested filter changes at leaf level, arrays atomic", () => {
    const diff = diffTemplates(
      template(),
      template({ filter: { workItemTypes: ["User Story", "Bug"], excludeIfHasTasks: false } }),
    );
    expect(diff.fieldChanges).toEqual([
      { path: ["filter", "workItemTypes"], before: ["User Story"], after: ["User Story", "Bug"] },
      { path: ["filter", "excludeIfHasTasks"], before: true, after: false },
    ]);
  });

  it("recurses into an optional block present on only one side (estimation added)", () => {
    const diff = diffTemplates(
      template(),
      template({ estimation: { strategy: "percentage", rounding: "nearest" } }),
    );
    expect(diff.fieldChanges).toEqual([
      { path: ["estimation", "strategy"], before: undefined, after: "percentage" },
      { path: ["estimation", "rounding"], before: undefined, after: "nearest" },
    ]);
  });

  it("reports per-task field changes, including nested customFields by key", () => {
    const before = task({ id: "build", title: "Build", estimationPercent: 100, customFields: { "Custom.Tier": "A" } });
    const after = task({ id: "build", title: "Assemble", estimationPercent: 100, customFields: { "Custom.Tier": "B" } });
    const diff = diffTemplates(template({ tasks: [before] }), template({ tasks: [after] }));
    expect(diff.taskChanges).toEqual([
      {
        key: "build",
        status: "modified",
        before,
        after,
        moved: undefined,
        fields: [
          { path: ["title"], before: "Build", after: "Assemble" },
          { path: ["customFields", "Custom.Tier"], before: "A", after: "B" },
        ],
      },
    ]);
  });

  it("records a task that both moved and changed as one modified entry", () => {
    const a = task({ id: "a", title: "A", estimationPercent: 50 });
    const bBefore = task({ id: "b", title: "B", estimationPercent: 50 });
    const bAfter = task({ id: "b", title: "B", estimationPercent: 70 });
    const diff = diffTemplates(template({ tasks: [a, bBefore] }), template({ tasks: [bAfter, a] }));
    expect(diff.taskChanges).toEqual([
      {
        key: "b",
        status: "modified",
        before: bBefore,
        after: bAfter,
        moved: { fromIndex: 1, toIndex: 0 },
        fields: [{ path: ["estimationPercent"], before: 50, after: 70 }],
      },
    ]);
  });

  it("matches duplicate titles positionally when ids are absent", () => {
    const diff = diffTemplates(
      template({ tasks: [task({ title: "Review", estimationPercent: 50 }), task({ title: "Review", estimationPercent: 50 })] }),
      template({ tasks: [task({ title: "Review", estimationPercent: 40 }), task({ title: "Review", estimationPercent: 60 })] }),
    );
    expect(diff.taskChanges.map((change) => change.fields)).toEqual([
      [{ path: ["estimationPercent"], before: 50, after: 40 }],
      [{ path: ["estimationPercent"], before: 50, after: 60 }],
    ]);
  });

  it("matches on title when the id changed (id shown among the changed fields)", () => {
    const diff = diffTemplates(
      template({ tasks: [task({ id: "build", title: "Build", estimationPercent: 100 })] }),
      template({ tasks: [task({ id: "assemble", title: "Build", estimationPercent: 100 })] }),
    );
    expect(diff.taskChanges.at(0)?.fields).toEqual([{ path: ["id"], before: "build", after: "assemble" }]);
  });

  it("matches on id when the title changed", () => {
    const diff = diffTemplates(
      template({ tasks: [task({ id: "build", title: "Build", estimationPercent: 100 })] }),
      template({ tasks: [task({ id: "build", title: "Compile", estimationPercent: 100 })] }),
    );
    expect(diff.taskChanges).toHaveLength(1);
    expect(diff.taskChanges.at(0)?.fields).toEqual([{ path: ["title"], before: "Build", after: "Compile" }]);
  });

  it("ignores origin, extends, mixins, created, and lastModified", () => {
    const base = template({ created: "2024-01-01", origin: "template:delivery" } as Partial<TaskTemplate>);
    const current = template({
      created: "2025-06-01",
      lastModified: "2025-06-01",
      origin: "template:delivery",
      extends: "template:base",
    } as Partial<TaskTemplate>);
    expect(diffTemplates(base, current).identical).toBe(true);
  });

  it("added and removed task entries carry no field changes", () => {
    const diff = diffTemplates(
      template({ tasks: [task({ id: "a", title: "A", estimationPercent: 100 })] }),
      template({ tasks: [task({ id: "b", title: "B", estimationPercent: 100 })] }),
    );
    expect(diff.taskChanges.every((change) => change.fields.length === 0)).toBe(true);
    expect(diff.taskChanges.map((change) => change.status).sort()).toEqual(["added", "removed"]);
  });
});
