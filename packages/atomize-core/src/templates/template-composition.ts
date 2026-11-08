import { resolve } from "node:path";
import { logger } from "../logger";
import type { TemplateCatalog } from "../services/template/template-catalog";
import { getErrorMessage, TemplateCompositionError, TemplateLoadError } from "../utils/errors";
import { TemplateComposer } from "./composer";
import { type MixinTemplate, MixinTemplateSchema, type TaskTemplate } from "./schema";
import { TemplateDocument } from "./template-document";
import { loadYamlFile } from "./template-file";
import { isFilePath, parseCompositionFields, resolveTemplatePath } from "./template-reference";

/**
 * How a Template was composed. Always present, even for a plain Template that
 * neither extends another nor uses Mixins.
 */
export interface CompositionMeta {
  /** True when the template uses extends or mixins. */
  isComposed: boolean;
  extendsRef?: string;
  resolvedExtendsPath?: string;
  mixinRefs: string[];
  resolvedMixinPaths: string[];
}

export interface ComposedTemplate {
  template: TaskTemplate;
  meta: CompositionMeta;
}

const REMOTE_CONTEXT = "<remote>";

/**
 * Turns a raw Atomize YAML File into a Resolved Template, resolving `extends` and Mixin refs
 * (file paths relative to the Template, catalog refs against one Catalog).
 *
 * Internal to the Template Library: callers get Resolved Templates through it.
 */
export class TemplateComposition {
  constructor(private readonly catalog: TemplateCatalog) {}

  async loadFile(filePath: string): Promise<ComposedTemplate> {
    const absolutePath = resolve(filePath);
    try {
      logger.debug(`Loading template from: ${absolutePath}`);
      const raw = await loadYamlFile(absolutePath);
      return await this.composeWithMeta(raw, absolutePath);
    } catch (error) {
      if (error instanceof TemplateCompositionError) throw error;
      throw new TemplateLoadError(`Failed to load template: ${getErrorMessage(error)}`, filePath);
    }
  }

  /** Loads remote YAML content; it has no folder, so only catalog refs can be composed. */
  async loadContent(content: string): Promise<ComposedTemplate> {
    try {
      const raw = TemplateDocument.parse(content).toValue();
      rejectFilePathRefs(raw);
      return await this.composeWithMeta(raw, "");
    } catch (error) {
      if (error instanceof TemplateCompositionError || error instanceof TemplateLoadError) throw error;
      throw new TemplateLoadError(`Failed to load template: ${getErrorMessage(error)}`, REMOTE_CONTEXT);
    }
  }

  /** Composes an in-memory raw Template as if it were saved at `contextPath`. */
  async compose(raw: unknown, contextPath: string): Promise<TaskTemplate> {
    return await this.resolveRaw(raw, contextPath ? resolve(contextPath) : "", []);
  }

  private async composeWithMeta(raw: unknown, contextPath: string): Promise<ComposedTemplate> {
    const fields = parseCompositionFields(raw, contextPath);
    const extendsRef = fields?.extendsRef;
    const mixinRefs = fields?.mixinRefs ?? [];
    const template = await this.resolveRaw(raw, contextPath, []);
    const resolvePath = (ref: string) => (isFilePath(ref) ? resolveTemplatePath(ref, contextPath) : ref);
    return {
      template,
      meta: {
        isComposed: !!(extendsRef || mixinRefs.length > 0),
        extendsRef,
        resolvedExtendsPath: extendsRef ? resolvePath(extendsRef) : undefined,
        mixinRefs,
        resolvedMixinPaths: mixinRefs.map(resolvePath),
      },
    };
  }

  /** `visitedRefs` is the chain of catalog Template refs above this one, for cycle detection. */
  private async resolveRaw(raw: unknown, contextPath: string, visitedRefs: string[]): Promise<TaskTemplate> {
    const composer = new TemplateComposer(
      (ref) => this.loadTemplateRef(ref, visitedRefs),
      (ref) => this.loadMixinRef(ref),
    );
    return await composer.resolve(raw, contextPath);
  }

  private async loadTemplateRef(ref: string, visitedRefs: string[]): Promise<TaskTemplate> {
    const parsed = this.catalog.parseRef(ref, "template");
    if (parsed.kind === "mixin") {
      throw new Error(`Reference "${ref}" points to a mixin, not a template.`);
    }

    const canonicalRef = `${parsed.kind}:${parsed.name}`;
    if (visitedRefs.includes(canonicalRef)) {
      throw new Error(`Circular template inheritance detected: ${[...visitedRefs, canonicalRef].join(" -> ")}`);
    }

    const item = await this.catalog.findItem(parsed.kind, parsed.name);
    if (!item) {
      throw new Error(`${parsed.kind} "${parsed.name}" not found.`);
    }

    const raw = await loadYamlFile(item.path);
    return await this.resolveRaw(raw, item.path, [...visitedRefs, canonicalRef]);
  }

  private async loadMixinRef(ref: string): Promise<MixinTemplate> {
    const parsed = this.catalog.parseRef(ref, "mixin");
    if (parsed.kind !== "mixin") {
      throw new Error(`Reference "${ref}" points to a ${parsed.kind}, not a mixin.`);
    }

    const item = await this.catalog.findItem("mixin", parsed.name);
    if (!item) {
      throw new Error(`mixin "${parsed.name}" not found.`);
    }

    const result = MixinTemplateSchema.safeParse(await loadYamlFile(item.path));
    if (!result.success) {
      const issues = result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      throw new Error(`Invalid mixin "${parsed.name}": ${issues}`);
    }
    return result.data;
  }
}

function rejectFilePathRefs(raw: unknown): void {
  const fields = parseCompositionFields(raw, "");
  const refs: Array<[string, string]> = [
    ...(fields?.extendsRef ? [[fields.extendsRef, 'extends: "template:base"'] as [string, string]] : []),
    ...(fields?.mixinRefs ?? []).map((ref): [string, string] => [ref, '"mixin:name"']),
  ];
  for (const [ref, example] of refs) {
    if (isFilePath(ref)) {
      throw new TemplateCompositionError(
        `Cannot resolve relative path "${ref}" from a URL context. ` +
          `The template author must replace it with a catalog ref (e.g., ${example}).`,
        REMOTE_CONTEXT,
      );
    }
  }
}
