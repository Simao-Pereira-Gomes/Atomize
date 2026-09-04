import { describe, expect, it } from "vitest";
import { createAuthoringStore } from "../../stores/sections";
import { parseAIDraftResponse } from "../ai-draft";

describe("AI draft handoff", () => {
  it("loads Template-shaped field errors into the Authoring Store", () => {
    const template = parseAIDraftResponse({ template: { version: "1.0", name: "Draft", filter: {}, tasks: [{ title: "", estimationPercent: 120 }] } });
    const store = createAuthoringStore();
    store.loadTemplate(template);
    expect(store["basic-info"].fields.name).toBe("Draft");
    expect(store.tasks.fields.items[0]?.fields.estimationPercent).toBe("120");
    expect(store.tasks.isValid()).toBe(false);
  });

  it("rejects a response without a raw Template", () => {
    expect(() => parseAIDraftResponse({})).toThrow("did not contain a Template");
  });
});
