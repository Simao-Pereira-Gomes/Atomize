import { resolve } from "node:path";
import { logger } from "@config/logger";
import { TemplateCatalog } from "@services/template/template-catalog";
import { TemplateResolver } from "@services/template/template-resolver";
import { TemplateCompositionError, TemplateLoadError, getErrorMessage } from "@utils/errors";
import type { TaskTemplate } from "./schema";
import { loadYamlFile } from "./template-file";
import {
  isFilePath,
  parseCompositionFields,
  resolveTemplatePath,
} from "./template-reference";

/**
 * Metadata describing how a template was composed.
 * Populated by loadWithMeta(); always present even for plain (non-inheriting) templates.
 */
export interface CompositionMeta {
  /** True when the template uses extends or mixins. */
  isComposed: boolean;
  extendsRef?: string;
  resolvedExtendsPath?: string;
  mixinRefs: string[];
  resolvedMixinPaths: string[];
}

export class TemplateLoader {
  private resolver: TemplateResolver;

  constructor(catalog: TemplateCatalog = new TemplateCatalog()) {
    this.resolver = new TemplateResolver(catalog);
  }

  /**
   * Load a template from a YAML file, resolving any `extends` and `mixins` references.
   */
  async load(filePath: string): Promise<TaskTemplate> {
    const { template } = await this.loadWithMeta(filePath);
    return template;
  }

  /**
   * Load a template and return it alongside composition metadata.
   * Use this when you need to display the inheritance chain to the user.
   */
  async loadWithMeta(
    filePath: string,
  ): Promise<{ template: TaskTemplate; meta: CompositionMeta }> {
    try {
      logger.debug(`Loading template from: ${filePath}`);
      const absolutePath = resolve(filePath);
      const parsed = await loadYamlFile(absolutePath);

      logger.debug("Template parsed successfully");

      const compositionFields = parseCompositionFields(parsed, absolutePath);
      const extendsRef = compositionFields?.extendsRef;
      const mixinRefs = compositionFields?.mixinRefs ?? [];

      const template = await this.resolver.resolveRaw(parsed, absolutePath);

      const meta: CompositionMeta = {
        isComposed: !!(extendsRef || mixinRefs.length > 0),
        extendsRef,
        resolvedExtendsPath: extendsRef
          ? isFilePath(extendsRef)
            ? resolveTemplatePath(extendsRef, absolutePath)
            : extendsRef
          : undefined,
        mixinRefs,
        resolvedMixinPaths: mixinRefs.map((ref) =>
          isFilePath(ref) ? resolveTemplatePath(ref, absolutePath) : ref,
        ),
      };

      return { template, meta };
    } catch (error) {
      if (error instanceof TemplateCompositionError) throw error;

      const message = getErrorMessage(error);
      throw new TemplateLoadError(
        `Failed to load template: ${message}`,
        filePath,
      );
    }
  }

  /**
   * Load multiple templates
   */
  async loadMultiple(filePaths: string[]): Promise<TaskTemplate[]> {
    const templates: TaskTemplate[] = [];

    for (const filePath of filePaths) {
      const template = await this.load(filePath);
      templates.push(template);
    }

    return templates;
  }

  /**
   * Check if a file can be loaded as a template (including composition).
   * Returns false if the file is missing, empty, or any referenced template/mixin is invalid.
   */
  async canLoad(filePath: string): Promise<boolean> {
    try {
      await this.load(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
