import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, rmdir, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { logger } from "../../logger";
import {
  MixinTemplateSchema,
  TaskTemplateSchema,
} from "../../templates/schema";
import { loadYamlFile } from "../../templates/template-file";
import { discoverWorkspaceRoot } from "./workspace-root";

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
  origin?: string;
}

export interface CatalogOverride {
  active: TemplateCatalogItem;
  overridden: TemplateCatalogItem;
}

export interface CatalogLineage {
  item: TemplateCatalogItem;
  originItem: TemplateCatalogItem;
}

export interface TemplateRefParts {
  kind: TemplateCatalogKind;
  name: string;
}

export interface TemplateCatalogOptions {
  packageRoot?: string;
  userRoot?: string;
  projectRoot?: string;
  legacyUserRoot?: string;
  legacyProjectRoot?: string;
  invocationCwd?: string;
}

export interface MigrationResultItem {
  kind: TemplateCatalogKind;
  name: string;
  sourcePath: string;
  destPath: string;
}

export interface MigrationSkippedItem {
  kind: TemplateCatalogKind;
  name: string;
  existingPath: string;
}

export interface MigrationResult {
  migrated: MigrationResultItem[];
  skipped: MigrationSkippedItem[];
  dirsCleaned: string[];
}

interface CatalogRoot {
  scope: TemplateCatalogScope;
  root: string;
}

const TEMPLATE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const LEGACY_EXTENSIONS = [".atomize.yaml", ".atomize.yml", ".yaml", ".yml"] as const;

export class TemplateCatalog {
  private readonly packageRoot: string;
  private readonly userRoot: string;
  private readonly projectRoot: string;
  private readonly legacyUserRoot: string;
  private readonly legacyProjectRoot: string;

  constructor(options?: TemplateCatalogOptions) {
    this.packageRoot = options?.packageRoot ?? this.findPackageRoot();
    const userStateRoot = resolve(homedir(), ".atomize");
    const projectStateRoot = resolve(discoverWorkspaceRoot(options?.invocationCwd), ".atomize");
    this.userRoot = options?.userRoot ?? resolve(userStateRoot, "catalog");
    this.projectRoot = options?.projectRoot ?? resolve(projectStateRoot, "catalog");
    this.legacyUserRoot = options?.legacyUserRoot ?? resolve(userStateRoot, "templates");
    this.legacyProjectRoot = options?.legacyProjectRoot ?? resolve(projectStateRoot, "templates");
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

  async listWithOverrides(kind: TemplateCatalogKind): Promise<{ items: TemplateCatalogItem[]; overrides: CatalogOverride[]; lineage: CatalogLineage[] }> {
    const items = new Map<string, TemplateCatalogItem>();
    const overrides = await this.addDiscoveredItems(items, kind);
    const allItems = [...items.values()];
    const itemsByRef = new Map(allItems.map((item) => [item.ref, item]));
    const lineage = this.buildLineage(allItems, itemsByRef);
    return { items: allItems, overrides, lineage };
  }

  async listAllWithOverrides(): Promise<{ items: TemplateCatalogItem[]; overrides: CatalogOverride[]; lineage: CatalogLineage[] }> {
    const [templates, mixins] = await Promise.all([
      this.listWithOverrides("template"),
      this.listWithOverrides("mixin"),
    ]);
    const allItems = [...templates.items, ...mixins.items];
    const itemsByRef = new Map(allItems.map((item) => [item.ref, item]));
    const lineage = this.buildLineage(allItems, itemsByRef);
    return {
      items: allItems,
      overrides: [...templates.overrides, ...mixins.overrides],
      lineage,
    };
  }

  async findByRef(ref: string, defaultKind: TemplateCatalogKind = "template"): Promise<TemplateCatalogItem | undefined> {
    const parsed = this.parseRef(ref, defaultKind);
    return await this.findItem(parsed.kind, parsed.name);
  }

  async installFromFile(
    sourcePath: string,
    kind: TemplateCatalogKind,
    scope: Extract<TemplateCatalogScope, "user" | "project"> = "user",
    options: { overwrite?: boolean } = {},
  ): Promise<TemplateCatalogItem> {
    const absoluteSourcePath = resolve(sourcePath);
    const raw = await loadYamlFile(absoluteSourcePath);
    this.validateInstallPayload(raw, kind);

    const filename = basename(absoluteSourcePath);
    if (!filename.endsWith(".yaml") && !filename.endsWith(".yml")) {
      throw new Error("Template files must use .yaml or .yml extension.");
    }

    const name = filename.replace(/(?:\.atomize)?\.ya?ml$/i, "");
    this.assertValidName(name);

    const targetPath = await this.prepareDestination(kind, scope, name, options.overwrite === true);
    const targetDir = dirname(targetPath);
    await mkdir(targetDir, { recursive: true });
    await copyFile(absoluteSourcePath, targetPath);
    await this.cleanupLegacyDestinationFiles(kind, scope, name);

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
    options: { overwrite?: boolean } = {},
  ): Promise<TemplateCatalogItem> {
    if (!filename.endsWith(".yaml") && !filename.endsWith(".yml")) {
      throw new Error("Template files must use .yaml or .yml extension.");
    }

    const name = filename.replace(/(?:\.atomize)?\.ya?ml$/i, "");
    this.assertValidName(name);

    const raw = parseYaml(content);
    this.validateInstallPayload(raw, kind);

    const targetPath = await this.prepareDestination(kind, scope, name, options.overwrite === true);
    const targetDir = dirname(targetPath);
    await mkdir(targetDir, { recursive: true });
    await writeFile(targetPath, content, "utf-8");
    await this.cleanupLegacyDestinationFiles(kind, scope, name);

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
    if (await this.destinationExists(input.kind, "user", input.name) && input.overwrite !== true) {
      throw new Error(`A ${input.kind} named "${input.name}" already exists.`);
    }

    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, stringifyYaml(input.template), "utf-8");
    await this.cleanupLegacyDestinationFiles(input.kind, "user", input.name);

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
    return join(this.userRoot, this.folderForKind(kind), `${name}.atomize.yaml`);
  }

  getProjectTemplatePath(kind: TemplateCatalogKind, name: string): string {
    this.assertValidName(name);
    return join(this.projectRoot, this.folderForKind(kind), `${name}.atomize.yaml`);
  }

  async destinationExists(
    kind: TemplateCatalogKind,
    scope: Extract<TemplateCatalogScope, "user" | "project">,
    name: string,
  ): Promise<boolean> {
    return (await this.findDestinationItem(kind, scope, name)) !== undefined;
  }

  async findDestinationItem(
    kind: TemplateCatalogKind,
    scope: Extract<TemplateCatalogScope, "user" | "project">,
    name: string,
  ): Promise<TemplateCatalogItem | undefined> {
    this.assertValidName(name);
    const roots = this.rootsForDestination(scope);
    for (const root of roots) {
      const items = await this.listDirectoryItems(kind, scope, join(root, this.folderForKind(kind)));
      const item = items.find((candidate) => candidate.name === name);
      if (item) return item;
    }
    return undefined;
  }

  private async addDiscoveredItems(
    items: Map<string, TemplateCatalogItem>,
    kind: TemplateCatalogKind,
  ): Promise<CatalogOverride[]> {
    const overrides: CatalogOverride[] = [];
    const roots: CatalogRoot[] = [
      { scope: "builtin", root: join(this.packageRoot, "catalog") },
      { scope: "user", root: this.legacyUserRoot },
      { scope: "user", root: this.userRoot },
      { scope: "project", root: this.legacyProjectRoot },
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

      // For each logical name, prefer .atomize.yaml over plain .yaml (same stem).
      const byName = new Map<string, string>();
      for (const file of yamlFiles) {
        const name = file.replace(/(?:\.atomize)?\.ya?ml$/i, "");
        if (!TEMPLATE_NAME_RE.test(name)) {
          logger.warn(`Skipping ${kind} with invalid file name: ${file}`);
          continue;
        }
        if (!byName.has(name) || /\.atomize\.ya?ml$/i.test(file)) {
          byName.set(name, file);
        }
      }

      const items: TemplateCatalogItem[] = [];
      for (const [name, file] of byName) {
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
            ...(metadata.origin ? { origin: metadata.origin } : {}),
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

  /**
   * Deletes a user-installed catalog item from disk. Built-in and project-scope items are
   * refused — this mirrors the CLI's `template remove` guard, now shared by every caller
   * instead of each reimplementing it.
   */
  async removeUserItem(
    kind: TemplateCatalogKind,
    name: string,
  ): Promise<TemplateCatalogItem> {
    const item = await this.findItem(kind, name);
    if (!item) {
      throw Object.assign(
        new Error(`${kind === "template" ? "Template" : "Mixin"} "${name}" not found.`),
        { code: "CATALOG_ITEM_NOT_FOUND" },
      );
    }
    if (item.scope !== "user") {
      throw Object.assign(
        new Error(`Cannot remove "${name}" — it is a ${item.scope} ${kind} and is not user-installed.`),
        { code: "CATALOG_ITEM_NOT_USER_SCOPED" },
      );
    }

    await unlink(item.path);
    return item;
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

  private async prepareDestination(
    kind: TemplateCatalogKind,
    scope: Extract<TemplateCatalogScope, "user" | "project">,
    name: string,
    overwrite: boolean,
  ): Promise<string> {
    const targetPath = scope === "project"
      ? this.getProjectTemplatePath(kind, name)
      : this.getUserTemplatePath(kind, name);
    if (!overwrite && await this.destinationExists(kind, scope, name)) {
      throw new Error(`A ${kind} named "${name}" already exists.`);
    }
    return targetPath;
  }

  private rootsForDestination(scope: Extract<TemplateCatalogScope, "user" | "project">): string[] {
    return scope === "project"
      ? [this.projectRoot, this.legacyProjectRoot]
      : [this.userRoot, this.legacyUserRoot];
  }

  private legacyRootForDestination(scope: Extract<TemplateCatalogScope, "user" | "project">): string {
    return scope === "project" ? this.legacyProjectRoot : this.legacyUserRoot;
  }

  async migrateLegacyItems(
    scope: Extract<TemplateCatalogScope, "user" | "project">,
    options: { dryRun?: boolean; cleanupDirs?: boolean } = {},
  ): Promise<MigrationResult> {
    const dryRun = options.dryRun === true;
    const cleanupDirs = options.cleanupDirs === true;
    const legacyRoot = scope === "project" ? this.legacyProjectRoot : this.legacyUserRoot;
    const kinds: TemplateCatalogKind[] = ["template", "mixin"];

    const migrated: MigrationResultItem[] = [];
    const skipped: MigrationSkippedItem[] = [];
    const dirsCleaned: string[] = [];

    for (const kind of kinds) {
      const legacyDir = join(legacyRoot, this.folderForKind(kind));
      const legacyItems = await this.listDirectoryItems(kind, scope, legacyDir);

      for (const item of legacyItems) {
        const destPath = scope === "project"
          ? this.getProjectTemplatePath(kind, item.name)
          : this.getUserTemplatePath(kind, item.name);

        const existingItem = await this.findInNewPath(kind, scope, item.name);
        if (existingItem) {
          skipped.push({ kind, name: item.name, existingPath: existingItem.path });
        } else {
          migrated.push({ kind, name: item.name, sourcePath: item.path, destPath });
          if (!dryRun) {
            await mkdir(dirname(destPath), { recursive: true });
            await copyFile(item.path, destPath);
            await this.cleanupLegacyDestinationFiles(kind, scope, item.name);
          }
        }
      }

      if (cleanupDirs && existsSync(legacyDir)) {
        const migratedFromKind = migrated.filter((m) => m.kind === kind).map((m) => m.name);
        const wouldBeEmpty = await this.wouldDirBecomeEmpty(legacyDir, migratedFromKind, dryRun);
        if (wouldBeEmpty) {
          dirsCleaned.push(legacyDir);
          if (!dryRun) {
            await rmdir(legacyDir);
          }
        }
      }
    }

    if (cleanupDirs && existsSync(legacyRoot)) {
      const rootEntries = await readdir(legacyRoot).catch(() => [] as string[]);
      const remainingEntries = rootEntries.filter(
        (entry) => !dirsCleaned.includes(join(legacyRoot, entry)),
      );
      if (remainingEntries.length === 0) {
        dirsCleaned.push(legacyRoot);
        if (!dryRun) {
          await rmdir(legacyRoot);
        }
      }
    }

    return { migrated, skipped, dirsCleaned };
  }

  private async findInNewPath(
    kind: TemplateCatalogKind,
    scope: Extract<TemplateCatalogScope, "user" | "project">,
    name: string,
  ): Promise<TemplateCatalogItem | undefined> {
    const newRoot = scope === "project" ? this.projectRoot : this.userRoot;
    const items = await this.listDirectoryItems(kind, scope, join(newRoot, this.folderForKind(kind)));
    return items.find((item) => item.name === name);
  }

  private async wouldDirBecomeEmpty(
    dir: string,
    migratedNames: string[],
    dryRun: boolean,
  ): Promise<boolean> {
    const files = await readdir(dir).catch(() => [] as string[]);
    if (!dryRun) {
      return files.length === 0;
    }
    const filesSet = new Set(files);
    let wouldBeRemoved = 0;
    for (const name of migratedNames) {
      for (const ext of LEGACY_EXTENSIONS) {
        if (filesSet.has(`${name}${ext}`)) wouldBeRemoved++;
      }
    }
    return files.length === wouldBeRemoved;
  }

  private async cleanupLegacyDestinationFiles(
    kind: TemplateCatalogKind,
    scope: Extract<TemplateCatalogScope, "user" | "project">,
    name: string,
  ): Promise<void> {
    const legacyDir = join(this.legacyRootForDestination(scope), this.folderForKind(kind));
    await Promise.all(LEGACY_EXTENSIONS.map(async (extension) => {
      const path = join(legacyDir, `${name}${extension}`);
      try {
        await unlink(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          throw error;
        }
      }
    }));
  }

  private buildLineage(
    allItems: TemplateCatalogItem[],
    itemsByRef: Map<string, TemplateCatalogItem>,
  ): CatalogLineage[] {
    const lineage: CatalogLineage[] = [];
    for (const item of allItems) {
      if (!item.origin) continue;
      const originItem = itemsByRef.get(item.origin);
      if (originItem) {
        lineage.push({ item, originItem });
      }
    }
    return lineage;
  }

  private extractMetadata(raw: unknown): { name?: string; description?: string; origin?: string } {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return {};
    }

    const record = raw as Record<string, unknown>;
    return {
      name: typeof record.name === "string" ? record.name : undefined,
      description: typeof record.description === "string" ? record.description : undefined,
      origin: typeof record.origin === "string" ? record.origin : undefined,
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
