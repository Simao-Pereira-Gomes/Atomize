import { TemplateCatalog, type TemplateCatalogScope } from "@sppg2001/atomize-core/services/template/template-catalog";
import { getErrorMessage } from "@sppg2001/atomize-core/utils/errors";
import chalk from "chalk";
import { Command } from "commander";
import { createCommandOutput, resolveCommandOutputPolicy } from "@/cli/utilities/command-output";
import { ExitCode, ExitError } from "@/cli/utilities/exit-codes";
import { sanitizeTty } from "@/cli/utilities/prompt-utilities";

type MigrateOptions = {
  scope?: string;
  dryRun?: boolean;
  cleanupDirs?: boolean;
};

const VALID_SCOPES = ["user", "project", "all"] as const;

function resolveScopes(
  scopeOption: string | undefined,
): Extract<TemplateCatalogScope, "user" | "project">[] {
  const raw = scopeOption ?? "user";
  if (!VALID_SCOPES.includes(raw as (typeof VALID_SCOPES)[number])) {
    throw new Error(`Invalid scope "${raw}". Valid values: user, project, all`);
  }
  if (raw === "all") return ["user", "project"];
  return [raw as Extract<TemplateCatalogScope, "user" | "project">];
}

export const templateMigrateCommand = new Command("migrate")
  .description("Move legacy catalog items to the current catalog storage root")
  .option("--scope <scope>", "Migration scope: user, project, or all [default: user]")
  .option("--dry-run", "Preview what would be migrated without making changes", false)
  .option("--cleanup-dirs", "Remove empty legacy kind subdirs and root after migration", false)
  .action(async (options: MigrateOptions) => {
    const output = createCommandOutput(resolveCommandOutputPolicy({}));

    try {
      output.intro(" Atomize — Migrate Legacy Catalog");

      const scopes = resolveScopes(options.scope);
      const dryRun = options.dryRun === true;
      const cleanupDirs = options.cleanupDirs === true;

      if (dryRun) {
        output.print(chalk.yellow("  Dry run — no files will be written or deleted\n"));
      }

      const catalog = new TemplateCatalog();
      let totalMigrated = 0;
      let totalSkipped = 0;

      for (const scope of scopes) {
        const result = await catalog.migrateLegacyItems(scope, { dryRun, cleanupDirs });

        for (const item of result.migrated) {
          const ref = sanitizeTty(`${item.kind}:${item.name}`);
          const src = sanitizeTty(item.sourcePath);
          const dest = sanitizeTty(item.destPath);
          const line = dryRun
            ? chalk.gray(`would migrate  ${ref}  ${src} → ${dest}`)
            : chalk.green(`migrated  ${ref}  ${src} → ${dest}`);
          output.print(line);
        }

        for (const item of result.skipped) {
          const ref = sanitizeTty(`${item.kind}:${item.name}`);
          const existing = sanitizeTty(item.existingPath);
          const line = dryRun
            ? chalk.gray(`would skip  ${ref}  already migrated at ${existing}`)
            : chalk.yellow(`skipped  ${ref}  already migrated at ${existing}`);
          output.print(line);
        }

        for (const dir of result.dirsCleaned) {
          const d = sanitizeTty(dir);
          const line = dryRun
            ? chalk.gray(`would remove  ${d}`)
            : chalk.gray(`removed  ${d}`);
          output.print(line);
        }

        totalMigrated += result.migrated.length;
        totalSkipped += result.skipped.length;
      }

      output.print("");
      const prefix = dryRun ? "Would migrate" : "Migrated";
      output.print(chalk.bold(`${prefix}: ${totalMigrated}, already migrated: ${totalSkipped}`));

      output.outro(dryRun ? "Dry run complete." : "Done.");
    } catch (error) {
      if (!(error instanceof ExitError)) output.cancel(getErrorMessage(error));
      process.exit(error instanceof ExitError ? error.code : ExitCode.Failure);
    }
  });
