import { existsSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { confirm } from "@clack/prompts";
import {
  TemplateCatalog,
  type TemplateCatalogItem,
  type TemplateCatalogKind,
} from "@services/template/template-catalog";
import { MixinTemplateSchema, TaskTemplateSchema } from "@templates/schema";
import { loadYamlFile } from "@templates/template-file";
import chalk from "chalk";
import { Command } from "commander";
import { parse as parseYaml } from "yaml";
import {
  createCommandOutput,
  resolveCommandOutputPolicy,
} from "@/cli/utilities/command-output";
import { ExitCode } from "@/cli/utilities/exit-codes";
import {
  assertNotCancelled,
  isInteractiveTerminal,
  sanitizeTty,
} from "@/cli/utilities/prompt-utilities";
import { fetchTemplateContent } from "@/cli/utilities/template-fetch";
import { CancellationError, getErrorMessage } from "@/utils/errors";

type InstallScope = "user" | "project";

type InstallOptions = {
  type?: TemplateCatalogKind;
  overwrite?: boolean;
  scope?: InstallScope;
};

type ResolvedSource = {
  kind: TemplateCatalogKind;
  name: string;
  install: () => Promise<TemplateCatalogItem>;
  fromLabel?: string;
};

const INSTALL_SCOPES: InstallScope[] = ["user", "project"];
const TEMPLATE_TYPES: TemplateCatalogKind[] = ["template", "mixin"];

export const templateInstallCommand = new Command("install")
  .description("Install a template or mixin from a local file or HTTPS URL")
  .argument("<source>", "Path to a YAML template file or an HTTPS URL")
  .option("--type <type>", "Template type: template or mixin (auto-detected if omitted)")
  .option("--overwrite", "Overwrite if a template with the same name already exists", false)
  .option("--scope <scope>", "Installation scope: user (~/.atomize) or project (.atomize in cwd)", "user")
  .action(async (source: string, options: InstallOptions) => {
    const output = createCommandOutput(resolveCommandOutputPolicy({}));

    try {
      const scope = parseInstallScope(options.scope ?? "user");
      const catalog = new TemplateCatalog();
      const resolvedSource = await resolveSource(source, options, catalog, scope, output.print);

      output.intro(` Atomize — Install ${resolvedSource.kind}`);
      if (!options.type) {
        output.print(chalk.gray(`  Detected type: ${resolvedSource.kind}\n`));
      }

      const targetPath =
        scope === "project"
          ? catalog.getProjectTemplatePath(resolvedSource.kind, resolvedSource.name)
          : catalog.getUserTemplatePath(resolvedSource.kind, resolvedSource.name);

      if (existsSync(targetPath) && !options.overwrite) {
        if (!isInteractiveTerminal()) {
          output.cancel(`${resolvedSource.kind} "${resolvedSource.name}" already exists. Re-run with --overwrite to replace it.`);
          process.exit(ExitCode.Failure);
        }
        const confirmed = assertNotCancelled(
          await confirm({
            message: `${resolvedSource.kind} "${resolvedSource.name}" already exists. Overwrite?`,
            initialValue: false,
          }),
        );
        if (!confirmed) {
          output.outro("Cancelled.");
          process.exit(ExitCode.Success);
        }
      }

      const item = await resolvedSource.install();
      output.print(chalk.green(`Installed ${resolvedSource.kind}: ${sanitizeTty(item.name)}`));
      output.print(chalk.gray(`  ref:   ${sanitizeTty(item.ref)}`));
      output.print(chalk.gray(`  scope: ${item.scope}`));
      output.print(chalk.gray(`  path:  ${sanitizeTty(item.path)}`));
      if (resolvedSource.fromLabel) output.print(chalk.gray(`  from:  ${sanitizeTty(resolvedSource.fromLabel)}`));
      output.outro("Installed successfully");
    } catch (error) {
      if (error instanceof CancellationError) {
        output.outro("Cancelled.");
        process.exit(ExitCode.Success);
      }
      output.cancel(getErrorMessage(error));
      process.exit(ExitCode.Failure);
    }
  });

async function resolveSource(
  source: string,
  options: InstallOptions,
  catalog: TemplateCatalog,
  scope: InstallScope,
  print: (msg: string) => void,
): Promise<ResolvedSource> {
  if (source.startsWith("http://")) {
    throw new Error("Only HTTPS URLs are supported.");
  }

  if (source.startsWith("https://")) {
    const urlFilename = basename(new URL(source).pathname);
    if (!urlFilename) {
      throw new Error("Could not determine template name from URL. The URL must end with a filename (e.g., /feature.yaml).");
    }
    const urlExt = extname(urlFilename);
    if (urlExt !== ".yaml" && urlExt !== ".yml") {
      throw new Error(`URL must point to a YAML file (.yaml or .yml). Got: "${urlFilename}"`);
    }
    print(chalk.gray(`  Fetching ${sanitizeTty(source)}\n`));
    const content = await fetchTemplateContent(source);
    const kind = options.type ? parseTemplateType(options.type) : detectKindFromContent(content);
    return {
      kind,
      name: basename(urlFilename, urlExt),
      install: () => catalog.installFromContent(content, urlFilename, kind, scope),
      fromLabel: source,
    };
  }

  const kind = options.type ? parseTemplateType(options.type) : await detectKindFromFile(source);
  const ext = extname(resolve(source));
  return {
    kind,
    name: basename(resolve(source), ext),
    install: () => catalog.installFromFile(source, kind, scope),
  };
}


function detectKindFromContent(content: string): TemplateCatalogKind {
  let raw: unknown;
  try {
    raw = parseYaml(content);
  } catch {
    throw new Error("Could not parse YAML content. Pass --type explicitly.");
  }
  return inferKind(raw);
}

async function detectKindFromFile(filePath: string): Promise<TemplateCatalogKind> {
  const raw = await loadYamlFile(filePath);
  return inferKind(raw);
}

function inferKind(raw: unknown): TemplateCatalogKind {
  if (TaskTemplateSchema.safeParse(raw).success) return "template";
  if (MixinTemplateSchema.safeParse(raw).success) return "mixin";

  const issues = TaskTemplateSchema.safeParse(raw).error?.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
  throw new Error(`Could not detect template type. Pass --type explicitly.\n  ${issues}`);
}

function parseInstallScope(value: string): InstallScope {
  if (INSTALL_SCOPES.includes(value as InstallScope)) {
    return value as InstallScope;
  }
  throw new Error(`Invalid scope "${value}". Expected: ${INSTALL_SCOPES.join(", ")}.`);
}

function parseTemplateType(value: string): TemplateCatalogKind {
  if (TEMPLATE_TYPES.includes(value as TemplateCatalogKind)) {
    return value as TemplateCatalogKind;
  }
  throw new Error(`Invalid type "${value}". Expected: ${TEMPLATE_TYPES.join(", ")}.`);
}
