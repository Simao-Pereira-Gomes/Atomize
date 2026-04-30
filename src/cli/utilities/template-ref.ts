import { log } from "@clack/prompts";
import { TemplateCatalog } from "@services/template/template-catalog";

/**
 * Resolves a template argument to an absolute file path.
 * Accepts either a `template:<name>` catalog ref or a direct file path.
 * Throws for `mixin:` refs, which cannot be used standalone.
 */
export async function resolveTemplateRefToPath(arg: string): Promise<string> {
  if (arg.startsWith("mixin:")) {
    throw new Error(
      `"${arg}" is a mixin, not a template. Mixins cannot be used standalone — they are composed into templates via the mixins field.`,
    );
  }

  if (!arg.startsWith("template:")) {
    return arg;
  }

  const catalog = new TemplateCatalog();
  const item = await catalog.findByRef(arg);
  if (!item) {
    throw new Error(`"${arg}" not found. Run: atomize template list`);
  }

  const { overrides } = await catalog.listWithOverrides("template");
  const override = overrides.find(s => s.active.name === item.name && s.active.scope === item.scope);
  if (override) {
    log.warn(
      `Using ${item.scope}-scoped "${item.name}" — your ${override.overridden.scope}-scoped version is inactive. Run "atomize template list" to review.`,
    );
  }

  return item.path;
}
