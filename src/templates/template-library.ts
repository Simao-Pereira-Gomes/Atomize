import { existsSync } from "node:fs";
import type {
  TemplateCatalogItem,
  TemplateCatalogKind,
  TemplateCatalogScope,
} from "@services/template/template-catalog";
import { TemplateCatalog } from "@services/template/template-catalog";
import {
  parseTemplateCatalogKind,
  type ResolvedTemplateInstallSource,
  resolveTemplateInstallSource,
  type TemplateInstallScope,
} from "@services/template/template-install-source";
import { TemplateResolver } from "@services/template/template-resolver";
import type { CompositionMeta } from "./loader";
import type { TaskTemplate } from "./schema";
import {
  type ResolvedTemplateSource,
  TemplateSourceResolver,
  type TemplateSourceResolverOptions,
} from "./source-resolver";
import { verifyTemplate } from "./template-verification";
import {
  TemplateValidator,
  type ValidationOptions,
  type ValidationResult,
} from "./validator";

export interface RunnableTemplate {
  template: TaskTemplate;
  meta: CompositionMeta;
  source: {
    kind: "file" | "catalog" | "url";
    input: string;
    path?: string;
    url?: string;
    ref?: string;
  };
  validation: ValidationResult;
}

export interface TemplateLibraryCatalog {
  items: TemplateCatalogItem[];
  overrides: Awaited<ReturnType<TemplateCatalog["listWithOverrides"]>>["overrides"];
}

export interface SaveTemplateInput {
  kind: TemplateCatalogKind;
  name: string;
  template: unknown;
  overwrite?: boolean;
  validate?: boolean;
}

export interface InstallTemplateInput {
  source: string;
  scope?: Extract<TemplateCatalogScope, "user" | "project">;
  kind?: TemplateCatalogKind;
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

export class TemplateLibrary {
  constructor(
    private readonly resolver = new TemplateSourceResolver(),
    private readonly catalog = new TemplateCatalog(),
    private readonly validator = new TemplateValidator(),
  ) {}

  async getRunnableTemplate(
    source: string,
    options: TemplateSourceResolverOptions & { validate?: boolean } = {},
  ): Promise<RunnableTemplate> {
    const resolved = await this.resolver.load(source, options);
    const validation = await verifyTemplate(resolved.template);
    if (options.validate !== false && !validation.valid) {
      const issues = validation.errors
        .map((error) => `${error.path}: ${error.message}`)
        .join("; ");
      throw new Error(`Template validation failed: ${issues}`);
    }

    return { ...resolved, validation };
  }

  async loadSource(
    source: string,
    options: TemplateSourceResolverOptions = {},
  ): Promise<ResolvedTemplateSource> {
    return await this.resolver.load(source, options);
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

    const resolvedTemplate = await new TemplateResolver(this.catalog).resolveRaw(
      template,
      outputPath,
    );
    return await verifyTemplate(resolvedTemplate, { validation: options });
  }

  async getCatalog(kind: TemplateCatalogKind): Promise<TemplateLibraryCatalog> {
    return await this.catalog.listWithOverrides(kind);
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

  async saveTemplate(input: SaveTemplateInput): Promise<TemplateCatalogItem> {
    return await this.catalog.saveUserTemplate({
      ...input,
      validate: input.validate !== false,
    });
  }

  async installTemplate(input: InstallTemplateInput): Promise<TemplateCatalogItem> {
    const preview = await this.previewInstall(input);
    return await preview.source.install();
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
      exists: existsSync(targetPath),
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
}
