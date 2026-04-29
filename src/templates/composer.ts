import { logger } from "@config/logger";
import { TemplateCompositionError, getErrorMessage } from "@utils/errors";
import {
  type MixinTemplate,
  MixinTemplateSchema,
  type TaskDefinition,
  type TaskTemplate,
} from "./schema";
import { loadYamlFile } from "./template-file";
import {
  isFilePath,
  parseCompositionFields,
  resolveTemplatePath,
} from "./template-reference";

export const MAX_INHERITANCE_DEPTH = 10;

/**
 * Merges two task arrays using id-based override.
 *
 * Tasks with matching ids are replaced by the incoming task.
 * Tasks without ids or with new ids are appended.
 * The relative order of base tasks is preserved; overrides are applied in-place.
 */
function mergeTasks(
  baseTasks: TaskDefinition[],
  incomingTasks: TaskDefinition[],
): TaskDefinition[] {
  const result = [...baseTasks];
  const indexById = new Map<string, number>();
  baseTasks.forEach((task, i) => {
    if (task.id) indexById.set(task.id, i);
  });

  for (const incoming of incomingTasks) {
    const existingIndex = incoming.id ? indexById.get(incoming.id) : undefined;
    if (existingIndex !== undefined) {
      result[existingIndex] = incoming;
    } else {
      result.push(incoming);
      if (incoming.id) {
        indexById.set(incoming.id, result.length - 1);
      }
    }
  }

  return result;
}

/**
 * Merges two template objects. Child fields always win over base fields.
 *
 * Conflict resolution rules:
 * - Scalar fields (name, description, author, …): child wins if defined, otherwise base
 * - filter, estimation, validation, metadata: child replaces base entirely when defined
 * - tasks: merged by id — child tasks override matching base tasks in-place, new tasks appended
 * - tags: combined and deduplicated
 * - extends / mixins: stripped from result (composition metadata, not execution data)
 */
function mergeTemplates(
  base: TaskTemplate,
  child: Partial<TaskTemplate>,
): TaskTemplate {
  const mergedTags = Array.from(
    new Set([...(base.tags ?? []), ...(child.tags ?? [])]),
  );

  return {
    version: child.version ?? base.version,
    name: child.name ?? base.name,
    description: child.description ?? base.description,
    author: child.author ?? base.author,
    tags: mergedTags.length > 0 ? mergedTags : undefined,
    created: child.created ?? base.created,
    lastModified: child.lastModified ?? base.lastModified,

    filter: child.filter ?? base.filter,
    tasks: mergeTasks(base.tasks, child.tasks ?? []),

    estimation: child.estimation ?? base.estimation,
    validation: child.validation ?? base.validation,
    metadata: child.metadata ?? base.metadata,
  };
}

/**
 * Applies a mixin's tasks onto a template.
 * Only tasks from mixins are merged; other mixin fields are ignored.
 */
function applyMixin(base: TaskTemplate, mixin: MixinTemplate): TaskTemplate {
  return {
    ...base,
    tasks: mergeTasks(base.tasks, mixin.tasks),
  };
}

/**
 * Resolves template inheritance and mixin composition.
 *
 * Composition order for every template:
 *   1. Load and fully resolve the parent template (recursive, via `extends`)
 *   2. Apply each mixin in declaration order (tasks only)
 *   3. Merge the child template on top — child fields always win
 *
 * This order guarantees: child > mixins > base, at every level of the chain.
 */
export class TemplateComposer {
  constructor(
    private readonly resolveTemplateRef?: (ref: string) => Promise<TaskTemplate>,
    private readonly resolveNamedMixin?: (ref: string) => Promise<MixinTemplate>,
  ) {}

  /**
   * Resolves all `extends` and `mixins` references for a raw parsed template,
   * returning a fully composed TaskTemplate.
   *
   * @param raw         - The raw parsed YAML (not yet Zod-validated as a full template)
   * @param contextPath - Absolute path of the template file (for relative path resolution)
   * @param visited     - Set of canonical paths already in the resolution chain (circular detection)
   */
  async resolve(
    raw: unknown,
    contextPath: string,
    visited: Set<string> = new Set(),
  ): Promise<TaskTemplate> {
    const compositionFields = parseCompositionFields(raw, contextPath);
    if (!compositionFields) {
      return raw as TaskTemplate;
    }

    const { extendsRef, mixinRefs } = compositionFields;

    if (!extendsRef && mixinRefs.length === 0) {
      return raw as TaskTemplate;
    }

    const base: TaskTemplate = extendsRef
      ? await this.loadRef(extendsRef, contextPath, visited)
      : { ...(raw as TaskTemplate), tasks: [] };

    // Apply mixins onto the base (before the child overrides).
    let intermediate = base;
    if (mixinRefs.length > 0) {
      for (const mixinRef of mixinRefs) {
        const mixin = await this.loadMixinRef(mixinRef, contextPath, visited);
        intermediate = applyMixin(intermediate, mixin);
      }
    }

    return mergeTemplates(intermediate, raw as Partial<TaskTemplate>);
  }

  /**
   * Loads and fully resolves a template reference (logical reference or file path).
   */
  private async loadRef(
    ref: string,
    contextPath: string,
    visited: Set<string>,
  ): Promise<TaskTemplate> {
    if (!isFilePath(ref)) {
      return this.loadNamedTemplateRef(ref);
    }

    const absolutePath = resolveTemplatePath(ref, contextPath);

    if (visited.size >= MAX_INHERITANCE_DEPTH) {
      const chain = [...visited, contextPath].join(" → ");
      throw new TemplateCompositionError(
        `Maximum inheritance depth of ${MAX_INHERITANCE_DEPTH} exceeded.\n` +
          `Chain so far: ${chain}`,
        contextPath,
      );
    }

    // Circular inheritance detection.
    if (visited.has(absolutePath)) {
      const chain = [...visited, contextPath, absolutePath].join(" → ");
      throw new TemplateCompositionError(
        `Circular inheritance detected: ${chain}`,
        absolutePath,
      );
    }

    logger.debug(`Resolving extends: ${absolutePath}`);

    const nextVisited = new Set(visited);
    nextVisited.add(contextPath);

    const raw = await loadYamlFile(absolutePath);
    return this.resolve(raw, absolutePath, nextVisited);
  }

  /**
   * Loads a mixin reference and validates it against MixinTemplateSchema.
   * Mixins must be file paths or mixin references — template names are not supported as mixins.
   */
  private async loadMixinRef(
    ref: string,
    contextPath: string,
    visited: Set<string>,
  ): Promise<MixinTemplate> {
    if (!isFilePath(ref)) {
      return await this.loadNamedMixinRef(ref);
    }

    const absolutePath = resolveTemplatePath(ref, contextPath);

    if (visited.has(absolutePath)) {
      throw new TemplateCompositionError(
        `Circular mixin detected: "${absolutePath}" is already in the composition chain.`,
        absolutePath,
      );
    }

    logger.debug(`Resolving mixin: ${absolutePath}`);

    const raw = await loadYamlFile(absolutePath);
    const parsed = MixinTemplateSchema.safeParse(raw);

    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `  ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new TemplateCompositionError(
        `Invalid mixin "${absolutePath}":\n${issues}`,
        absolutePath,
      );
    }

    return parsed.data;
  }

  private async loadNamedTemplateRef(ref: string): Promise<TaskTemplate> {
    if (!this.resolveTemplateRef) {
      throw new TemplateCompositionError(
        `Cannot resolve template reference "${ref}": no template resolver is configured. ` +
          `Use a file path (./path/to/template.yaml) instead.`,
        ref,
      );
    }

    logger.debug(`Resolving template reference: ${ref}`);

    try {
      return await this.resolveTemplateRef(ref);
    } catch (error) {
      const message = getErrorMessage(error);
      throw new TemplateCompositionError(
        `Failed to load template reference "${ref}": ${message}`,
        ref,
      );
    }
  }

  private async loadNamedMixinRef(ref: string): Promise<MixinTemplate> {
    if (!this.resolveNamedMixin) {
      throw new TemplateCompositionError(
        `Cannot resolve mixin reference "${ref}": no mixin resolver is configured. ` +
          `Use a file path (./path/to/mixin.yaml) instead.`,
        ref,
      );
    }

    logger.debug(`Resolving mixin reference: ${ref}`);

    try {
      return await this.resolveNamedMixin(ref);
    } catch (error) {
      const message = getErrorMessage(error);
      throw new TemplateCompositionError(
        `Failed to load mixin reference "${ref}": ${message}`,
        ref,
      );
    }
  }
}
