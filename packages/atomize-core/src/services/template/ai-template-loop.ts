import { parse as parseYaml } from "yaml";
import type { TaskTemplate } from "../../templates/schema";
import { CancellationError } from "../../utils/errors";
import {
  buildSystemPrompt,
  buildUserPrompt,
  MAX_ATTEMPTS,
  parseAndValidate,
} from "./llm-template-generator";
import type { ProjectGrounding } from "./project-grounding";

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
  const systemPrompt = buildSystemPrompt();
  let errors: string[] = [];
  let rawOutput = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    throwIfCancelled(options.signal);
    const projectGrounding = request.projectGrounding ? JSON.stringify(request.projectGrounding) : null;
    const userPrompt = buildUserPrompt(request.prose, projectGrounding, errors.length > 0 ? errors : undefined);

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

    const parsed = parseAndValidate(rawOutput);
    if (parsed.ok) return { ok: true, template: parsed.template, attempts: attempt };

    errors = parsed.errors;
    if (attempt < MAX_ATTEMPTS) options.onAttemptInvalid?.(attempt, errors);
  }

  const template = parseTemplateShaped(rawOutput);
  return { ok: false, attempts: MAX_ATTEMPTS, rawOutput, errors, ...(template ? { template } : {}) };
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new CancellationError("AI draft cancelled");
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
