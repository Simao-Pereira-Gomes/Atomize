import { describe, expect, test } from "bun:test";
import {
  applyProposalToYaml,
  deriveImprovedCopy,
} from "@sppg2001/atomize-core/services/template/template-writeback";
import type { TaskTemplate } from "@sppg2001/atomize-core/templates/schema";
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

describe("applyProposalToYaml", () => {
  test("returns the source text unchanged when the proposal changes nothing", () => {
    expect(applyProposalToYaml(SOURCE, structuredClone(source))).toBe(SOURCE);
  });

  test("changes only the values that changed, keeping comments, quoting, and key order", () => {
    const proposal = structuredClone(source);
    proposal.tasks[0] = { ...proposal.tasks[0], title: "Implement the endpoint", estimationPercent: 60 } as TaskTemplate["tasks"][number];
    proposal.tasks[1] = { ...proposal.tasks[1], estimationPercent: 40 } as TaskTemplate["tasks"][number];

    const text = applyProposalToYaml(SOURCE, proposal);

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

    const text = applyProposalToYaml(SOURCE, proposal);

    expect(parse(text)).toEqual(proposal);
    expect(text).not.toContain("description:");
    expect(text).toContain("# Never skip this");
  });

  test("follows a Task that moved, keeping its comment with it", () => {
    const proposal = structuredClone(source);
    proposal.tasks.reverse();

    const text = applyProposalToYaml(SOURCE, proposal);

    expect(parse(text)).toEqual(proposal);
    expect(text.indexOf("# Never skip this")).toBeLessThan(text.indexOf("# The core of the work"));
  });

  test("keeps the source's indentation", () => {
    const fourSpaces = 'version: "1.0"\nname: X\nfilter:\n    workItemTypes:\n        - Bug\ntasks:\n    - title: A\n      estimationPercent: 100\n';
    const proposal = parse(fourSpaces) as TaskTemplate;
    proposal.name = "Y";
    expect(applyProposalToYaml(fourSpaces, proposal)).toBe(fourSpaces.replace("name: X", "name: Y"));
  });
});

describe("deriveImprovedCopy", () => {
  const proposal = { ...source, origin: "template:base" } as TaskTemplate;

  test("names the copy as improved and records the Catalog source as its origin", () => {
    const copy = deriveImprovedCopy(proposal, { catalogRef: "template:backend-api" });
    expect(copy.name).toBe("Backend API (improved)");
    expect(copy.origin).toBe("template:backend-api");
  });

  test("leaves out origin for a standalone file", () => {
    const copy = deriveImprovedCopy(proposal, {});
    expect(copy).not.toHaveProperty("origin");
    expect(copy.name).toBe("Backend API (improved)");
  });
});
