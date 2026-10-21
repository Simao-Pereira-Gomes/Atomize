import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Heading, Root, RootContent } from "mdast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import type { Plugin as VitePlugin } from "vite";
import { repositoryUrl, canonicalSections as sections, canonicalGuideUrl, schemaRoute } from "./documentation";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const renderingInputs = ["packages/website/astro.config.mjs", "packages/website/src/lib/canonical-sections.ts"];
export async function canonicalSourceDigest() {
  const files = new Set([...Object.values(sections).map(section => section.source), ...renderingInputs]);
  return Promise.all([...files].map(source => readFile(resolve(repositoryRoot, source), "utf8")));
}

function rewriteLink(url: string, source: string) {
  if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(url)) {
    const parsed = new URL(url, "https://atomize-cd9.pages.dev");
    if (parsed.hostname === "atomize-cd9.pages.dev" && ["/schema", schemaRoute.replace(/\/$/, "")].includes(parsed.pathname.replace(/\/$/, ""))) return `${schemaRoute}${parsed.hash}`;
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
