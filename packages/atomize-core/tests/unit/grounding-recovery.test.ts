import { describe, expect, test } from "bun:test";
import {
  type GroundingFailureChoice,
  type ProjectGroundingError,
  withGroundingRecovery,
} from "@sppg2001/atomize-core/services/template/project-grounding";
import { AuthError } from "@sppg2001/atomize-core/utils/errors";

/** Fails `failures` times, then succeeds. */
function flaky(failures: number, error: unknown = new Error("network down")) {
  let calls = 0;
  return {
    attempt: async () => {
      calls++;
      if (calls <= failures) throw error;
      return "grounding";
    },
    calls: () => calls,
  };
}

const answering = (...choices: GroundingFailureChoice[]) => {
  const asked: ProjectGroundingError[] = [];
  return {
    onFailure: async (error: ProjectGroundingError) => {
      asked.push(error);
      return choices.shift() ?? "cancel";
    },
    asked,
  };
};

describe("withGroundingRecovery", () => {
  test("returns the Grounding without asking when it loads", async () => {
    const source = flaky(0);
    const user = answering();
    expect(await withGroundingRecovery(source.attempt, user.onFailure)).toBe("grounding");
    expect(user.asked).toEqual([]);
  });

  test("retries as often as the user chooses to", async () => {
    const source = flaky(2);
    const user = answering("retry", "retry");
    expect(await withGroundingRecovery(source.attempt, user.onFailure)).toBe("grounding");
    expect(source.calls()).toBe(3);
  });

  test("is null when the user continues without Grounding, and undefined when they cancel", async () => {
    expect(await withGroundingRecovery(flaky(1).attempt, answering("ungrounded").onFailure)).toBeNull();
    expect(await withGroundingRecovery(flaky(1).attempt, answering("cancel").onFailure)).toBeUndefined();
  });

  test("asks with the user-facing Grounding error, never the raw one", async () => {
    const user = answering("cancel");
    await withGroundingRecovery(flaky(1, new AuthError("Authentication failed: token expired")).attempt, user.onFailure);
    expect(user.asked[0]?.code).toBe("GROUNDING_TOKEN_EXPIRED");
  });

  test("a caller that can't ask (a non-interactive run) stops by throwing from onFailure", async () => {
    await expect(
      withGroundingRecovery(flaky(1).attempt, async (error) => {
        throw new Error(`stopped: ${error.message}`);
      }),
    ).rejects.toThrow("stopped:");
  });
});
