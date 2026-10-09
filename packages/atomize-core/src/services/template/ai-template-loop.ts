import { parse as parseYaml } from "yaml";
import type { TaskTemplate } from "../../templates/schema";
import { CancellationError } from "../../utils/errors";
import {
  buildSystemPrompt,
  buildUserPrompt,
  MAX_ATTEMPTS,
  parseAndValidate,
  parseTemplateOutput,
  type TemplateCheck,
  validateTemplateObject,
} from "./llm-template-generator";
import type { ProjectGrounding } from "./project-grounding";
import type { StoryGrounding } from "./story-grounding";
import {
  buildImprovePrompt,
  type ImproveRequest,
  protectInheritance,
  takeImprovementNotes,
} from "./template-improvement";

/**
 * The part of a Copilot Session the AI Template Loop needs. Deliberately structural so
 * atomize-core never depends on a model runtime: atomize-ai's Copilot SDK sessions and
 * the VS Code extension's `vscode.lm` adapter both satisfy it as they are.
 */
export interface AITemplateSession {
  generate(systemPrompt: string, userPrompt: string): Promise<string>;
  /** When present, the first attempt streams through it for live progress. */
  stream?(systemPrompt: string, userPrompt: string): AsyncIterable<string>;
}

export interface DraftRequest {
  prose: string;
  projectGrounding?: ProjectGrounding | null;
  /** Example Stories the user picked, showing the team's conventions (ADR-0069). */
  storyGrounding?: StoryGrounding | null;
}

export interface AITemplateLoopOptions {
  /** Cancels the loop; the caller remains responsible for aborting the session itself. */
  signal?: AbortSignal;
  /** Receives each streamed chunk of the first attempt. */
  onChunk?: (chunk: string) => void;
  /** Called when an attempt's output fails validation, before any repair attempt starts. */
  onAttemptInvalid?: (attempt: number, errors: string[]) => void;
  /** Called as a repair attempt (attempt 2 onwards) starts. */
  onRepairStart?: (attempt: number) => void;
  /** Called with a repair attempt's raw output once it arrives. */
  onRepairOutput?: (attempt: number, rawOutput: string) => void;
}

export type AITemplateLoopResult =
  | { ok: true; template: TaskTemplate; attempts: number }
  | {
      ok: false;
      attempts: number;
      rawOutput: string;
      errors: string[];
      /** The last output when it was at least Template-shaped, so a surface can keep it editable. */
      template?: Record<string, unknown>;
    };

export async function draftTemplate(
  session: AITemplateSession,
  request: DraftRequest,
  options: AITemplateLoopOptions = {},
): Promise<AITemplateLoopResult> {
  const projectGrounding = request.projectGrounding ? JSON.stringify(request.projectGrounding) : null;
  const exampleStories = request.storyGrounding?.stories.length ? JSON.stringify(request.storyGrounding.stories) : null;
  const { result } = await runAttempts(session, {
    userPrompt: (errors) => buildUserPrompt(request.prose, projectGrounding, errors, exampleStories),
    interpret: async (rawOutput) => ({ check: parseAndValidate(rawOutput), notes: [] }),
    shaped: parseTemplateShaped,
  }, options);
  return result;
}

/** A Template Improvement: the proposal (or the last failed attempt) plus the AI's notes. */
export type ImproveResult = AITemplateLoopResult & { notes: string[] };

/**
 * Proposes a Template Improvement. The proposal is judged against the Resolved Template, validated
 * as it will run (composed with its parent and Mixins), and never rewrites `extends`, `mixins`,
 * `origin`, or inherited Tasks, whatever the model returns.
 */
export async function improveTemplate(
  session: AITemplateSession,
  request: ImproveRequest,
  options: AITemplateLoopOptions = {},
): Promise<ImproveResult> {
  const prepare = (value: Record<string, unknown>) => {
    const { proposal, notes } = takeImprovementNotes(value);
    const guarded = protectInheritance(proposal, request.template, request.resolvedTemplate);
    return { proposal: guarded.proposal, notes: [...notes, ...guarded.notes] };
  };

  const { result, notes } = await runAttempts(session, {
    userPrompt: (errors) => buildImprovePrompt(request, errors),
    interpret: async (rawOutput) => {
      const parsed = parseTemplateOutput(rawOutput);
      if (!parsed.ok) return { check: parsed, notes: [] };
      const { proposal, notes } = prepare(parsed.value);
      const composed = request.compose ? await request.compose(proposal) : proposal;
      const check = validateTemplateObject(composed as Record<string, unknown>);
      return { check: check.ok ? { ok: true, template: proposal as unknown as TaskTemplate } : check, notes };
    },
    shaped: (rawOutput) => {
      const parsed = parseTemplateShaped(rawOutput);
      return parsed ? prepare(parsed).proposal : undefined;
    },
  }, options);
  return { ...result, notes };
}

interface AttemptPlan {
  userPrompt: (prevErrors: string[] | undefined) => string;
  interpret: (rawOutput: string) => Promise<{ check: TemplateCheck; notes: string[] }>;
  /** The last output as an editable Template-shaped object, when it is one. */
  shaped: (rawOutput: string) => Record<string, unknown> | undefined;
}

async function runAttempts(
  session: AITemplateSession,
  plan: AttemptPlan,
  options: AITemplateLoopOptions,
): Promise<{ result: AITemplateLoopResult; notes: string[] }> {
  const systemPrompt = buildSystemPrompt();
  let errors: string[] = [];
  let notes: string[] = [];
  let rawOutput = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    throwIfCancelled(options.signal);
    const userPrompt = plan.userPrompt(errors.length > 0 ? errors : undefined);

    // Only the first attempt streams: repairs are rare, and their progress isn't worth a second subscription.
    if (attempt === 1 && session.stream) {
      rawOutput = "";
      for await (const chunk of session.stream(systemPrompt, userPrompt)) {
        throwIfCancelled(options.signal);
        rawOutput += chunk;
        options.onChunk?.(chunk);
      }
    } else {
      if (attempt > 1) options.onRepairStart?.(attempt);
      rawOutput = await session.generate(systemPrompt, userPrompt);
      throwIfCancelled(options.signal);
      if (attempt > 1) options.onRepairOutput?.(attempt, rawOutput);
    }

    const interpreted = await plan.interpret(rawOutput);
    notes = interpreted.notes;
    if (interpreted.check.ok) return { result: { ok: true, template: interpreted.check.template, attempts: attempt }, notes };

    errors = interpreted.check.errors;
    if (attempt < MAX_ATTEMPTS) options.onAttemptInvalid?.(attempt, errors);
  }

  const template = plan.shaped(rawOutput);
  return { result: { ok: false, attempts: MAX_ATTEMPTS, rawOutput, errors, ...(template ? { template } : {}) }, notes };
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new CancellationError("AI request cancelled");
}

function parseTemplateShaped(rawOutput: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = parseYaml(rawOutput.replace(/^```ya?ml\n?/i, "").replace(/\n?```\s*$/, "").trim());
    return isTemplateShaped(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isTemplateShaped(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.version === "string"
    && typeof record.name === "string"
    && Array.isArray(record.tasks)
    && typeof record.filter === "object"
    && record.filter !== null;
}
