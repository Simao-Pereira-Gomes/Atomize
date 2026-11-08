import { describe, expect, test } from "bun:test";
import { deriveImprovedCopy } from "@sppg2001/atomize-core/services/template/template-improvement";
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
