import { stringify } from "yaml";
import type { TaskDefinition, TaskTemplate } from "../../templates/schema";
import { buildProjectGroundingSection, buildReferenceDocumentsSection } from "./llm-template-generator";
import { type ProjectGrounding, projectGroundingForPrompt } from "./project-grounding";
import type { DocumentGrounding } from "./reference-documents";

/** The top-level key a Template Improvement's notes travel under in the model's YAML. */
export const IMPROVEMENT_NOTES_KEY = "improvementNotes";
const MAX_NOTES = 12;

/** What the AI needs to propose a Template Improvement (see CONTEXT.md). */
export interface ImproveRequest {
  /** The Template as authored: the only content the improvement may change. */
  template: TaskTemplate;
  /** The Template with its `extends` and Mixins applied, so the AI judges what actually generates Tasks. */
  resolvedTemplate: TaskTemplate;
  /** Optional prose steering the improvement, e.g. "focus on estimates". */
  guidance?: string | null;
  projectGrounding?: ProjectGrounding | null;
  /** The team's Reference Documents, fitted to the limit. */
  documentGrounding?: DocumentGrounding | null;
  /** Composes a proposal with its parent and Mixins so it's validated as it will run; omit for a plain Template. */
  compose?: (proposal: Record<string, unknown>) => Promise<TaskTemplate>;
}

export function isComposedTemplate(template: TaskTemplate): boolean {
  return Boolean(template.extends) || (template.mixins?.length ?? 0) > 0;
}

export function buildImprovePrompt(request: ImproveRequest, prevErrors?: string[]): string {
  const sections = [
    "Improve this existing Atomize task template. Return the complete revised template as YAML, following every rule above.",
    "Look for clearer task titles and descriptions, estimation percentages that fit the work, missing test, review, or documentation tasks, and useful conditions, filters, custom fields, dependencies, and acceptance criteria. Keep what already works: don't change things just to change them.",
    "Keep the template's allocation: when its estimationPercent values, or the reference documents, add up to more than 100, that's intended, so don't scale them down to 100 unless the user's focus explicitly asks for the percentages to add up to 100 or to be normalized.",
  ];

  const guidance = request.guidance?.trim();
  if (guidance) sections.push(`The user wants this improvement to focus on:\n${guidance}`);

  sections.push(`Template to improve:\n${stringify(request.template)}`);

  if (isComposedTemplate(request.template)) {
    sections.push(
      `This template inherits from a parent Template or Mixins (extends/mixins). Its fully composed form is below, for context only:\n${stringify(request.resolvedTemplate)}\n` +
        "Tasks that appear only in the composed form are inherited. Never copy them into the template's own tasks, and never change extends, mixins, or origin. If an inherited task deserves a change, say so in improvementNotes instead.",
    );
  }

  if (request.documentGrounding?.documents.length) sections.push(buildReferenceDocumentsSection(request.documentGrounding.documents));

  if (request.projectGrounding) sections.push(buildProjectGroundingSection(projectGroundingForPrompt(request.projectGrounding).text).trim());

  sections.push(
    `Also add a top-level key "${IMPROVEMENT_NOTES_KEY}": a list of short notes (at most 8) saying what you changed and why, plus any advice about inherited tasks.`,
  );

  if (prevErrors && prevErrors.length > 0) {
    sections.push(`Your previous attempt failed validation. Fix these errors and try again:\n${prevErrors.map((e) => `- ${e}`).join("\n")}`);
  }

  return sections.join("\n\n");
}

/** Removes the model's notes from its proposal, so only Template fields remain to validate. */
export function takeImprovementNotes(proposal: Record<string, unknown>): { proposal: Record<string, unknown>; notes: string[] } {
  const { [IMPROVEMENT_NOTES_KEY]: raw, ...rest } = proposal;
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? [raw] : [];
  const notes = list
    .map((note) => (typeof note === "string" ? note : JSON.stringify(note)).trim())
    .filter(Boolean)
    .slice(0, MAX_NOTES);
  return { proposal: rest, notes };
}

/**
 * Enforces that an improvement never rewrites inheritance: `extends`, `mixins`, and `origin` come
 * back exactly as in the source, and Tasks copied in from the parent or a Mixin are left out with a
 * note pointing the user at where to change them.
 */
export function protectInheritance(
  proposal: Record<string, unknown>,
  source: TaskTemplate,
  resolved: TaskTemplate,
): { proposal: Record<string, unknown>; notes: string[] } {
  const { extends: _extends, mixins: _mixins, origin: _origin, ...rest } = proposal;
  const protectedProposal: Record<string, unknown> = {
    ...rest,
    ...(source.extends !== undefined ? { extends: source.extends } : {}),
    ...(source.mixins !== undefined ? { mixins: source.mixins } : {}),
    ...(source.origin !== undefined ? { origin: source.origin } : {}),
  };
  if (!isComposedTemplate(source) || !Array.isArray(proposal.tasks)) return { proposal: protectedProposal, notes: [] };

  const ownKeys = new Set((source.tasks ?? []).map(taskKey));
  const inheritedKeys = new Set(resolved.tasks.map(taskKey).filter((key) => !ownKeys.has(key)));
  const notes: string[] = [];
  protectedProposal.tasks = proposal.tasks.filter((task) => {
    if (!isTask(task) || !inheritedKeys.has(taskKey(task))) return true;
    notes.push(`Left "${task.title}" alone: it comes from the parent Template or a Mixin. Change it there if it needs improving.`);
    return false;
  });
  return { proposal: protectedProposal, notes };
}

function isTask(value: unknown): value is TaskDefinition {
  return typeof value === "object" && value !== null && typeof (value as TaskDefinition).title === "string";
}

function taskKey(task: TaskDefinition): string {
  return task.id ? `id:${task.id}` : `title:${task.title.trim().toLowerCase()}`;
}
