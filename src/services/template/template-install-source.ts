import { basename, extname, resolve } from "node:path";
import { MixinTemplateSchema, TaskTemplateSchema } from "@templates/schema";
import { loadYamlFile } from "@templates/template-file";
import { parse as parseYaml } from "yaml";
import type {
  TemplateCatalog,
  TemplateCatalogItem,
  TemplateCatalogKind,
  TemplateCatalogScope,
} from "./template-catalog";

export type TemplateInstallScope = Extract<TemplateCatalogScope, "user" | "project">;

export interface TemplateInstallSourceOptions {
  type?: TemplateCatalogKind;
  scope: TemplateInstallScope;
  fetchContent: (url: string) => Promise<string>;
  onFetch?: (url: string) => void;
  onRawUrl?: (url: string) => void;
}

export interface ResolvedTemplateInstallSource {
  kind: TemplateCatalogKind;
  name: string;
  install: () => Promise<TemplateCatalogItem>;
  fromLabel?: string;
}

const TEMPLATE_TYPES: TemplateCatalogKind[] = ["template", "mixin"];

export async function resolveTemplateInstallSource(
  source: string,
  catalog: TemplateCatalog,
  options: TemplateInstallSourceOptions,
): Promise<ResolvedTemplateInstallSource> {
  if (source.startsWith("http://")) {
    throw new Error("Only HTTPS URLs are supported.");
  }

  if (source.startsWith("https://")) {
    return resolveRemoteInstallSource(source, catalog, options);
  }

  const kind = options.type ?? await detectKindFromFile(source);
  const ext = extname(resolve(source));
  return {
    kind,
    name: basename(resolve(source), ext),
    install: () => catalog.installFromFile(source, kind, options.scope),
  };
}

export function parseTemplateCatalogKind(value: string): TemplateCatalogKind {
  if (TEMPLATE_TYPES.includes(value as TemplateCatalogKind)) {
    return value as TemplateCatalogKind;
  }
  throw new Error(`Invalid type "${value}". Expected: ${TEMPLATE_TYPES.join(", ")}.`);
}

async function resolveRemoteInstallSource(
  source: string,
  catalog: TemplateCatalog,
  options: TemplateInstallSourceOptions,
): Promise<ResolvedTemplateInstallSource> {
  const urlFilename = basename(new URL(source).pathname);
  if (!urlFilename) {
    throw new Error("Could not determine template name from URL. The URL must end with a filename (e.g., /feature.yaml).");
  }

  const urlExt = extname(urlFilename);
  if (urlExt !== ".yaml" && urlExt !== ".yml") {
    throw new Error(`URL must point to a YAML file (.yaml or .yml). Got: "${urlFilename}"`);
  }

  const rawUrl = toGitHubRawUrl(source);
  const fetchUrl = rawUrl ?? source;
  if (rawUrl !== undefined) {
    options.onRawUrl?.(rawUrl);
  } else {
    options.onFetch?.(source);
  }

  const content = await options.fetchContent(fetchUrl);
  const kind = options.type ?? detectKindFromContent(content);
  return {
    kind,
    name: basename(urlFilename, urlExt),
    install: () => catalog.installFromContent(content, urlFilename, kind, options.scope),
    fromLabel: fetchUrl,
  };
}

function detectKindFromContent(content: string): TemplateCatalogKind {
  let raw: unknown;
  try {
    raw = parseYaml(content);
  } catch {
    throw new Error("Could not parse YAML content. Pass --type explicitly.");
  }
  return inferKind(raw);
}

async function detectKindFromFile(filePath: string): Promise<TemplateCatalogKind> {
  const raw = await loadYamlFile(filePath);
  return inferKind(raw);
}

function inferKind(raw: unknown): TemplateCatalogKind {
  const templateResult = TaskTemplateSchema.safeParse(raw);
  if (templateResult.success) return "template";

  const mixinResult = MixinTemplateSchema.safeParse(raw);
  if (mixinResult.success) return "mixin";

  if (typeof raw === "object" && raw !== null) {
    if ("filter" in raw) {
      const issues = templateResult.error.issues
        .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
        .join("\n");
      throw new Error(`Template validation failed:\n${issues}`);
    }
    if ("tasks" in raw) {
      const issues = mixinResult.error.issues
        .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
        .join("\n");
      throw new Error(`Mixin validation failed:\n${issues}`);
    }
  }

  throw new Error("Could not detect template type. Pass --type explicitly.");
}

function toGitHubRawUrl(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.hostname !== "github.com") return undefined;
  const match = parsed.pathname.match(/^\/([^/]+)\/([^/]+)\/blob\/(.+)$/);
  if (!match) return undefined;
  const [, owner, repo, rest] = match;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${rest}`;
}
