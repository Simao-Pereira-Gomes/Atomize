import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Heading, Root, RootContent } from "mdast";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import type { Plugin as VitePlugin } from "vite";
import { repositoryUrl, canonicalSections as sections, canonicalGuideUrl, schemaRoute } from "./documentation";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

/** Source edits must invalidate Astro's persisted Markdown rendering cache. */
export async function canonicalSourceDigest() {
  return Promise.all([...new Set(Object.values(sections).map(section => section.source))].map(source => readFile(resolve(repositoryRoot, source), "utf8")));
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
