import { TemplateComposer } from "@templates/composer";
import {
  type MixinTemplate,
  MixinTemplateSchema,
  type TaskTemplate,
} from "@templates/schema";
import { loadYamlFile } from "@templates/template-file";
import { TemplateCatalog } from "./template-catalog";

export class TemplateResolver {
  private readonly visitedTemplateRefs = new Set<string>();

  constructor(private readonly catalog: TemplateCatalog = new TemplateCatalog()) {}

  async loadTemplateRef(ref: string): Promise<TaskTemplate> {
    const parsed = this.catalog.parseRef(ref, "template");
    if (parsed.kind === "mixin") {
      throw new Error(`Reference "${ref}" points to a mixin, not a template.`);
    }

    const canonicalRef = `${parsed.kind}:${parsed.name}`;
    if (this.visitedTemplateRefs.has(canonicalRef)) {
      throw new Error(
        `Circular template inheritance detected: ${[...this.visitedTemplateRefs, canonicalRef].join(" -> ")}`,
      );
    }

    const item = await this.catalog.findItem(parsed.kind, parsed.name);
    if (!item) {
      throw new Error(`${parsed.kind} "${parsed.name}" not found.`);
    }

    const nextResolver = new TemplateResolver(this.catalog);
    nextResolver.visitedTemplateRefs.add(canonicalRef);
    for (const existingRef of this.visitedTemplateRefs) {
      nextResolver.visitedTemplateRefs.add(existingRef);
    }

    const raw = await loadYamlFile(item.path);
    return await nextResolver.resolveRaw(raw, item.path);
  }

  async loadMixinRef(ref: string): Promise<MixinTemplate> {
    const parsed = this.catalog.parseRef(ref, "mixin");
    if (parsed.kind !== "mixin") {
      throw new Error(`Reference "${ref}" points to a ${parsed.kind}, not a mixin.`);
    }

    const item = await this.catalog.findItem("mixin", parsed.name);
    if (!item) {
      throw new Error(`mixin "${parsed.name}" not found.`);
    }

    const raw = await loadYamlFile(item.path);
    const result = MixinTemplateSchema.safeParse(raw);
    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
      throw new Error(`Invalid mixin "${parsed.name}": ${issues}`);
    }

    return result.data;
  }

  async resolveRaw(raw: unknown, contextPath: string): Promise<TaskTemplate> {
    const composer = new TemplateComposer(
      (templateRef) => this.loadTemplateRef(templateRef),
      (mixinRef) => this.loadMixinRef(mixinRef),
    );
    return await composer.resolve(raw, contextPath);
  }
}
