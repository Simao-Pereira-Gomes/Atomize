import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSchemaTrees, type SchemaNode } from "@sppg2001/atomize-schema-reference";
import schema from "@sppg2001/atomize-schema-reference/schema.json";
import { parseHTML } from "linkedom";
import { templateGuideUrl } from "../src/lib/documentation";

async function htmlFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.filter(entry => entry.isDirectory()).map(entry => htmlFiles(resolve(directory, entry.name))));
  return [...entries.filter(entry => entry.isFile() && entry.name.endsWith(".html")).map(entry => resolve(directory, entry.name)), ...nested.flat()];
}

const schemaPermalinks = new Set<string>();
function collect(nodes: SchemaNode[]) {
  for (const node of nodes) { schemaPermalinks.add(node.permalink); collect(node.children); collect(node.alternatives); }
}
const trees = buildSchemaTrees(schema);
collect(trees.template); collect(trees.mixin);

/** Check the rendered site, including anchors handled by the hydrated Schema Reference. */
export async function checkInternalLinks(directory: string) {
  const files = await htmlFiles(directory);
  const pages = new Map(await Promise.all(files.map(async file => [file, parseHTML(await readFile(file, "utf8")).document] as const)));
  const failures: string[] = [];
  const external = new Set<string>();
  for (const [file, document] of pages) {
    const pagePath = relative(directory, file).replaceAll("\\", "/").replace(/index\.html$/, "");
    const base = new URL(pagePath, "https://docs.invalid/");
    for (const element of document.querySelectorAll("a[href], img[src], script[src], link[href]")) {
      const value = element.getAttribute(element.hasAttribute("src") ? "src" : "href");
      if (!value || /^(?:mailto:|tel:|data:|javascript:)/i.test(value)) continue;
      const url = new URL(value, base);
      if (url.origin !== base.origin) {
        if (element.localName === "a" && /^https?:$/.test(url.protocol)) { url.hash = ""; external.add(url.href); }
        continue;
      }
      const path = resolve(directory, `.${decodeURIComponent(url.pathname)}`);
      if (relative(directory, path).startsWith("..")) { failures.push(`${pagePath}: outside output: ${value}`); continue; }
      const candidates = [path, resolve(path, "index.html"), `${path}.html`];
      let target: string | undefined;
      for (const candidate of candidates) {
        if (await stat(candidate).then(info => info.isFile()).catch(() => false)) { target = candidate; break; }
      }
      if (!target) { failures.push(`${pagePath}: missing target: ${value}`); continue; }
      if (url.hash) {
        const anchor = decodeURIComponent(url.hash.slice(1));
        const dynamicSchemaAnchor = /^\/schema\/?$/.test(url.pathname) && schemaPermalinks.has(anchor);
        const targetDocument = pages.get(target);
        const namedAnchor = [...(targetDocument?.querySelectorAll("a[name]") ?? [])].some(element => element.getAttribute("name") === anchor);
        if (!dynamicSchemaAnchor && !targetDocument?.getElementById(anchor) && !namedAnchor) failures.push(`${pagePath}: missing anchor: ${value}`);
      }
    }
  }
  return { failures, external, pages };
}

async function checkDocs() {
  const directory = fileURLToPath(new URL("../dist/", import.meta.url));
  const { failures, external, pages } = await checkInternalLinks(directory);
  const guide = pages.get(resolve(directory, "reference/templates/composition/index.html"));
  const schemaPage = pages.get(resolve(directory, "schema/index.html"));
  if (guide?.querySelector("h1")?.textContent !== "Compose Templates") failures.push("Composition guide title is missing");
  for (const anchor of ["inheritance-extends", "mixins-mixins", "resolution-order", "compatibility"]) {
    if (!guide?.getElementById(anchor)) failures.push(`Composition section is missing: ${anchor}`);
  }
  if (!guide?.querySelector('a[href="/schema#template.extends"]') || !guide?.querySelector('a[href="/schema#template.mixins"]')) failures.push("Guide is missing field-specific Schema Reference links");
  if (!guide?.querySelector("[data-pagefind-body]") || !(await stat(resolve(directory, "pagefind/pagefind.js")).catch(() => false))) failures.push("Documentation search index or indexed guide is missing");
  if (!guide?.getElementById("starlight__search")) failures.push("Production search UI is missing; a development-only notice must not ship");
  if (!schemaPage?.querySelector(".schema-reference")) failures.push("Shared Schema Reference is missing");
  if (!schemaPage?.querySelector(`a[href="${templateGuideUrl("inheritance-extends")}"]`)) failures.push("Schema Reference is missing its composition-guide link");
  if (!guide?.querySelector(".development-notice") || !guide?.querySelector(".documentation-build time")) failures.push("Development notice or build provenance is missing");
  if (failures.length) throw new Error(failures.join("\n"));
  console.log(`Documentation checks passed: ${pages.size} HTML pages, internal links, anchors, guide, schema, and search index.`);
  if (process.argv.includes("--external")) {
    const queue = [...external];
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (queue.length) {
        const link = queue.shift();
        if (!link) break;
        try {
          const response = await fetch(link, { method: "HEAD", signal: AbortSignal.timeout(10000), redirect: "follow" });
          if (!response.ok) console.warn(`External link advisory (${response.status}): ${link}`);
        } catch (error) { console.warn(`External link advisory: ${link}: ${String(error)}`); }
      }
    }));
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await checkDocs();
