import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@config/logger";
import {
  MixinTemplateSchema,
  TaskTemplateSchema,
} from "@templates/schema";
import { loadYamlFile } from "@templates/template-file";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export type TemplateCatalogKind = "template" | "mixin";
export type TemplateCatalogScope = "builtin" | "user" | "project";

export interface TemplateCatalogItem {
  kind: TemplateCatalogKind;
  scope: TemplateCatalogScope;
  name: string;
  displayName: string;
  description: string;
  ref: string;
  path: string;
}

export interface CatalogOverride {
  active: TemplateCatalogItem;
  overridden: TemplateCatalogItem;
}

export interface TemplateRefParts {
  kind: TemplateCatalogKind;
  name: string;
}

const TEMPLATE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export class TemplateCatalog {
  private readonly packageRoot: string;
  private readonly userRoot: string;
  private readonly projectRoot: string;

  constructor(options?: { packageRoot?: string; userRoot?: string; projectRoot?: string }) {
    this.packageRoot = options?.packageRoot ?? this.findPackageRoot();
    this.userRoot = options?.userRoot ?? resolve(homedir(), ".atomize", "templates");
    this.projectRoot = options?.projectRoot ?? resolve(process.cwd(), ".atomize", "templates");
  }

  async listTemplates(): Promise<TemplateCatalogItem[]> {
    return (await this.listWithOverrides("template")).items;
  }

  async listMixins(): Promise<TemplateCatalogItem[]> {
    return (await this.listWithOverrides("mixin")).items;
  }

  async listByKind(kind: TemplateCatalogKind): Promise<TemplateCatalogItem[]> {
    return (await this.listWithOverrides(kind)).items;
  }

  async listWithOverrides(kind: TemplateCatalogKind): Promise<{ items: TemplateCatalogItem[]; overrides: CatalogOverride[] }> {
    const items = new Map<string, TemplateCatalogItem>();
    const overrides = await this.addDiscoveredItems(items, kind);
    return { items: [...items.values()], overrides };
  }

  async findByRef(ref: string, defaultKind: TemplateCatalogKind = "template"): Promise<TemplateCatalogItem | undefined> {
    const parsed = this.parseRef(ref, defaultKind);
    return await this.findItem(parsed.kind, parsed.name);
  }

  async installFromFile(
    sourcePath: string,
    kind: TemplateCatalogKind,
    scope: Extract<TemplateCatalogScope, "user" | "project"> = "user",
  ): Promise<TemplateCatalogItem> {
    const absoluteSourcePath = resolve(sourcePath);
    const raw = await loadYamlFile(absoluteSourcePath);
    this.validateInstallPayload(raw, kind);

    const extension = extname(absoluteSourcePath);
    if (extension !== ".yaml" && extension !== ".yml") {
      throw new Error("Template files must use .yaml or .yml extension.");
    }

    const name = basename(absoluteSourcePath, extension);
    this.assertValidName(name);

    const root = scope === "project" ? this.projectRoot : this.userRoot;
    const targetDir = join(root, this.folderForKind(kind));
    const targetPath = join(targetDir, `${name}${extension}`);
    await mkdir(targetDir, { recursive: true });
    await copyFile(absoluteSourcePath, targetPath);

    const metadata = this.extractMetadata(raw);
    return {
      kind,
      scope,
      name,
      displayName: metadata.name ?? name,
      description: metadata.description ?? "No description",
      ref: `${kind}:${name}`,
      path: targetPath,
    };
  }

  async installFromContent(
    content: string,
    filename: string,
    kind: TemplateCatalogKind,
    scope: Extract<TemplateCatalogScope, "user" | "project"> = "user",
  ): Promise<TemplateCatalogItem> {
    const extension = extname(filename);
    if (extension !== ".yaml" && extension !== ".yml") {
      throw new Error("Template files must use .yaml or .yml extension.");
    }

    const name = basename(filename, extension);
    this.assertValidName(name);

    const raw = parseYaml(content);
    this.validateInstallPayload(raw, kind);

    const root = scope === "project" ? this.projectRoot : this.userRoot;
    const targetDir = join(root, this.folderForKind(kind));
    const targetPath = join(targetDir, `${name}${extension}`);
    await mkdir(targetDir, { recursive: true });
    await writeFile(targetPath, content, "utf-8");

    const metadata = this.extractMetadata(raw);
    return {
      kind,
      scope,
      name,
      displayName: metadata.name ?? name,
      description: metadata.description ?? "No description",
      ref: `${kind}:${name}`,
      path: targetPath,
    };
  }

  async saveUserTemplate(input: {
    kind: TemplateCatalogKind;
    name: string;
    template: unknown;
    overwrite?: boolean;
    validate?: boolean;
  }): Promise<TemplateCatalogItem> {
    this.assertValidName(input.name);
    if (input.validate !== false) {
      this.validateInstallPayload(input.template, input.kind);
    }

    const targetPath = this.getUserTemplatePath(input.kind, input.name);
    if (existsSync(targetPath) && input.overwrite !== true) {
      throw new Error(`A ${input.kind} named "${input.name}" already exists.`);
    }

    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, stringifyYaml(input.template), "utf-8");

    const metadata = this.extractMetadata(input.template);
    return {
      kind: input.kind,
      scope: "user",
      name: input.name,
      displayName: metadata.name ?? input.name,
      description: metadata.description ?? "No description",
      ref: `${input.kind}:${input.name}`,
      path: targetPath,
    };
  }

  getUserTemplatePath(kind: TemplateCatalogKind, name: string): string {
    this.assertValidName(name);
    return join(this.userRoot, this.folderForKind(kind), `${name}.yaml`);
  }

  getProjectTemplatePath(kind: TemplateCatalogKind, name: string): string {
    this.assertValidName(name);
    return join(this.projectRoot, this.folderForKind(kind), `${name}.yaml`);
  }

  private async addDiscoveredItems(
    items: Map<string, TemplateCatalogItem>,
    kind: TemplateCatalogKind,
  ): Promise<CatalogOverride[]> {
    const overrides: CatalogOverride[] = [];
    const roots: Array<{ scope: TemplateCatalogScope; root: string }> = [
      { scope: "builtin", root: join(this.packageRoot, "templates") },
      { scope: "user", root: this.userRoot },
      { scope: "project", root: this.projectRoot },
    ];

    for (const { scope, root } of roots) {
      const dir = join(root, this.folderForKind(kind));
      for (const item of await this.listDirectoryItems(kind, scope, dir)) {
        const existing = items.get(item.name);
        if (existing) {
          overrides.push({ active: item, overridden: existing });
        }
        items.set(item.name, item);
      }
    }

    return overrides;
  }

  private async listDirectoryItems(
    kind: TemplateCatalogKind,
    scope: TemplateCatalogScope,
    dir: string,
  ): Promise<TemplateCatalogItem[]> {
    if (!existsSync(dir)) return [];

    try {
      const files = await readdir(dir);
      const yamlFiles = files.filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"));
      const items: TemplateCatalogItem[] = [];

      for (const file of yamlFiles) {
        const name = file.replace(/\.ya?ml$/, "");
        if (!TEMPLATE_NAME_RE.test(name)) {
          logger.warn(`Skipping ${kind} with invalid file name: ${file}`);
          continue;
        }

        const path = join(dir, file);
        try {
          const raw = await loadYamlFile(path);
          const metadata = this.extractMetadata(raw);
          items.push({
            kind,
            scope,
            name,
            displayName: metadata.name ?? name,
            description: metadata.description ?? "No description",
            ref: `${kind}:${name}`,
            path,
          });
        } catch (error) {
          logger.warn(`Failed to load ${kind} file ${file}`, { error });
        }
      }

      return items;
    } catch (error) {
      logger.debug(`Template ${kind} directory not accessible: ${dir}`, { error });
      return [];
    }
  }

  async findItem(
    kind: TemplateCatalogKind,
    name: string,
  ): Promise<TemplateCatalogItem | undefined> {
    this.assertValidName(name);

    const items = kind === "template" ? await this.listTemplates() : await this.listMixins();

    return items.find((item) => item.name === name);
  }

  parseRef(
    ref: string,
    defaultKind: TemplateCatalogKind,
  ): TemplateRefParts {
    const separatorIndex = ref.indexOf(":");
    if (separatorIndex === -1) {
      this.assertValidName(ref);
      return { kind: defaultKind, name: ref };
    }

    const kind = ref.slice(0, separatorIndex);
    const name = ref.slice(separatorIndex + 1);
    if (kind !== "template" && kind !== "mixin") {
      throw new Error(`Unknown template reference kind "${kind}" in "${ref}".`);
    }

    this.assertValidName(name);
    return { kind, name };
  }

  assertValidName(name: string): void {
    if (TEMPLATE_NAME_RE.test(name)) return;
    throw new Error(
      `Invalid template name "${name}". Names may only contain letters, numbers, underscores, and hyphens.`,
    );
  }

  folderForKind(kind: TemplateCatalogKind): string {
    if (kind === "template") return "templates";
    return "mixins";
  }

  private extractMetadata(raw: unknown): { name?: string; description?: string } {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return {};
    }

    const record = raw as Record<string, unknown>;
    return {
      name: typeof record.name === "string" ? record.name : undefined,
      description: typeof record.description === "string" ? record.description : undefined,
    };
  }

  private validateInstallPayload(raw: unknown, kind: TemplateCatalogKind): void {
    const result =
      kind === "mixin"
        ? MixinTemplateSchema.safeParse(raw)
        : TaskTemplateSchema.safeParse(raw);

    if (result.success) return;

    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid ${kind} template: ${issues}`);
  }

  private findPackageRoot(): string {
    let currentDir = dirname(fileURLToPath(import.meta.url));

    while (currentDir !== dirname(currentDir)) {
      const pkgPath = resolve(currentDir, "package.json");
      if (existsSync(pkgPath)) {
        return currentDir;
      }
      currentDir = dirname(currentDir);
    }

    return process.cwd();
  }
}
