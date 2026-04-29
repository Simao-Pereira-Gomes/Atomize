import type { TaskTemplate } from "@templates/schema";
import { TemplateValidator } from "@templates/validator";
import { LLMGenerationError } from "@utils/errors";
import { parse as parseYaml } from "yaml";

const MAX_ATTEMPTS = 3;

const SYSTEM_PROMPT = `You are an expert at creating Atomize task templates in YAML format.
Atomize templates define reusable sets of tasks to be created automatically for Azure DevOps work items.

OUTPUT RULES (critical):
- Respond with valid YAML only. No prose, no markdown fences, no explanations.
- Do not wrap output in backticks or code blocks.

SCHEMA:

version: "1.0"          # required, always "1.0"
name: string            # required, clear descriptive name
description: string     # optional
author: string          # optional
tags: string[]          # optional

extends: string         # optional — inherit from a template reference (e.g. "template:backend-api") or a file path (e.g. "./base.yaml").
                        # All fields from the parent template are inherited; fields set here override the parent.
                        # Tasks are merged by id: a task with a matching id replaces the parent task; new tasks are appended.
mixins: string[]        # optional — list of mixin references or file paths (e.g. ["mixin:security"] or ["./mixins/security.yaml"]).
                        # Mixins contribute tasks only. Child tasks override mixin tasks with the same id.
                        # Template names are NOT valid mixin sources.

filter:                 # required (unless inherited via extends)
  workItemTypes: string[]         # e.g. ["User Story"], ["Bug"]
  states: string[]                # e.g. ["New", "Active", "Approved"] — items must be in one of these states
  statesExclude: string[]         # optional: skip items currently in these states
  statesWereEver: string[]        # optional: skip items that were EVER in these states (distinct from statesExclude)
  team: string                    # optional: override the profile's default team, e.g. "Onboard Team"
  tags:
    include: string[]             # optional
    exclude: string[]             # optional
  areaPaths: string[]             # optional, or ["@TeamAreas"]
  iterations: string[]            # optional, e.g. ["@CurrentIteration"] or explicit iteration paths
  priority:                       # optional: filter by ADO priority field
    min: number                   # inclusive lower bound (1 = highest priority)
    max: number                   # inclusive upper bound
  excludeIfHasTasks: boolean      # default true — skip items that already have tasks

tasks:                  # required, minimum 1 item
  - title: string       # required
    description: string # optional
    estimationPercent: number     # 0-100; default estimation for this task
    estimationPercentCondition:   # optional — override estimationPercent when a condition is true
      - condition:                #   same condition syntax as task-level condition below
          field: string           #   standard field, OR use customField for "Namespace.FieldName" fields
          operator: string
          value: string | number
        percent: number           #   replaces estimationPercent when condition matches
    activity: string    # optional; prefer standard values: "Design", "Development", "Testing", "Test", "Documentation", "Requirements"; use the user's exact wording if they specify something different
    tags: string[]      # optional
    id: string          # optional, required if this task is referenced in dependsOn
    dependsOn: string[] # optional, references other task ids
    condition:          # optional — skip this task entirely when condition is false
      # Standard ADO fields (tags, Priority, State, etc.):
      field: string     # e.g. "tags", "Priority", "State"
      operator: string  # equals | not-equals | contains | not-contains | gt | lt | gte | lte
      value: string | number
      # Custom ADO fields in "Namespace.FieldName" format — use customField, NOT field:
      customField: string   # e.g. "Custom.DataClassification", "Custom.ClientTier"
      operator: string
      value: string | number
      # Compound forms (use instead of field/customField/operator/value):
      all: condition[]  # ALL clauses must match (AND)
      any: condition[]  # ANY clause must match (OR)
    priority: number    # optional ADO priority
    assignTo: string    # optional: "@ParentAssignee" | "@Unassigned" | "@Me" | display name
    acceptanceCriteria: string[]  # optional

estimation:             # optional
  strategy: "percentage"
  rounding: "nearest" | "up" | "down" | "none"   # default "none" — omit unless the user asks for rounding
  minimumTaskPoints: number   # optional, default 0

validation:             # optional
  minTasks: number
  maxTasks: number
  totalEstimationMustBe: number   # usually 100
  totalEstimationRange:
    min: number
    max: number

metadata:               # optional
  category: string
  difficulty: "beginner" | "intermediate" | "advanced"
  recommendedFor: string[]
  estimationGuidelines: string

CONSTRAINTS (you must follow these):
1. Estimation sums:
   - Simple templates (no task-level conditions): estimationPercent values MUST sum to exactly 100.
   - Multi-archetype templates (tasks use conditions to target different story types): each archetype's active task set should sum to ~100% independently. The total across all declared tasks will naturally exceed 100 — this is expected and valid.
2. If a task uses dependsOn, all referenced IDs must exist on other tasks in the same template.
3. workItemTypes values are case-sensitive strings matching ADO work item types.
4. condition operators must be one of: equals, not-equals, contains, not-contains, gt, lt, gte, lte.
   Use field for standard ADO fields (tags, Priority, State, AssignedTo, etc.).
   Use customField for any field in "Namespace.FieldName" format (e.g. "Custom.DataClassification"). NEVER use field for these — it will silently fail at runtime.
5. Do not invent fields not listed above.
6. A task that uses dependsOn MUST also have an id field set.
7. TASK DUPLICATION vs CONDITIONAL ESTIMATION — this is the most common mistake, follow this rule strictly:
   - Use task-level condition (with or without duplication) ONLY when a task should be ABSENT entirely in some scenarios.
   - Use estimationPercentCondition on a SINGLE task definition when the task EXISTS in all scenarios but should carry a DIFFERENT estimation weight in some of them.
   - NEVER duplicate a task (same title, different condition) just to give it a different estimationPercent — that is always wrong. Use one task entry with estimationPercentCondition instead.
   - Example of the wrong pattern:
       - title: "Investigation"
         estimationPercent: 20
         condition: { field: priority, operator: gt, value: 2 }
       - title: "Investigation"      # WRONG — duplicate title
         estimationPercent: 35
         condition: { field: priority, operator: lte, value: 2 }
   - Example of the correct pattern:
       - title: "Investigation"
         estimationPercent: 20       # default (normal bugs)
         estimationPercentCondition:
           - condition: { field: priority, operator: lte, value: 2 }
             percent: 35             # override for critical bugs (priority 1 or 2)

EXAMPLES:

Example 1 — Backend API feature:
version: "1.0"
name: "Backend API Development"
description: "Standard backend API development with database integration"
author: "Atomize"
tags: ["backend", "api"]
filter:
  workItemTypes: ["User Story"]
  states: ["New", "Active"]
  excludeIfHasTasks: true
tasks:
  - title: "Design API Endpoints: \${story.title}"
    estimationPercent: 15
    activity: "Design"
  - title: "Database Schema: \${story.title}"
    estimationPercent: 15
    activity: "Design"
  - title: "Implement Core Logic: \${story.title}"
    estimationPercent: 40
    activity: "Development"
  - title: "Write Unit Tests"
    estimationPercent: 20
    activity: "Testing"
  - title: "Code Review & Refinement"
    estimationPercent: 10
    activity: "Documentation"
estimation:
  strategy: "percentage"
metadata:
  category: "Backend"
  difficulty: "intermediate"

Example 2 — Bug fix:
version: "1.0"
name: "Bug Fix"
description: "Standard bug investigation and resolution workflow"
filter:
  workItemTypes: ["Bug"]
  states: ["New", "Active"]
  excludeIfHasTasks: true
tasks:
  - title: "Investigate & Reproduce: \${story.title}"
    estimationPercent: 30
    activity: "Development"
  - title: "Implement Fix: \${story.title}"
    estimationPercent: 40
    activity: "Development"
  - title: "Test & Verify"
    estimationPercent: 20
    activity: "Testing"
  - title: "Review & Deploy"
    estimationPercent: 10
    activity: "Documentation"
estimation:
  strategy: "percentage"
metadata:
  category: "Maintenance"
  difficulty: "beginner"

Example 3 — Multi-archetype with conditional tasks and conditional estimation:
version: "1.0"
name: "Agile Dev & Test Story"
description: "Single template covering dev-only, test-only, and mixed dev+test stories using conditional tasks and conditional estimation."
filter:
  workItemTypes: ["User Story"]
  states: ["Ready for Sprint"]
  excludeIfHasTasks: true
tasks:
  - title: "Analysis & Design"
    estimationPercent: 30
    activity: "Development"
    assignTo: "@ParentAssignee"
    condition:
      all:
        - field: tags
          operator: not-contains
          value: "Test Only"
        - field: tags
          operator: not-contains
          value: "Testing Only"
  - title: "Build & Review"
    estimationPercent: 70
    activity: "Development"
    assignTo: "@ParentAssignee"
    condition:
      all:
        - field: tags
          operator: not-contains
          value: "Test Only"
        - field: tags
          operator: not-contains
          value: "Testing Only"
  - title: "Test Preparation"
    estimationPercent: 60
    estimationPercentCondition:
      - condition:
          any:
            - field: tags
              operator: contains
              value: "Test Only"
            - field: tags
              operator: contains
              value: "Testing Only"
        percent: 70
    activity: "Testing"
    assignTo: "@Unassigned"
    condition:
      field: tags
      operator: not-contains
      value: "Dev Only"
  - title: "Test Execution"
    estimationPercent: 40
    estimationPercentCondition:
      - condition:
          any:
            - field: tags
              operator: contains
              value: "Test Only"
            - field: tags
              operator: contains
              value: "Testing Only"
        percent: 30
    activity: "Testing"
    assignTo: "@Unassigned"
    condition:
      field: tags
      operator: not-contains
      value: "Dev Only"
estimation:
  strategy: "percentage"
  rounding: "none"
metadata:
  category: "Agile"
  difficulty: "advanced"
  estimationGuidelines: |
    Three archetypes in one template:
    - Mixed story (no special tag): dev tasks fire (30+70=100%) and test tasks fire (60+40=100%).
    - Test Only / Testing Only: dev tasks are skipped; test estimation shifts to 70/30 via estimationPercentCondition.
    - Dev Only: test tasks are skipped; dev tasks sum to 100%.

Example 4 — Custom ADO field in conditions (customField vs field):
version: "1.0"
name: "Compliance-Gated Feature"
description: "Adds a compliance review task for stories classified as Restricted or Confidential."
filter:
  workItemTypes: ["User Story"]
  states: ["New", "Active"]
  excludeIfHasTasks: true
tasks:
  - title: "Implementation"
    estimationPercent: 80
    activity: "Development"
    assignTo: "@ParentAssignee"
  - title: "Testing"
    estimationPercent: 20
    activity: "Testing"
    assignTo: "@Unassigned"
  - title: "Compliance Review"
    estimationPercent: 0
    activity: "Design"
    assignTo: "@Unassigned"
    customFields:
      Custom.ComplianceReviewed: false
    condition:
      any:
        - customField: "Custom.DataClassification"
          operator: equals
          value: "Restricted"
        - customField: "Custom.DataClassification"
          operator: equals
          value: "Confidential"
estimation:
  strategy: "percentage"
metadata:
  category: "Feature"
  difficulty: "intermediate"

Example 5 — Extending a template (inheritance):
extends: "template:backend-api"
name: "Backend API + Security Review"
description: "Standard backend API template with an added security review task."
tasks:
  - id: "security-review"
    title: "Security Review: \${story.title}"
    description: "Review implementation for security vulnerabilities before merge."
    estimationPercent: 10
    activity: "Design"

Example 6 — Minimal child that inherits most from base (inheritance):
extends: "./base-feature.yaml"
name: "Mobile Feature"
description: "Feature template tailored for the mobile team."
filter:
  workItemTypes: ["User Story"]
  states: ["Active"]
  tags:
    include: ["mobile"]
tasks:
  - id: "implement"
    title: "Implement (Mobile): \${story.title}"
    estimationPercent: 60`;

export function buildSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

export function buildUserPrompt(
  description: string,
  groundingContext?: string | null,
  prevErrors?: string[],
): string {
  let prompt = `Generate an Atomize task template for the following:\n\n${description}`;

  if (groundingContext) {
    prompt += `\n\n---\nObserved patterns from this user's Azure DevOps workspace:\n${groundingContext}\n\nUse these patterns as concrete examples when choosing task names, estimation percentages, and conditions. Adapt them to fit the description above — do not copy verbatim.\n---`;
  }

  if (prevErrors && prevErrors.length > 0) {
    prompt += `\n\n---\nPrevious attempt failed validation. Fix these errors and try again:\n${prevErrors.map((e) => `- ${e}`).join("\n")}\n---`;
  }

  return prompt;
}

export function parseAndValidate(
  raw: string,
): { ok: true; template: TaskTemplate } | { ok: false; errors: string[] } {
  const cleaned = raw
    .replace(/^```ya?ml\n?/i, "")
    .replace(/\n?```\s*$/, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = parseYaml(cleaned);
  } catch (e) {
    return {
      ok: false,
      errors: [`Output is not valid YAML: ${e instanceof Error ? e.message : String(e)}`],
    };
  }

  if (!parsed || typeof parsed !== "object") {
    return { ok: false, errors: ["Output did not parse to a YAML object"] };
  }

  const validator = new TemplateValidator();
  const result = validator.validate(parsed as TaskTemplate);

  if (!result.valid) {
    return {
      ok: false,
      errors: result.errors.map((e) => `${e.path}: ${e.message}`),
    };
  }

  return { ok: true, template: parsed as TaskTemplate };
}

export { LLMGenerationError, MAX_ATTEMPTS };
