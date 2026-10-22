import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Heading, Parent, Root, RootContent } from "mdast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import type { Plugin as VitePlugin } from "vite";
import { repositoryUrl, canonicalSections as sections, canonicalGuideUrl, schemaRoute } from "./documentation";
import { features, isPublished } from "./features";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const renderingInputs = ["packages/website/astro.config.mjs", "packages/website/src/lib/canonical-sections.ts", "packages/website/src/lib/features.ts", "packages/website/src/lib/documentation.ts"];
export async function canonicalSourceDigest() {
  const files = new Set([...Object.values(sections).map(section => section.source), ...renderingInputs]);
  const examples = (await readdir(resolve(repositoryRoot, "examples"))).filter(name => /\.ya?ml$/.test(name)).sort().map(name => `examples/${name}`);
  return [JSON.stringify(features), ...await Promise.all([...files, ...examples].map(source => readFile(resolve(repositoryRoot, source), "utf8")))];
}

function rewriteLink(url: string, source: string) {
  if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(url)) {
    const parsed = new URL(url, "https://atomize-docs.pages.dev");
    if (parsed.hostname === "atomize-docs.pages.dev" && ["/schema", schemaRoute.replace(/\/$/, "")].includes(parsed.pathname.replace(/\/$/, ""))) return `${schemaRoute}${parsed.hash}`;
    return url;
  }
  const [path, fragment = ""] = url.split("#");
  const target = path ? relative(repositoryRoot, resolve(repositoryRoot, dirname(source), path)).replaceAll("\\", "/") : source;
  if (target.startsWith("packages/website/public/")) return `/${target.slice("packages/website/public/".length)}${fragment ? `#${fragment}` : ""}`;
  return canonicalGuideUrl(target, fragment);
}

const themedPicture = /^<picture>\s*<source\s+media="\(prefers-color-scheme:\s*dark\)"\s+srcset="([^"]+)"\s*\/?>\s*<img\s+alt="([^"]+)"\s+src="([^"]+)"\s*\/?>\s*<\/picture>$/;

/**
 * GitHub picks a canonical screenshot from the reader's colour scheme; the portal's own theme
 * selector can differ from it, so both variants are published and CSS shows the selected one.
 */
function themedScreenshots(node: RootContent): RootContent | undefined {
  if (node.type !== "html" || !node.value.trim().startsWith("<picture")) return undefined;
  const match = themedPicture.exec(node.value.trim());
  if (!match) throw Error(`Canonical <picture> must contain one dark <source> and one <img alt src>: ${node.value.trim()}`);
  const [, dark, alt, light] = match;
  const image = (url: string, theme: "light" | "dark") => ({
    type: "image" as const, url, alt,
    data: { hProperties: { className: ["themed-screenshot", `themed-screenshot-${theme}`], loading: "lazy", decoding: "async" } },
  });
  return { type: "paragraph", children: [image(light, "light"), image(dark, "dark")] };
}

function sectionMarker(node: RootContent) {
  return node.type === "html" ? /^<!--\s*atomize:section\s+([\w-]+)\s*-->$/.exec(node.value.trim())?.[1] : undefined;
}

function isSectionEnd(node: RootContent) {
  return node.type === "html" && /^<!--\s*\/atomize:section\s*-->$/.test(node.value.trim());
}

const featureStart = /^<!--\s*atomize:feature\s+(!?)([\w-]+)\s*-->$/;
const featureEnd = /^<!--\s*\/atomize:feature\s*-->$/;

type Published = (feature: string) => boolean;

/**
 * Applies feature markers (see features.ts): block regions are kept or removed whole, an inline
 * start and end pair keeps or removes the words between them, and a lone inline start marker
 * keeps or removes the list item, table row, or paragraph that holds it.
 */
export function applyFeatureMarkers(tree: Root, fail: (message: string) => never = message => { throw new Error(message); }, published: Published = isPublished) {
  const shown = (negated: string, feature: string) => published(feature) !== (negated === "!");
  applyFeatureSpans(tree, shown);
  const scoped = new Set(["listItem", "tableRow", "paragraph", "heading"]);
  const filter = (parent: Parent) => {
    const kept: RootContent[] = [];
    let region: boolean | undefined;
    for (const child of parent.children as RootContent[]) {
      const value = child.type === "html" ? child.value.trim() : "";
      const start = featureStart.exec(value);
      if (!start && /^<!--\s*\/?atomize:feature/.test(value) && !featureEnd.test(value)) fail(`Feature markers need a blank line around them, and an inline marker cannot start a line: ${value.split("\n")[0]}`);
      if (start) {
        if (region !== undefined) fail(`Nested feature marker: ${value}`);
        region = shown(start[1], start[2]);
        continue;
      }
      if (featureEnd.test(value)) {
        if (region === undefined) fail("Feature end marker without a start");
        region = undefined;
        continue;
      }
      if (region === false) continue;
      if (scoped.has(child.type)) {
        const marker = inlineMarker(child as Parent);
        if (marker && !shown(marker[1], marker[2])) continue;
      }
      if ("children" in child) filter(child as Parent);
      kept.push(child);
    }
    if (region !== undefined) fail("Unclosed feature marker");
    parent.children = kept as Parent["children"];
  };
  filter(tree);
}

/** The first inline feature marker directly inside a scoped node (not inside a nested scoped node), removed from the tree. */
const inlineParents = new Set(["paragraph", "tableCell", "heading"]);

/** Inline start and end markers in the same run of text keep or remove just the words between them. */
function applyFeatureSpans(tree: Root, shown: (negated: string, feature: string) => boolean) {
  visit(tree, node => {
    if (!("children" in node) || !["paragraph", "tableCell", "heading", "emphasis", "strong", "link"].includes(node.type)) return;
    const children = (node as Parent).children as RootContent[];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      const start = child.type === "html" ? featureStart.exec(child.value.trim()) : null;
      if (!start) continue;
      const end = children.findIndex((candidate, j) => j > i && candidate.type === "html" && featureEnd.test(candidate.value.trim()));
      if (end < 0) continue;
      children.splice(i, end - i + 1, ...(shown(start[1], start[2]) ? children.slice(i + 1, end) : []));
      i--;
    }
  });
}

function inlineMarker(node: Parent): RegExpExecArray | undefined {
  const search = (parent: Parent): RegExpExecArray | undefined => {
    for (const [index, child] of (parent.children as RootContent[]).entries()) {
      if (child.type === "html" && inlineParents.has(parent.type)) {
        const match = featureStart.exec(child.value.trim());
        if (match) {
          parent.children.splice(index, 1);
          return match;
        }
      }
      if (child.type === "list" || child.type === "listItem" || child.type === "tableRow") continue;
      if ("children" in child) {
        const match = search(child as Parent);
        if (match) return match;
      }
    }
    return undefined;
  };
  return search(node);
}

const exampleMarker = /^<!--\s*atomize:example\s+([\w.-]+\.ya?ml)\s*-->$/;

/** Replaces `<!-- atomize:example <file> -->` with that file from `examples/` as a YAML code block. */
async function insertExampleFiles(tree: Root, fail: (message: string) => never) {
  const markers: { parent: Parent; index: number; name: string }[] = [];
  visit(tree, "html", (node, index, parent) => {
    const name = exampleMarker.exec(node.value.trim())?.[1];
    if (name && parent && index !== undefined) markers.push({ parent: parent as Parent, index, name });
  });
  for (const { parent, index, name } of markers.reverse()) {
    const value = await readFile(resolve(repositoryRoot, "examples", name), "utf8").catch(() => fail(`Missing example file: examples/${name}`));
    parent.children.splice(index, 1, { type: "code", lang: "yaml", meta: `title="examples/${name}"`, value: value.trimEnd() } as RootContent);
  }
}

/** Include a named section as Markdown AST, before highlighting, headings, and search indexing. */
const canonicalSections: Plugin<[], Root> = function () {
  return async (tree, file) => {
    for (let i = 0; i < tree.children.length; i++) {
      const node = tree.children[i];
      if (node.type !== "html") continue;
      const match = /^<!--\s*atomize:include\s+([\w-]+)\s*-->$/.exec(node.value.trim());
      if (!match) continue;
      const section = sections[match[1] as keyof typeof sections];
      if (!section) throw file.message(`Unknown canonical section: ${match[1]}`);
      const source = await readFile(resolve(repositoryRoot, section.source), "utf8");
      const sourceTree = this.parse(source) as Root;
      const start = sourceTree.children.findIndex(child => sectionMarker(child) === match[1]);
      if (start < 0) throw file.message(`Missing canonical section marker ${match[1]} in ${section.source}`);
      const end = sourceTree.children.findIndex((child, index) => index > start && (sectionMarker(child) !== undefined || isSectionEnd(child)));
      if (end < 0 || !isSectionEnd(sourceTree.children[end])) throw file.message(`Unclosed canonical section ${match[1]} in ${section.source}`);
      if (sourceTree.children.some((child, index) => index > end && sectionMarker(child) === match[1])) throw file.message(`Duplicate canonical section ${match[1]} in ${section.source}`);
      const included: Root = { type: "root", children: sourceTree.children.slice(start + 1, end) };
      const shallowest = Math.min(...included.children.flatMap(child => child.type === "heading" ? [child.depth] : []));
      visit(included, "heading", child => { child.depth = Math.min(6, child.depth - shallowest + 2) as Heading["depth"]; });
      included.children = included.children.map(child => themedScreenshots(child) ?? child);
      visit(included, child => {
        if (child.type === "link" || child.type === "image" || child.type === "definition") {
          child.url = rewriteLink(child.url, section.source);
          if (child.type === "image") child.url = child.url.replace(`${repositoryUrl}/blob/main/`, `${repositoryUrl}/raw/refs/heads/main/`);
        }
      });
      tree.children.splice(i, 1, ...included.children as RootContent[]);
      i += included.children.length - 1;
    }
    await insertExampleFiles(tree, message => { throw file.message(message); });
    applyFeatureMarkers(tree, message => { throw file.message(message); });
  };
};
export default canonicalSections;

export function watchCanonicalGuides(): VitePlugin {
  const files = new Set(Object.values(sections).map(section => resolve(repositoryRoot, section.source)));
  return {
    name: "atomize-canonical-guides",
    configureServer(server) {
      server.watcher.add([...files]);
      server.watcher.on("change", path => {
        if (files.has(path)) void server.restart();
      });
    },
  };
}
