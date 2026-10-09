import { readFile, writeFile } from "node:fs/promises";
import { select, text } from "@clack/prompts";
import { type AITemplateSession, improveTemplate } from "@sppg2001/atomize-core/services/template/ai-template-loop";
import { MAX_ATTEMPTS } from "@sppg2001/atomize-core/services/template/llm-template-generator";
import { applyProposalToYaml, deriveImprovedCopy } from "@sppg2001/atomize-core/services/template/template-writeback";
import type { TaskTemplate } from "@sppg2001/atomize-core/templates/schema";
import type { TemplateLibrary } from "@sppg2001/atomize-core/templates/template-library";
import { verifyTemplate } from "@sppg2001/atomize-core/templates/template-verification";
import { CancellationError, ConfigurationError, getErrorMessage } from "@sppg2001/atomize-core/utils/errors";
import { diffTemplates, type TemplateDiff } from "@sppg2001/atomize-schema";
import chalk from "chalk";
import { Command } from "commander";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { createCommandOutput, resolveCommandOutputPolicy } from "@/cli/utilities/command-output";
import { ExitCode, ExitError } from "@/cli/utilities/exit-codes";
import { assertNotCancelled, createManagedSpinner, isInteractiveTerminal, sanitizeTty } from "@/cli/utilities/prompt-utilities";

export interface ImproveOptions {
  guidance?: string;
  saveAs?: string;
  overwrite?: boolean;
  dryRun?: boolean;
  strict?: boolean;
  output?: string;
  quiet?: boolean;
}

export type ImproveLibrary = Pick<TemplateLibrary, "loadSource" | "composeTemplate" | "getCatalog" | "saveTemplate" | "userTemplateExists">;

export interface ImproveDeps {
  library: ImproveLibrary;
  /** Opens a Copilot Session, signing in when needed. */
  openSession: () => Promise<AITemplateSession>;
  interactive: boolean;
}

/** What `--output` writes: everything needed to review or gate an improvement outside a terminal. */
export interface ImproveReport {
  template: string;
  ok: boolean;
  diff: TemplateDiff | null;
  validation: { valid: boolean; errors: string[]; warnings: string[] };
  notes: string[];
  guidance: string | null;
  groundingStoryIds: string[];
  sensitiveContextIncluded: boolean;
  saved: { action: "overwrite" | "save-as" | "draft"; path: string } | null;
}

type Saved = NonNullable<ImproveReport["saved"]>;

const output = createCommandOutput(resolveCommandOutputPolicy({}));

export const templateImproveCommand = new Command("improve")
  .description("Propose an AI improvement to an existing Template and review it before saving")
  .argument("<template>", "Template ref (template:<name>) or path to a YAML file")
  .option("--guidance <text>", "What the improvement should focus on, e.g. \"tighten the estimates\"")
  .option("--save-as <name>", "Save the improvement as a new Template instead of changing the source")
  .option("--overwrite", "Replace the source Template with the improvement without asking", false)
  .option("--dry-run", "Show the proposed changes without saving anything", false)
  .option("--strict", "Treat validation warnings as errors", false)
  .option("--output <file>", "Write a JSON report of the proposal, validation, and notes")
  .option("-q, --quiet", "Suppress non-essential output", false)
  .action(async (templateArg: string, options: ImproveOptions) => {
    try {
      const { TemplateLibrary } = await import("@sppg2001/atomize-core/templates/template-library");
      const report = await runTemplateImprove(templateArg, options, {
        library: new TemplateLibrary(),
        openSession: async () => {
          const { resolveAIProvider } = await import("@config/ai.config");
          const provider = resolveAIProvider();
          await provider.authenticate();
          return provider;
        },
        interactive: isInteractiveTerminal(),
      });
      if (!report.ok) process.exit(ExitCode.Failure);
    } catch (error) {
      if (error instanceof CancellationError) {
        output.cancel(error.message);
        process.exit(ExitCode.Success);
      }
      output.printError(chalk.red(sanitizeTty(getErrorMessage(error))));
      process.exit(error instanceof ExitError ? error.code : ExitCode.Failure);
    }
  });

/**
 * Proposes a Template Improvement and, only with the user's say-so, saves it: over the source
 * (`--overwrite` or a confirmation), as a new Template (`--save-as`), or not at all (`--dry-run`).
 */
export async function runTemplateImprove(templateArg: string, options: ImproveOptions, deps: ImproveDeps): Promise<ImproveReport> {
  const { library, interactive } = deps;
  const loaded = await library.loadSource(templateArg);
  const sourcePath = loaded.source.path;
  if (!sourcePath) {
    throw new ConfigurationError("Only a Template file or a Catalog Template can be improved. Download a remote Template first.");
  }
  const sourceText = await readFile(sourcePath, "utf8");
  const authored = parseYaml(sourceText) as TaskTemplate;
  const catalogRef = loaded.source.kind === "catalog" ? loaded.source.ref : undefined;
  const builtin = catalogRef ? await isBuiltin(library, sourcePath) : false;
  const label = catalogRef ?? sourcePath;

  const guidance = options.guidance?.trim() || (interactive ? await askGuidance() : "") || null;

  while (true) {
    const { result, notes } = await propose(deps, authored, loaded.template, guidance, sourcePath);
    const report: ImproveReport = {
      template: label,
      ok: false,
      diff: null,
      validation: { valid: result.ok, errors: result.ok ? [] : result.errors, warnings: [] },
      notes,
      guidance,
      groundingStoryIds: [],
      sensitiveContextIncluded: false,
      saved: null,
    };

    if (result.ok) {
      const verification = await verifyTemplate(await library.composeTemplate(result.template, sourcePath));
      const warnings = verification.warnings.map((w) => `${w.path}: ${w.message}`);
      const errors = [...verification.errors.map((e) => `${e.path}: ${e.message}`), ...(options.strict ? warnings : [])];
      report.validation = { valid: errors.length === 0, errors, warnings };
      report.diff = diffTemplates(authored, result.template);
    }

    showProposal(report);
    const proposal = result.ok ? result.template : (result.template as TaskTemplate | undefined);

    if (!report.validation.valid) {
      const next = interactive && !options.dryRun ? await askAfterInvalid(Boolean(proposal)) : "reject";
      if (next === "retry") continue;
      if (next === "draft" && proposal) report.saved = await saveDraft(proposal, sourcePath);
      return finish(report, options);
    }

    report.ok = true;
    const valid = proposal as TaskTemplate;
    if (report.diff?.identical) {
      output.info("Copilot proposed no changes.");
      return finish(report, options);
    }
    if (options.dryRun) return finish(report, options);

    report.saved = await save(valid, { options, interactive, library, sourcePath, sourceText, catalogRef, builtin });
    return finish(report, options);
  }
}

async function propose(deps: ImproveDeps, authored: TaskTemplate, resolved: TaskTemplate, guidance: string | null, sourcePath: string) {
  const session = await deps.openSession();
  const spinner = createManagedSpinner();
  spinner.start("Copilot is reviewing the Template…");
  let received = 0;
  try {
    const result = await improveTemplate(session, {
      template: authored,
      resolvedTemplate: resolved,
      guidance,
      compose: (proposal) => deps.library.composeTemplate(proposal, sourcePath),
    }, {
      onChunk: (chunk) => {
        received += chunk.length;
        spinner.message(`Copilot is reviewing the Template… (${received} characters)`);
      },
      onRepairStart: (attempt) => spinner.message(`Fixing validation problems (attempt ${attempt} of ${MAX_ATTEMPTS})…`),
    });
    spinner.stop(result.ok ? "Proposal ready" : "Copilot's proposal still has problems");
    return { result, notes: result.notes };
  } catch (error) {
    spinner.stop("Improvement failed");
    throw error;
  }
}

interface SaveContext {
  options: ImproveOptions;
  interactive: boolean;
  library: ImproveLibrary;
  sourcePath: string;
  sourceText: string;
  catalogRef: string | undefined;
  builtin: boolean;
}

async function save(proposal: TaskTemplate, ctx: SaveContext): Promise<Saved | null> {
  const { options, interactive } = ctx;
  if (options.saveAs) return saveAsNew(proposal, options.saveAs, ctx);
  if (options.overwrite) return overwriteSource(proposal, ctx);
  if (!interactive) {
    output.info("Nothing saved. Pass --overwrite to replace the source, or --save-as <name> to save a new Template.");
    return null;
  }

  while (true) {
    const choice = assertNotCancelled(
      await select({
        message: "What would you like to do with this improvement?",
        options: [
          ...(ctx.builtin ? [] : [{ label: "Save changes to the source Template", value: "overwrite" }]),
          { label: "Save as a new Template", value: "save-as" },
          { label: "View the full YAML", value: "yaml" },
          { label: "Reject", value: "reject" },
        ],
      }),
    ) as string;
    if (choice === "reject") return null;
    if (choice === "yaml") {
      output.print(chalk.gray(stringifyYaml(proposal)));
      continue;
    }
    if (choice === "save-as") {
      const name = assertNotCancelled(
        await text({
          message: "Name for the new Template:",
          initialValue: `${(ctx.catalogRef ?? "").replace(/^template:/, "") || "template"}-improved`,
          validate: (value): string | undefined => (value?.trim() ? undefined : "Enter a name"),
        }),
      );
      return saveAsNew(proposal, name.trim(), ctx);
    }
    return overwriteSource(proposal, ctx);
  }
}

async function overwriteSource(proposal: TaskTemplate, ctx: SaveContext): Promise<Saved> {
  if (ctx.builtin) {
    throw new ConfigurationError("Built-in Templates can't be changed. Use --save-as <name> to save the improvement as a new Template.");
  }
  await writeFile(ctx.sourcePath, applyProposalToYaml(ctx.sourceText, proposal), "utf8");
  output.success(`Saved the improvement to ${ctx.sourcePath}`);
  return { action: "overwrite", path: ctx.sourcePath };
}

async function saveAsNew(proposal: TaskTemplate, name: string, ctx: SaveContext): Promise<Saved> {
  const copy = deriveImprovedCopy(proposal, { catalogRef: ctx.catalogRef });
  if (await ctx.library.userTemplateExists("template", name)) {
    throw new ConfigurationError(`A Template named "${name}" already exists. Choose another name for --save-as.`);
  }
  const item = await ctx.library.saveTemplate({ kind: "template", name, template: copy });
  output.success(`Saved the improvement as template:${name} (${item.path})`);
  return { action: "save-as", path: item.path };
}

/** An invalid proposal is never saved into the Catalog; a draft is written beside the source for hand-fixing. */
async function saveDraft(proposal: TaskTemplate, sourcePath: string): Promise<Saved> {
  const path = `${sourcePath.replace(/(\.atomize)?\.ya?ml$/i, "")}.improved-draft.yaml`;
  await writeFile(path, stringifyYaml(proposal), "utf8");
  output.success(`Saved the draft to ${path}. Fix the problems above, then install or copy it.`);
  return { action: "draft", path };
}

async function finish(report: ImproveReport, options: ImproveOptions): Promise<ImproveReport> {
  if (options.output) {
    await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    output.info(`Report written to ${options.output}`);
  }
  return report;
}

async function askGuidance(): Promise<string> {
  const answer = assertNotCancelled(
    await text({
      message: "What should the improvement focus on? (Enter for a general review)",
      placeholder: "e.g. tighten the estimates, add security reviews",
    }),
  );
  return (answer ?? "").trim();
}

async function askAfterInvalid(hasProposal: boolean): Promise<"retry" | "draft" | "reject"> {
  return assertNotCancelled(
    await select({
      message: "The proposal isn't valid. What would you like to do?",
      options: [
        { label: "Retry", value: "retry" },
        ...(hasProposal ? [{ label: "Save as a draft file to fix by hand", value: "draft" }] : []),
        { label: "Reject", value: "reject" },
      ],
    }),
  ) as "retry" | "draft" | "reject";
}

async function isBuiltin(library: ImproveLibrary, path: string): Promise<boolean> {
  const { items } = await library.getCatalog("template");
  return items.some((item) => item.path === path && item.scope === "builtin");
}

function showProposal(report: ImproveReport): void {
  output.blankLine();
  if (report.diff && !report.diff.identical) {
    output.print(chalk.cyan("━━━ Proposed changes ━━━"));
    for (const line of describeDiff(report.diff)) output.print(line);
  }
  if (report.notes.length > 0) {
    output.print(chalk.cyan("\n━━━ Notes from Copilot ━━━"));
    for (const note of report.notes) output.print(`  • ${sanitizeTty(note)}`);
  }
  if (report.validation.errors.length > 0) {
    output.print(chalk.red("\n━━━ Validation problems ━━━"));
    for (const error of report.validation.errors) output.print(chalk.red(`  • ${sanitizeTty(error)}`));
  } else if (report.validation.warnings.length > 0) {
    output.print(chalk.yellow("\n━━━ Validation warnings ━━━"));
    for (const warning of report.validation.warnings) output.print(chalk.yellow(`  • ${sanitizeTty(warning)}`));
  }
  output.blankLine();
}

export function describeDiff(diff: TemplateDiff): string[] {
  const lines = diff.fieldChanges.map((change) => `  ~ ${change.path.join(".")}: ${show(change.before)} → ${show(change.after)}`);
  for (const task of diff.taskChanges) {
    const title = task.after?.title ?? task.before?.title ?? task.key;
    if (task.status === "added") lines.push(chalk.green(`  + Task "${title}"`));
    else if (task.status === "removed") lines.push(chalk.red(`  - Task "${title}"`));
    else {
      const moved = task.moved ? ` (moved ${task.moved.fromIndex + 1} → ${task.moved.toIndex + 1})` : "";
      lines.push(chalk.yellow(`  ~ Task "${title}"${moved}`));
      for (const field of task.fields) lines.push(`      ${field.path.join(".")}: ${show(field.before)} → ${show(field.after)}`);
    }
  }
  return lines.map(sanitizeTty);
}

function show(value: unknown): string {
  return value === undefined ? "(none)" : JSON.stringify(value);
}
