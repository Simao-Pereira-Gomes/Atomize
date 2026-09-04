import type { PreviewSource } from "./preview";

/** Which Stories a Generate Area run processes — see CONTEXT.md's "Generate Scope". */
export type GenerateScope = { kind: "stories"; storyIds: string[] } | { kind: "filter" };

export type LiveExecutionPayload = { template: PreviewSource; scope: GenerateScope; platform: string };

/**
 * Studio's Live Execution Confirmation gate — see CONTEXT.md's "Live Execution Confirmation".
 * Deliberately data-minimal: the dry-run report shown alongside `confirming` is caller-side
 * component state, not part of this machine, so its job stays scoped to gating `idle → executing`.
 */
export type LiveExecutionState =
  | { kind: "idle" }
  | { kind: "confirming"; payload: LiveExecutionPayload }
  | { kind: "executing"; payload: LiveExecutionPayload }
  | { kind: "done"; payload: LiveExecutionPayload }
  | { kind: "error"; payload: LiveExecutionPayload; message: string };

export type LiveExecutionEvent =
  | { type: "confirm"; payload: LiveExecutionPayload }
  | { type: "cancel" }
  | { type: "proceed" }
  | { type: "succeed" }
  | { type: "fail"; message: string }
  | { type: "reset" };

export const initialLiveExecutionState: LiveExecutionState = { kind: "idle" };

/**
 * Pure transition function. Any event not explicitly handled for the current state is a no-op —
 * that fallthrough is what guarantees there is no path from `idle` or `confirming` straight to
 * `executing` other than `confirming`'s `proceed` event.
 */
export function transitionLiveExecution(state: LiveExecutionState, event: LiveExecutionEvent): LiveExecutionState {
  switch (state.kind) {
    case "idle":
      if (event.type === "confirm") return { kind: "confirming", payload: event.payload };
      return state;
    case "confirming":
      if (event.type === "proceed") return { kind: "executing", payload: state.payload };
      if (event.type === "cancel") return { kind: "idle" };
      return state;
    case "executing":
      if (event.type === "succeed") return { kind: "done", payload: state.payload };
      if (event.type === "fail") return { kind: "error", payload: state.payload, message: event.message };
      return state;
    case "done":
    case "error":
      if (event.type === "reset") return { kind: "idle" };
      return state;
    default:
      return state;
  }
}
