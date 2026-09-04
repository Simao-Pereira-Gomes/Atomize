import { describe, expect, it } from "vitest";
import { createAIDraftLifecycle } from "../ai-draft-lifecycle";

describe("AI draft lifecycle", () => {
  it("prevents a draft cancelled during grounding from starting an AI request", async () => {
    const lifecycle = createAIDraftLifecycle(() => "draft-1");
    const id = lifecycle.begin();
    const grounding = new Promise<void>((resolve) => setTimeout(resolve, 0));
    lifecycle.cancel(id);
    await grounding;
    expect(lifecycle.isActive(id)).toBe(false);
  });
});
