import { TemplateCatalog } from "@services/template/template-catalog";
import { type CompositionMeta, TemplateLoader } from "./loader";
import type { TaskTemplate } from "./schema";

export type TemplateSourceKind = "file" | "catalog" | "url";

export interface TemplateSourceInfo {
  kind: TemplateSourceKind;
  input: string;
  path?: string;
  url?: string;
  ref?: string;
}

export interface ResolvedTemplateSource {
  template: TaskTemplate;
  meta: CompositionMeta;
  source: TemplateSourceInfo;
}

export interface TemplateSourceResolverOptions {
  fetchContent?: (url: string) => Promise<string>;
  onFetch?: (url: string) => void;
  onNotice?: (message: string) => void;
}

/**
 * Loads a template from any caller-facing source shape.
 *
 * Callers should not need to know whether the source is a file path, catalog
 * reference, or remote URL before asking for a composed template.
 */
export class TemplateSourceResolver {
  constructor(
    private readonly loader: TemplateLoader = new TemplateLoader(),
    private readonly catalog: TemplateCatalog = new TemplateCatalog(),
  ) {}

  async load(
    source: string,
    options: TemplateSourceResolverOptions = {},
  ): Promise<ResolvedTemplateSource> {
    if (source.startsWith("http://")) {
      throw new Error("Only HTTPS URLs are supported.");
    }

    if (source.startsWith("https://")) {
      return await this.loadUrl(source, options);
    }

    if (source.startsWith("mixin:")) {
      throw new Error(
        `"${source}" is a mixin, not a template. Mixins cannot be used standalone — they are composed into templates via the mixins field.`,
      );
    }

    if (source.startsWith("template:")) {
      return await this.loadCatalogRef(source, options);
    }

    const loaded = await this.loader.loadWithMeta(source);
    return {
      ...loaded,
      source: {
        kind: "file",
        input: source,
        path: source,
      },
    };
  }

  private async loadUrl(
    url: string,
    options: TemplateSourceResolverOptions,
  ): Promise<ResolvedTemplateSource> {
    if (!options.fetchContent) {
      throw new Error("A fetchContent adapter is required to load remote templates.");
    }

    options.onFetch?.(url);
    const content = await options.fetchContent(url);
    const loaded = await this.loader.loadFromContent(content);
    return {
      ...loaded,
      source: {
        kind: "url",
        input: url,
        url,
      },
    };
  }

  private async loadCatalogRef(
    ref: string,
    options: TemplateSourceResolverOptions,
  ): Promise<ResolvedTemplateSource> {
    const item = await this.catalog.findByRef(ref);
    if (!item) {
      throw new Error(`"${ref}" not found. Run: atomize template list`);
    }

    const { overrides } = await this.catalog.listWithOverrides("template");
    const override = overrides.find(
      (candidate) =>
        candidate.active.name === item.name &&
        candidate.active.scope === item.scope,
    );
    if (override) {
      options.onNotice?.(
        `Using ${item.scope}-scoped "${item.name}" — your ${override.overridden.scope}-scoped version is inactive. Run "atomize template list" to review.`,
      );
    }

    const loaded = await this.loader.loadWithMeta(item.path);
    return {
      ...loaded,
      source: {
        kind: "catalog",
        input: ref,
        ref,
        path: item.path,
      },
    };
  }
}
