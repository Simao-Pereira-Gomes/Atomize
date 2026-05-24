import { dirname, isAbsolute, resolve } from "node:path";
import { TemplateCompositionError } from "@utils/errors";

export interface CompositionFields {
  extendsRef: string | undefined;
  mixinRefs: string[];
}

export function isFilePath(ref: string): boolean {
  return ref.startsWith("./") || ref.startsWith("../") || isAbsolute(ref);
}

export function resolveTemplatePath(ref: string, contextPath: string): string {
  return isAbsolute(ref) ? ref : resolve(dirname(contextPath), ref);
}

export function parseCompositionFields(
  raw: unknown,
  contextPath: string,
): CompositionFields | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }

  const rawExtends = raw.extends;
  if (rawExtends !== undefined && typeof rawExtends !== "string") {
    throw new TemplateCompositionError(
      "`extends` must be a string template reference or template file path.",
      contextPath,
    );
  }

  const rawMixins = raw.mixins;
  if (rawMixins !== undefined) {
    if (!Array.isArray(rawMixins)) {
      throw new TemplateCompositionError(
        "`mixins` must be an array of mixin references or template file paths.",
        contextPath,
      );
    }

    const invalidIndex = rawMixins.findIndex((ref) => typeof ref !== "string");
    if (invalidIndex !== -1) {
      throw new TemplateCompositionError(
        `mixins[${invalidIndex}] must be a string mixin reference or template file path.`,
        contextPath,
      );
    }
  }

  return {
    extendsRef: rawExtends,
    mixinRefs: rawMixins ?? [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
