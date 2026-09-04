import { describe, expect, it } from "vitest";
import {
  initialLiveExecutionState,
  type LiveExecutionEvent,
  type LiveExecutionPayload,
  type LiveExecutionState,
  transitionLiveExecution,
} from "../live-execution-confirmation";

const payload: LiveExecutionPayload = {
  template: { kind: "catalog", ref: "template:release-checklist", displayName: "Release Checklist" },
  scope: { kind: "filter" },
  platform: "Azure DevOps · Contoso (prod)",
};

const ALL_EVENTS: LiveExecutionEvent[] = [
  { type: "confirm", payload },
  { type: "cancel" },
  { type: "proceed" },
  { type: "succeed" },
  { type: "fail", message: "boom" },
  { type: "reset" },
];

function otherEvents(handled: LiveExecutionEvent["type"][]): LiveExecutionEvent[] {
  return ALL_EVENTS.filter((event) => !handled.includes(event.type));
}

describe("transitionLiveExecution", () => {
  it("starts idle", () => {
    expect(initialLiveExecutionState).toEqual({ kind: "idle" });
  });

  describe("from idle", () => {
    it("confirm moves to confirming, carrying the payload", () => {
      const next = transitionLiveExecution({ kind: "idle" }, { type: "confirm", payload });
      expect(next).toEqual({ kind: "confirming", payload });
    });

    it("every other event is a no-op — idle never reaches executing directly", () => {
      for (const event of otherEvents(["confirm"])) {
        expect(transitionLiveExecution({ kind: "idle" }, event)).toEqual({ kind: "idle" });
      }
    });
  });

  describe("from confirming", () => {
    const confirming: LiveExecutionState = { kind: "confirming", payload };

    it("proceed moves to executing, carrying the same payload", () => {
      expect(transitionLiveExecution(confirming, { type: "proceed" })).toEqual({ kind: "executing", payload });
    });

    it("cancel returns to idle", () => {
      expect(transitionLiveExecution(confirming, { type: "cancel" })).toEqual({ kind: "idle" });
    });

    it("every other event is a no-op — confirming never reaches executing except via proceed", () => {
      for (const event of otherEvents(["proceed", "cancel"])) {
        expect(transitionLiveExecution(confirming, event)).toEqual(confirming);
      }
    });
  });

  describe("from executing", () => {
    const executing: LiveExecutionState = { kind: "executing", payload };

    it("succeed moves to done", () => {
      expect(transitionLiveExecution(executing, { type: "succeed" })).toEqual({ kind: "done", payload });
    });

    it("fail moves to error with the message", () => {
      expect(transitionLiveExecution(executing, { type: "fail", message: "network unreachable" })).toEqual({
        kind: "error",
        payload,
        message: "network unreachable",
      });
    });

    it("every other event is a no-op — an in-flight execution cannot be re-confirmed or re-entered", () => {
      for (const event of otherEvents(["succeed", "fail"])) {
        expect(transitionLiveExecution(executing, event)).toEqual(executing);
      }
    });
  });

  describe("from done", () => {
    const done: LiveExecutionState = { kind: "done", payload };

    it("reset returns to idle", () => {
      expect(transitionLiveExecution(done, { type: "reset" })).toEqual({ kind: "idle" });
    });

    it("every other event is a no-op", () => {
      for (const event of otherEvents(["reset"])) {
        expect(transitionLiveExecution(done, event)).toEqual(done);
      }
    });
  });

  describe("from error", () => {
    const errored: LiveExecutionState = { kind: "error", payload, message: "auth failed" };

    it("reset returns to idle, clearing the error message", () => {
      expect(transitionLiveExecution(errored, { type: "reset" })).toEqual({ kind: "idle" });
    });

    it("every other event is a no-op", () => {
      for (const event of otherEvents(["reset"])) {
        expect(transitionLiveExecution(errored, event)).toEqual(errored);
      }
    });
  });

  it("never produces executing from idle across any single event", () => {
    for (const event of ALL_EVENTS) {
      expect(transitionLiveExecution({ kind: "idle" }, event).kind).not.toBe("executing");
    }
  });
});
