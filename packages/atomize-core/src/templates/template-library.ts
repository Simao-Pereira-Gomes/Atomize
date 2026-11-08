import type {
  TemplateCatalogItem,
  TemplateCatalogKind,
  TemplateCatalogScope,
} from "../services/template/template-catalog";
import { TemplateCatalog, type TemplateCatalogOptions } from "../services/template/template-catalog";
import {
  parseTemplateCatalogKind,
  type ResolvedTemplateInstallSource,
  resolveTemplateInstallSource,
  type TemplateInstallContentSource,
  type TemplateInstallScope,
} from "../services/template/template-install-source";
import type { TaskTemplate } from "./schema";
import { type CompositionMeta, TemplateComposition } from "./template-composition";
import { verifyTemplate } from "./template-verification";
import {
  TemplateValidator,
  type ValidationOptions,
  type ValidationResult,
} from "./validator";

export type { CompositionMeta } from "./template-composition";

export type TemplateSourceKind = "file" | "catalog" | "url";

export interface TemplateSourceInfo {
  kind: TemplateSourceKind;
  input: string;
  path?: string;
  url?: string;
  ref?: string;
}

/** A Resolved Template, how it was composed, and where it came from. */
export interface ResolvedTemplateSource {
  template: TaskTemplate;
  meta: CompositionMeta;
  source: TemplateSourceInfo;
}

export interface TemplateSourceOptions {
  fetchContent?: (url: string) => Promise<string>;
  onFetch?: (url: string) => void;
  onNotice?: (message: string) => void;
}

export interface RunnableTemplate extends ResolvedTemplateSource {
  validation: ValidationResult;
}

export interface TemplateLibraryCatalog {
  items: TemplateCatalogItem[];
  overrides: Awaited<ReturnType<TemplateCatalog["listWithOverrides"]>>["overrides"];
  lineage: Awaited<ReturnType<TemplateCatalog["listWithOverrides"]>>["lineage"];
}

export interface SaveTemplateInput {
  kind: TemplateCatalogKind;
  name: string;
  template: unknown;
  /** The Catalog to save to; the personal one when omitted. */
  scope?: Extract<TemplateCatalogScope, "user" | "project">;
  overwrite?: boolean;
  validate?: boolean;
}

export interface InstallTemplateInput {
  source: string | TemplateInstallContentSource;
  scope?: Extract<TemplateCatalogScope, "user" | "project">;
  kind?: TemplateCatalogKind;
  overwrite?: boolean;
  fetchContent?: (url: string) => Promise<string>;
  onFetch?: (url: string) => void;
  onRawUrl?: (url: string) => void;
}

export interface TemplateInstallPreview {
  source: ResolvedTemplateInstallSource;
  targetPath: string;
  exists: boolean;
}

const INSTALL_SCOPES: TemplateInstallScope[] = ["user", "project"];

/**
 * Where the Template Library finds its Catalog: the built-in package root and the Workspace Root
 * the project Catalog is discovered from. Listing and catalog-ref resolution (`extends`,
 * `mixin:`, `template:`) always use the one Catalog built from this config.
 */
export type TemplateLibraryOptions = TemplateCatalogOptions;

export class TemplateLibrary {
  private readonly catalog: TemplateCatalog;
  private readonly composition: TemplateComposition;
  private readonly validator = new TemplateValidator();

  constructor(options: TemplateLibraryOptions = {}) {
    this.catalog = new TemplateCatalog(options);
    this.composition = new TemplateComposition(this.catalog);
  }

  async getRunnableTemplate(
    source: string,
    options: TemplateSourceOptions & { validate?: boolean } = {},
  ): Promise<RunnableTemplate> {
    const resolved = await this.loadSource(source, options);
    const validation = await verifyTemplate(resolved.template);
    if (options.validate !== false && !validation.valid) {
      const issues = validation.errors
        .map((error) => `${error.path}: ${error.message}`)
        .join("; ");
      throw new Error(`Template validation failed: ${issues}`);
    }

    return { ...resolved, validation };
  }

  /** Composes an in-memory raw template as if it were saved at `contextPath` (its `extends` and `mixins` resolved). */
  composeTemplate(raw: unknown, contextPath: string): Promise<TaskTemplate> {
    return this.composition.compose(raw, contextPath);
  }

  /**
   * Loads a Resolved Template from a file path, a `template:` Catalog ref, or an HTTPS URL
   * (which needs `fetchContent`). Mixins are not standalone sources.
   */
  async loadSource(
    source: string,
    options: TemplateSourceOptions = {},
  ): Promise<ResolvedTemplateSource> {
    if (source.startsWith("http://")) {
      throw new Error("Only HTTPS URLs are supported.");
    }
    if (source.startsWith("https://")) {
      return await this.loadUrl(source, options);
    }
    if (source.startsWith("mixin:")) {
      throw new Error(
        `"${source}" is a mixin, not a template. Mixins cannot be used standalone; they are composed into templates via the mixins field.`,
      );
    }
    if (source.startsWith("template:")) {
      return await this.loadCatalogRef(source, options);
    }
    const composed = await this.composition.loadFile(source);
    return { ...composed, source: { kind: "file", input: source, path: source } };
  }

  private async loadUrl(url: string, options: TemplateSourceOptions): Promise<ResolvedTemplateSource> {
    if (!options.fetchContent) {
      throw new Error("A fetchContent adapter is required to load remote templates.");
    }
    options.onFetch?.(url);
    const composed = await this.composition.loadContent(await options.fetchContent(url));
    return { ...composed, source: { kind: "url", input: url, url } };
  }

  private async loadCatalogRef(ref: string, options: TemplateSourceOptions): Promise<ResolvedTemplateSource> {
    const item = await this.catalog.findByRef(ref);
    if (!item) {
      throw new Error(`"${ref}" not found. Run: atomize template list`);
    }
    const { overrides } = await this.catalog.listWithOverrides("template");
    const override = overrides.find(
      (candidate) => candidate.active.name === item.name && candidate.active.scope === item.scope,
    );
    if (override) {
      options.onNotice?.(
        `Using ${item.scope}-scoped "${item.name}"; your ${override.overridden.scope}-scoped version is inactive. Run "atomize template list" to review.`,
      );
    }
    const composed = await this.composition.loadFile(item.path);
    return { ...composed, source: { kind: "catalog", input: ref, ref, path: item.path } };
  }

  /**
   * Validates a template's structure and constraints. Use when the template is already
   * fully composed (no `extends` or `mixins`), or when only structural validation is needed
   * without resolving composition references.
   */
  validateTemplate(
    template: unknown,
    options?: ValidationOptions,
  ): ValidationResult {
    return this.validator.validate(template, options);
  }

  /**
   * Validates a template that may declare `extends` or `mixins` references. If the template
   * uses composition, resolves those references relative to `outputPath` first so the composed
   * result is what gets validated. Use this when saving a template to disk — pass the intended
   * save path as `outputPath`.
   *
   * For templates with no composition, falls back to the same structural validation as
   * `validateTemplate`.
   */
  async validateTemplateForPath(
    template: unknown,
    outputPath: string,
    options?: ValidationOptions,
  ): Promise<ValidationResult> {
    if (
      typeof template !== "object" ||
      template === null ||
      Array.isArray(template) ||
      (!("extends" in template) && !("mixins" in template))
    ) {
      return this.validator.validate(template, options);
    }

    const resolvedTemplate = await this.composition.compose(template, outputPath);
    return await verifyTemplate(resolvedTemplate, { validation: options });
  }

  async getCatalog(kind: TemplateCatalogKind): Promise<TemplateLibraryCatalog> {
    return await this.catalog.listWithOverrides(kind);
  }

  async getCatalogAll(): Promise<TemplateLibraryCatalog> {
    return await this.catalog.listAllWithOverrides();
  }

  async findCatalogItem(
    kind: TemplateCatalogKind,
    name: string,
  ): Promise<TemplateCatalogItem | undefined> {
    return await this.catalog.findItem(kind, name);
  }

  async findCatalogItemByRef(
    ref: string,
    defaultKind: TemplateCatalogKind = "template",
  ): Promise<TemplateCatalogItem | undefined> {
    return await this.catalog.findByRef(ref, defaultKind);
  }

  async removeCatalogItem(
    kind: TemplateCatalogKind,
    name: string,
  ): Promise<TemplateCatalogItem> {
    return await this.catalog.removeUserItem(kind, name);
  }

  async saveTemplate(input: SaveTemplateInput): Promise<TemplateCatalogItem> {
    return await this.catalog.saveTemplate({
      ...input,
      scope: input.scope ?? "user",
      validate: input.validate !== false,
    });
  }

  async installTemplate(input: InstallTemplateInput): Promise<TemplateCatalogItem> {
    const preview = await this.previewInstall(input);
    return await preview.source.install({ overwrite: input.overwrite === true });
  }

  async previewInstall(input: InstallTemplateInput): Promise<TemplateInstallPreview> {
    const resolved = await resolveTemplateInstallSource(
      input.source,
      this.catalog,
      {
        type: input.kind,
        scope: input.scope ?? "user",
        fetchContent: input.fetchContent ?? (async () => {
          throw new Error("A fetchContent adapter is required to install remote templates.");
        }),
        onFetch: input.onFetch,
        onRawUrl: input.onRawUrl,
      },
    );
    const targetPath =
      (input.scope ?? "user") === "project"
        ? this.catalog.getProjectTemplatePath(resolved.kind, resolved.name)
        : this.catalog.getUserTemplatePath(resolved.kind, resolved.name);

    return {
      source: resolved,
      targetPath,
      exists: await this.catalog.destinationExists(resolved.kind, input.scope ?? "user", resolved.name),
    };
  }

  parseCatalogKind(value: string): TemplateCatalogKind {
    return parseTemplateCatalogKind(value);
  }

  parseInstallScope(value: string): TemplateInstallScope {
    if (INSTALL_SCOPES.includes(value as TemplateInstallScope)) {
      return value as TemplateInstallScope;
    }
    throw new Error(`Invalid scope "${value}". Expected: ${INSTALL_SCOPES.join(", ")}.`);
  }

  getUserTemplatePath(kind: TemplateCatalogKind, name: string): string {
    return this.catalog.getUserTemplatePath(kind, name);
  }

  getProjectTemplatePath(kind: TemplateCatalogKind, name: string): string {
    return this.catalog.getProjectTemplatePath(kind, name);
  }

  /** Whether there's a project to hold a project Catalog; the home folder is never one. */
  get hasProjectCatalog(): boolean {
    return this.catalog.hasProject;
  }

  async userTemplateExists(kind: TemplateCatalogKind, name: string): Promise<boolean> {
    return await this.catalog.destinationExists(kind, "user", name);
  }

  getTemplatePath(kind: TemplateCatalogKind, scope: Extract<TemplateCatalogScope, "user" | "project">, name: string): string {
    return scope === "project" ? this.catalog.getProjectTemplatePath(kind, name) : this.catalog.getUserTemplatePath(kind, name);
  }

  async templateExists(kind: TemplateCatalogKind, scope: Extract<TemplateCatalogScope, "user" | "project">, name: string): Promise<boolean> {
    return await this.catalog.destinationExists(kind, scope, name);
  }
}
