import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSchemaTrees, type SchemaNode } from "@sppg2001/atomize-schema-reference";
import schema from "@sppg2001/atomize-schema-reference/schema.json";
import { parseHTML } from "linkedom";
import { schemaRoute, templateGuideUrl } from "../src/lib/documentation";

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
        const dynamicSchemaAnchor = ["/schema", schemaRoute.replace(/\/$/, "")].includes(url.pathname.replace(/\/$/, "")) && schemaPermalinks.has(anchor);
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
  const schemaPage = pages.get(resolve(directory, `.${schemaRoute}index.html`));
  const legacySchema = pages.get(resolve(directory, "schema/index.html"));
  if (!legacySchema?.querySelector(`a[href="${schemaRoute}"]`) || !legacySchema.querySelector("script")?.textContent?.includes("window.location.hash")) failures.push("Legacy Schema Reference must preserve field fragments when forwarding");
  const redirects = await readFile(resolve(directory, "_redirects"), "utf8");
  if (!redirects.includes(`/schema ${schemaRoute} 301`) || !redirects.includes(`/schema/ ${schemaRoute} 301`)) failures.push("Cloudflare Schema Reference compatibility redirects are missing");
  const home = pages.get(resolve(directory, "index.html"));
  const quickstart = pages.get(resolve(directory, "getting-started/cli/index.html"));
  const releases = pages.get(resolve(directory, "releases/index.html"));
  const studio = pages.get(resolve(directory, "getting-started/studio/index.html"));
  if (!home?.querySelector('.onboarding-paths a[href="/getting-started/vscode/"]')) failures.push("Home must link to the VS Code quickstart");
  for (const [route, title] of [["getting-started/vscode", "Try Atomize in VS Code"], ["vscode/author-yaml", "Author Atomize YAML in VS Code"], ["vscode/inspect-templates", "Inspect Templates in VS Code"], ["vscode/settings-recovery", "VS Code validation, settings, and recovery"]]) {
    const page = pages.get(resolve(directory, `${route}/index.html`));
    if (page?.querySelector("h1")?.textContent !== title || !page?.querySelector("[data-pagefind-body]") || !page?.querySelector(".development-notice")) failures.push(`VS Code page, metadata, or search indexing is missing: ${route}`);
  }
  for (const [route, image] of [["getting-started/vscode", "mock-preview"], ["vscode/author-yaml", "template-authoring"]]) {
    for (const mode of ["light", "dark"]) {
      const picture = pages.get(resolve(directory, `${route}/index.html`))?.querySelector(`img.themed-screenshot-${mode}[src="/vscode/${image}-${mode}.png"]`);
      if ((picture?.getAttribute("alt")?.length ?? 0) < 30) failures.push(`VS Code ${mode} screenshot or useful alt text is missing: ${image}`);
    }
  }
  if (!home?.querySelector('.onboarding-paths a[href="/getting-started/studio/"]')) failures.push("Home must link to the Studio quickstart");
  for (const [route, title] of [["getting-started/studio", "Try Atomize Studio offline"], ["studio/author-templates", "Author Templates in Studio"], ["studio/open-save", "Open, save, and export"], ["studio/settings-recovery", "Studio settings and recovery"]]) {
    const page = pages.get(resolve(directory, `${route}/index.html`));
    if (page?.querySelector("h1")?.textContent !== title || !page?.querySelector("[data-pagefind-body]") || !page?.querySelector(".development-notice")) failures.push(`Studio page, metadata, or search indexing is missing: ${route}`);
  }
  for (const [route, image] of [["getting-started/studio", "mock-preview"], ["studio/author-templates", "template-authoring"]]) {
    for (const mode of ["light", "dark"]) {
      const picture = pages.get(resolve(directory, `${route}/index.html`))?.querySelector(`img.themed-screenshot-${mode}[src="/studio/${image}-${mode}.png"]`);
      if ((picture?.getAttribute("alt")?.length ?? 0) < 30) failures.push(`Studio ${mode} screenshot or useful alt text is missing: ${image}`);
    }
  }
  if (!studio?.querySelector('a[href="/studio/author-templates/#choose-a-starting-path"]') || !studio?.querySelector('a[href="/studio/settings-recovery/#global-settings"]')) failures.push("Studio quickstart is missing working authoring and connection paths");
  if (home?.querySelector("h1")?.textContent !== "Turn Stories into repeatable Tasks" || home.querySelector('meta[http-equiv="refresh"]')) failures.push("Documentation home is missing or still redirects");
  const paths = home?.querySelectorAll(".onboarding-paths > a");
  if (paths?.length !== 3 || !home?.querySelector('.onboarding-paths a[href="/getting-started/cli/"]')) failures.push("Home must offer three working onboarding paths");
  if (quickstart?.querySelector("h1")?.textContent !== "Try Atomize from the CLI") failures.push("CLI quickstart is missing");
  const commands = [...(quickstart?.querySelectorAll("pre") ?? [])].map(block => block.textContent).join("\n");
  for (const command of ["npm install -g @sppg2001/atomize", "atomize --version", "atomize validate template:backend-api", "atomize preview template:backend-api --mock-story", "Add password reset", "estimationSummary.totalTaskEstimation: 8"]) {
    if (!commands.includes(command)) failures.push(`CLI quickstart is missing its verified command or expected result: ${command}`);
  }
  for (const tag of ["studio-v0", "vscode-v0", "v5"]) {
    if (!releases?.querySelector(`a[href="https://github.com/Simao-Pereira-Gomes/Atomize/releases?q=tag%3A${tag}"]`)) failures.push(`Release notes destination is missing: ${tag}`);
  }
  for (const [name, page] of [["home", home], ["CLI quickstart", quickstart], ["release notes", releases]] as const) {
    if (!page?.querySelector("[data-pagefind-body]") || !page?.querySelector(".development-notice") || !page?.querySelector(".documentation-build time")) failures.push(`${name}: search indexing, development notice, or provenance is missing`);
  }
  if (guide?.querySelector("h1")?.textContent !== "Compose Templates") failures.push("Composition guide title is missing");
  for (const [path, document] of pages) {
    if (document.querySelector(".documentation-header") && !document.querySelector('atomize-sidebar-toggle button[aria-controls="starlight__sidebar"]')) failures.push(`${path}: desktop navigation toggle is missing`);
    if (document.querySelector('a[href*="github.com/Simao-Pereira-Gomes/Atomize/edit/"]')) failures.push(`${path}: public editing link must not be published`);
    const content = document.body?.cloneNode(true) as HTMLElement | undefined;
    content?.querySelectorAll("script, style, noscript").forEach(element => { element.remove(); });
    if (content?.textContent?.includes("\u2014")) failures.push(`${path}: website content must not contain em dashes`);
  }
  for (const anchor of ["inheritance-extends", "mixins-mixins", "resolution-order", "compatibility"]) {
    if (!guide?.getElementById(anchor)) failures.push(`Composition section is missing: ${anchor}`);
  }
  if (!guide?.querySelector(`a[href="${schemaRoute}#template.extends"]`) || !guide?.querySelector(`a[href="${schemaRoute}#template.mixins"]`)) failures.push("Guide is missing field-specific Schema Reference links");
  if (!guide?.querySelector("[data-pagefind-body]") || !(await stat(resolve(directory, "pagefind/pagefind.js")).catch(() => false))) failures.push("Documentation search index or indexed guide is missing");
  if (!guide?.getElementById("starlight__search")) failures.push("Production search UI is missing; a development-only notice must not ship");
  if (!schemaPage?.querySelector(".schema-reference")) failures.push("Shared Schema Reference is missing");
  if (!schemaPage?.querySelector(".not-content .schema-reference")) failures.push("Schema Reference controls must be isolated from article typography");
  if (!schemaPage?.querySelector(".documentation-header") || !schemaPage?.querySelector("nav.sidebar") || !schemaPage?.getElementById("starlight__search") || !schemaPage?.querySelector(".development-notice") || !schemaPage?.querySelector(".documentation-build time")) failures.push("Schema Reference must use the shared portal layout, navigation, search, and provenance");
  if (!schemaPage?.querySelector(`nav.sidebar a[href="${schemaRoute}"][aria-current="page"]`)) failures.push("Schema Reference sidebar link must be selected");
  if (!schemaPage?.querySelector(`nav.sidebar a[href="${schemaRoute}"]`)?.closest("details")?.querySelector("summary")?.textContent?.includes("Templates")) failures.push("Schema Reference must be grouped inside Templates");
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
