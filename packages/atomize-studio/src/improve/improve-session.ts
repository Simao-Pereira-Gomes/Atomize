import type { TaskTemplate } from "@sppg2001/atomize-schema";
import { type Accessor, createSignal } from "solid-js";
import { SidecarRequestError } from "../sidecar/sidecar-client";
import { toAIDraftTemplate } from "../starting-paths/ai-draft";
import { createAIDraftLifecycle } from "../starting-paths/ai-draft-lifecycle";

/** Where an "Improve with AI" request stands, from asking for guidance to reviewing the proposal. */
export type ImproveState =
  | { phase: "closed" }
  | { phase: "form"; guidance: string; error?: string }
  | { phase: "running"; guidance: string; streamed: number }
  | { phase: "cancelling"; guidance: string }
  | { phase: "auth-error"; guidance: string }
  | { phase: "review"; guidance: string; base: TaskTemplate; proposal: TaskTemplate; notes: string[]; problems: string[] };

export interface ImproveProposal {
  template: TaskTemplate;
  notes: string[];
  /** Problems Copilot couldn't fix; the proposal stays editable, like an AI draft (ADR-0062). */
  problems: string[];
}

export interface ImproveSessionDeps {
  /** The Template currently in the Authoring Store, the baseline the proposal is compared with; throws while it's incomplete. */
  current: () => TaskTemplate;
  /** Replaces the Authoring Store's content with an accepted proposal. */
  apply: (template: TaskTemplate) => void;
  improve: (draftId: string, template: TaskTemplate, guidance: string) => Promise<unknown>;
  cancel: (draftId: string) => Promise<void>;
  /** Subscribes to streamed progress; resolves to an unsubscribe function. */
  listenProgress?: (onProgress: (progress: { draftId: string; length: number }) => void) => Promise<() => void>;
  createId?: () => string;
}

export function parseImproveResponse(value: unknown): ImproveProposal {
  const response = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  if (!("template" in response)) throw new Error("The improvement response did not contain a Template.");
  const strings = (list: unknown) => (Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : []);
  return { template: toAIDraftTemplate(response.template), notes: strings(response.notes), problems: strings(response.errors) };
}

/**
 * Drives "Improve with AI" for whatever Template is in the Authoring Store, however it got there:
 * the proposal is reviewed as a whole, then accepted (replacing the authoring state) or rejected
 * (leaving it untouched). Nothing changes the Template before Accept.
 */
export function createImproveSession(deps: ImproveSessionDeps): {
  state: Accessor<ImproveState>;
  open: () => void;
  close: () => void;
  setGuidance: (guidance: string) => void;
  start: () => Promise<void>;
  cancel: () => Promise<void>;
  accept: () => void;
  reject: () => void;
} {
  const [state, setState] = createSignal<ImproveState>({ phase: "closed" });
  const lifecycle = createAIDraftLifecycle(deps.createId);
  let activeId = "";
  const guidance = () => {
    const current = state();
    return current.phase === "closed" ? "" : current.guidance;
  };

  const start = async () => {
    let base: TaskTemplate;
    try {
      base = deps.current();
    } catch {
      // Copilot improves a complete Template; an unfinished one is what AI draft is for.
      setState({ phase: "form", guidance: guidance(), error: "Finish the highlighted sections first. Improve with AI works on a complete Template." });
      return;
    }
    const id = lifecycle.begin();
    activeId = id;
    const text = guidance();
    setState({ phase: "running", guidance: text, streamed: 0 });
    const unlisten = await deps.listenProgress?.((progress) => {
      const current = state();
      if (progress.draftId === id && current.phase === "running") setState({ ...current, streamed: progress.length });
    });
    try {
      const proposal = parseImproveResponse(await deps.improve(id, base, text));
      if (!lifecycle.isActive(id)) return;
      setState({ phase: "review", guidance: text, base, proposal: proposal.template, notes: proposal.notes, problems: proposal.problems });
    } catch (error) {
      if (!lifecycle.isActive(id)) return;
      const code = error instanceof SidecarRequestError ? error.code : "";
      if (code === "COPILOT_AUTH_REQUIRED") setState({ phase: "auth-error", guidance: text });
      else if (code === "AI_DRAFT_CANCELLED") setState({ phase: "form", guidance: text });
      else setState({ phase: "form", guidance: text, error: error instanceof Error ? error.message : "Copilot could not improve this Template." });
    } finally {
      unlisten?.();
    }
  };

  const cancel = async () => {
    const text = guidance();
    const id = activeId;
    lifecycle.cancel(id);
    activeId = "";
    setState({ phase: "cancelling", guidance: text });
    try {
      if (id) await deps.cancel(id);
      setState({ phase: "form", guidance: text });
    } catch (error) {
      setState({ phase: "form", guidance: text, error: error instanceof Error ? error.message : "We could not cancel that request." });
    }
  };

  return {
    state,
    open: () => setState({ phase: "form", guidance: "" }),
    close: () => setState({ phase: "closed" }),
    setGuidance: (text) => {
      const current = state();
      if (current.phase === "form") setState({ ...current, guidance: text, error: undefined });
    },
    start,
    cancel,
    accept: () => {
      const current = state();
      if (current.phase !== "review") return;
      deps.apply(current.proposal);
      setState({ phase: "closed" });
    },
    reject: () => setState({ phase: "closed" }),
  };
}
