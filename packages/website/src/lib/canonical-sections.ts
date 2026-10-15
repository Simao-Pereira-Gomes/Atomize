import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import GithubSlugger from "github-slugger";
import type { Heading, Root, RootContent } from "mdast";
import { toString as markdownText } from "mdast-util-to-string";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import type { Plugin as VitePlugin } from "vite";
import { repositoryUrl, canonicalSections as sections, templateGuideUrl } from "./documentation";

const repositoryRoot = fileURLToPath(new URL("../../../../", import.meta.url));

/** Source edits must invalidate Astro's persisted Markdown rendering cache. */
export async function canonicalSourceDigest() {
  return Promise.all([...new Set(Object.values(sections).map(section => section.source))].map(source => readFile(resolve(repositoryRoot, source), "utf8")));
}

function rewriteLink(url: string, source: string) {
  if (/^(?:[a-z][\w+.-]*:|\/\/)/i.test(url)) {
    const parsed = new URL(url, "https://atomize-cd9.pages.dev");
    if (parsed.hostname === "atomize-cd9.pages.dev" && parsed.pathname === "/schema") return `/schema${parsed.hash}`;
    return url;
  }
  const [path, fragment = ""] = url.split("#");
  const target = path ? relative(repositoryRoot, resolve(repositoryRoot, dirname(source), path)).replaceAll("\\", "/") : source;
  if (target === "docs/Template-Reference.md" && fragment) return templateGuideUrl(fragment);
  return `${repositoryUrl}/blob/main/${target}${fragment ? `#${fragment}` : ""}`;
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
      const slugger = new GithubSlugger();
      let heading: Heading | undefined;
      let start = -1;
      let end = sourceTree.children.length;
      for (let index = 0; index < sourceTree.children.length; index++) {
        const candidate = sourceTree.children[index];
        if (candidate.type !== "heading") continue;
        const slug = slugger.slug(markdownText(candidate));
        if (start < 0 && slug === section.section) { start = index + 1; heading = candidate; }
        else if (heading && candidate.depth <= heading.depth) { end = index; break; }
      }
      if (!heading) throw file.message(`Missing canonical section ${section.source}#${section.section}`);
      const parentDepth = heading.depth;
      const included: Root = { type: "root", children: sourceTree.children.slice(start, end) };
      while (included.children.at(-1)?.type === "thematicBreak") included.children.pop();
      visit(included, "heading", child => { child.depth = Math.max(2, child.depth - parentDepth + 1) as Heading["depth"]; });
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

/** A canonical source edit must invalidate the compiled content collection in dev, too. */
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
