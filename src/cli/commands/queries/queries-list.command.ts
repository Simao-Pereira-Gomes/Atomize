import { cancel, intro, outro } from "@clack/prompts";
import { AzureDevOpsAdapter } from "@platforms/adapters/azure-devops/azure-devops.adapter";
import chalk from "chalk";
import { Command } from "commander";
import { ExitCode } from "@/cli/utilities/exit-codes";
import { createManagedSpinner, sanitizeTty } from "@/cli/utilities/prompt-utilities";

export const queriesListCommand = new Command("list")
  .alias("ls")
  .description("List saved queries in the Azure DevOps project")
  .option("--folder <path>", "Scope results to queries under this folder path")
  .option("--profile <name>", "Named connection profile to use (uses default if omitted)")
  .option("--json", "Print results as JSON to stdout; progress is written to stderr", false)
  .action(async (options: { folder?: string; profile?: string; json: boolean }) => {
    // In --json mode stdout is reserved for pure JSON output.
    const jsonMode = options.json;

    const logProgress = jsonMode
      ? (msg: string) => process.stderr.write(`${msg}\n`)
      : undefined;

    if (!jsonMode) intro(" Atomize — Saved Queries");

    const s = createManagedSpinner();
    if (!jsonMode) s.start("Resolving configuration...");
    else logProgress?.("Resolving configuration...");

    try {
      const { resolveAzureConfig } = await import("@config/profile-resolver");
      const azureConfig = await resolveAzureConfig(options.profile);
      const adapter = new AzureDevOpsAdapter(azureConfig);

      if (!jsonMode) s.message("Connecting...");
      else logProgress?.("Connecting...");
      await adapter.authenticate();

      if (!jsonMode) s.message("Fetching queries...");
      else logProgress?.("Fetching queries...");
      const queries = await adapter.listSavedQueries(options.folder);
      const countLabel = `${queries.length} ${queries.length === 1 ? "query" : "queries"}`;

      if (!jsonMode) s.stop(`Found ${countLabel}`);
      else logProgress?.(`Found ${countLabel}`);

      if (jsonMode) {
        console.log(JSON.stringify(queries, null, 2));
        return;
      }

      if (queries.length === 0) {
        outro(options.folder
          ? `No queries found under "${options.folder}".`
          : "No queries found in this project.");
        return;
      }

      console.log("");
      const pathWidth = Math.min(
        Math.max(...queries.map((q) => q.path.length), 4),
        60,
      );
      console.log(chalk.gray(`  ${"PATH".padEnd(pathWidth)}  ${"ID".padEnd(36)}  VISIBILITY`));
      console.log(chalk.gray(`  ${"-".repeat(pathWidth)}  ${"-".repeat(36)}  ----------`));

      for (const q of queries) {
        const path = sanitizeTty(q.path).padEnd(pathWidth).slice(0, pathWidth);
        const id = chalk.dim(sanitizeTty(q.id));
        const visibility = q.isPublic ? chalk.green("shared") : chalk.yellow("private");
        console.log(`  ${chalk.cyan(path)}  ${id}  ${visibility}`);
      }

      console.log("");
      outro(`${countLabel} listed`);
    } catch (error) {
      const msg = error instanceof Error ? sanitizeTty(error.message) : String(error);
      if (jsonMode) {
        process.stderr.write(`Error: ${msg}\n`);
      } else {
        s.stop("Failed");
        cancel(msg);
      }
      process.exit(ExitCode.Failure);
    }
  });
