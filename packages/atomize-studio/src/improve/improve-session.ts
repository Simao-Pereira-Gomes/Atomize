import type { TaskTemplate } from "@sppg2001/atomize-schema";
import { type Accessor, createSignal } from "solid-js";
import { SidecarRequestError } from "../sidecar/sidecar-client";
import { toAIDraftTemplate } from "../starting-paths/ai-draft";
import { createAIDraftLifecycle } from "../starting-paths/ai-draft-lifecycle";
import type { StoryRow } from "../stories/story-browser-model";

/** What the user chose for an improvement: guidance, and its Grounding (ADR-0069). */
export type ImproveChoices = {
  guidance: string;
  /** The Work Project to ground in; empty for no grounding. */
  profile: string;
  /** Stories the Template was applied to, to learn from; none keeps it to project metadata. */
  stories: StoryRow[];
  /** Sensitive AI Context, for this improvement only. */
  includeSensitive: boolean;
};

/** Where an "Improve with AI" request stands, from asking for guidance to reviewing the proposal. */
export type ImproveState =
  | { phase: "closed" }
  | { phase: "form"; choices: ImproveChoices; error?: string }
  | { phase: "running"; choices: ImproveChoices; streamed: number }
  | { phase: "cancelling"; choices: ImproveChoices }
  | { phase: "auth-error"; choices: ImproveChoices }
  | { phase: "grounding-error"; choices: ImproveChoices; message: string }
  | { phase: "review"; choices: ImproveChoices; base: TaskTemplate; proposal: TaskTemplate; notes: string[]; problems: string[] };

export interface ImproveProposal {
  template: TaskTemplate;
  notes: string[];
  /** Problems Copilot couldn't fix; the proposal stays editable, like an AI draft (ADR-0062). */
  problems: string[];
}

export type ImproveGrounding = { project?: unknown; stories?: unknown };

export interface ImproveSessionDeps {
  /** The Template currently in the Authoring Store, the baseline the proposal is compared with; throws while it's incomplete. */
  current: () => TaskTemplate;
  /** Replaces the Authoring Store's content with an accepted proposal. */
  apply: (template: TaskTemplate) => void;
  improve: (draftId: string, template: TaskTemplate, guidance: string, grounding?: ImproveGrounding) => Promise<unknown>;
  cancel: (draftId: string) => Promise<void>;
  /** Loads the chosen Work Project's metadata and, when Stories were chosen, their Story Grounding. */
  loadGrounding?: (choices: ImproveChoices) => Promise<ImproveGrounding>;
  /** Subscribes to streamed progress; resolves to an unsubscribe function. */
  listenProgress?: (onProgress: (progress: { draftId: string; length: number }) => void) => Promise<() => void>;
  createId?: () => string;
  /** The Work Project the form starts on, e.g. the one selected in Global Settings. */
  defaultProfile?: () => string;
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
 * (leaving it untouched). Nothing changes the Template before Accept. Grounding the user asked for
 * never disappears silently: a failure lets them retry or continue without it.
 */
export function createImproveSession(deps: ImproveSessionDeps) {
  const [state, setState] = createSignal<ImproveState>({ phase: "closed" });
  const lifecycle = createAIDraftLifecycle(deps.createId);
  let activeId = "";
  const choices = (): ImproveChoices => {
    const current = state();
    return current.phase === "closed"
      ? { guidance: "", profile: deps.defaultProfile?.() ?? "", stories: [], includeSensitive: false }
      : current.choices;
  };
  const updateForm = (change: Partial<ImproveChoices>) => {
    const current = state();
    if (current.phase === "form" || current.phase === "grounding-error") {
      setState({ phase: "form", choices: { ...current.choices, ...change } });
    }
  };

  const start = async (options: { ungrounded?: boolean } = {}) => {
    const chosen = choices();
    let base: TaskTemplate;
    try {
      base = deps.current();
    } catch {
      // Copilot improves a complete Template; an unfinished one is what AI draft is for.
      setState({ phase: "form", choices: chosen, error: "Finish the highlighted sections first. Improve with AI works on a complete Template." });
      return;
    }
    const id = lifecycle.begin();
    activeId = id;
    setState({ phase: "running", choices: chosen, streamed: 0 });
    const unlisten = await deps.listenProgress?.((progress) => {
      const current = state();
      if (progress.draftId === id && current.phase === "running") setState({ ...current, streamed: progress.length });
    });
    try {
      let grounding: ImproveGrounding | undefined;
      if (chosen.profile && !options.ungrounded && deps.loadGrounding) {
        try {
          grounding = await deps.loadGrounding(chosen);
        } catch (error) {
          if (lifecycle.isActive(id)) setState({ phase: "grounding-error", choices: chosen, message: error instanceof Error ? error.message : "We could not load the Work Project." });
          return;
        }
        if (!lifecycle.isActive(id)) return;
      }
      const proposal = parseImproveResponse(await deps.improve(id, base, chosen.guidance, grounding));
      if (!lifecycle.isActive(id)) return;
      setState({ phase: "review", choices: chosen, base, proposal: proposal.template, notes: proposal.notes, problems: proposal.problems });
    } catch (error) {
      if (!lifecycle.isActive(id)) return;
      const code = error instanceof SidecarRequestError ? error.code : "";
      if (code === "COPILOT_AUTH_REQUIRED") setState({ phase: "auth-error", choices: chosen });
      else if (code === "AI_DRAFT_CANCELLED") setState({ phase: "form", choices: chosen });
      else setState({ phase: "form", choices: chosen, error: error instanceof Error ? error.message : "Copilot could not improve this Template." });
    } finally {
      unlisten?.();
    }
  };

  const cancel = async () => {
    const chosen = choices();
    const id = activeId;
    lifecycle.cancel(id);
    activeId = "";
    setState({ phase: "cancelling", choices: chosen });
    try {
      if (id) await deps.cancel(id);
      setState({ phase: "form", choices: chosen });
    } catch (error) {
      setState({ phase: "form", choices: chosen, error: error instanceof Error ? error.message : "We could not cancel that request." });
    }
  };

  return {
    state: state as Accessor<ImproveState>,
    choices,
    open: () => setState({ phase: "form", choices: choices() }),
    close: () => setState({ phase: "closed" }),
    setGuidance: (guidance: string) => updateForm({ guidance }),
    /** Choosing another Work Project clears the Stories chosen from the previous one. */
    setProfile: (profile: string) => updateForm({ profile, stories: [], includeSensitive: false }),
    setStories: (stories: StoryRow[]) => updateForm({ stories, ...(stories.length === 0 ? { includeSensitive: false } : {}) }),
    setIncludeSensitive: (includeSensitive: boolean) => updateForm({ includeSensitive }),
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
