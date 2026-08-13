import { TemplateLibrary } from "@sppg2001/atomize-core/templates/template-library";
import { Command } from "commander";
import { ExitCode } from "@/cli/utilities/exit-codes";
import { fetchTemplateContent } from "@/cli/utilities/template-fetch";
import { inspectTemplate, runPreview } from "./preview-application";

type PreviewOptions = {
  inspect?: boolean;
  mockStory?: string;
};

export const previewCommand = new Command("preview")
  .description(
    "Inspect template field requirements or simulate task generation against a mock story",
  )
  .argument("<source>", "Path to a YAML template file, catalog ref, or HTTPS URL")
  .option("--inspect", "Output JSON describing which story fields the template references")
  .option("--mock-story <json>", "JSON object of mock story field values to preview against")
  .action(async (source: string, options: PreviewOptions) => {
    if (options.inspect && options.mockStory !== undefined) {
      process.stderr.write("Error: --inspect and --mock-story are mutually exclusive\n");
      process.exit(ExitCode.Failure);
    }

    if (!options.inspect && options.mockStory === undefined) {
      process.stderr.write("Error: one of --inspect or --mock-story is required\n");
      process.exit(ExitCode.Failure);
    }

    try {
      const { template } = await new TemplateLibrary().loadSource(source, {
        fetchContent: fetchTemplateContent,
      });

      if (options.inspect) {
        process.stdout.write(`${JSON.stringify(inspectTemplate(template), null, 2)}\n`);
      } else {
        process.stdout.write(`${JSON.stringify(runPreview(template, options.mockStory??""), null, 2)}\n`);
      }
    } catch (error) {
      process.stderr.write(
        `Error: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exit(ExitCode.Failure);
    }
  });
