import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSchemaTrees, type SchemaNode } from "@sppg2001/atomize-schema-reference";
import schema from "@sppg2001/atomize-schema-reference/schema.json";
import { parseHTML } from "linkedom";
import { exampleAnchor, schemaRoute, templateGuideUrl } from "../src/lib/documentation";
import { features, isHiddenPage } from "../src/lib/features";

async function htmlFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.filter(entry => entry.isDirectory()).map(entry => htmlFiles(resolve(directory, entry.name))));
  return [...entries.filter(entry => entry.isFile() && entry.name.endsWith(".html")).map(entry => resolve(directory, entry.name)), ...nested.flat()];
}

const schemaPermalinks = new Set<string>();
const schemaGuideAnchors = new Set<string>();
function collect(nodes: SchemaNode[]) {
  for (const node of nodes) {
    schemaPermalinks.add(node.permalink);
    if (node.guideAnchor) schemaGuideAnchors.add(node.guideAnchor);
    collect(node.children);
    collect(node.alternatives);
  }
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
  for (const [route, title] of [["vscode/generate", "Generate Tasks in VS Code"], ["vscode/project-data", "Browse fields and queries in VS Code"]]) {
    const page = pages.get(resolve(directory, `${route}/index.html`));
    if (page?.querySelector("h1")?.textContent !== title || !page?.querySelector("[data-pagefind-body]") || !page?.querySelector(".development-notice")) failures.push(`VS Code page, metadata, or search indexing is missing: ${route}`);
  }
  const vscodeGenerate = pages.get(resolve(directory, "vscode/generate/index.html"));
  for (const anchor of ["preview-against-a-real-story", "generate-tasks", "choose-stories", "what-connects-and-what-creates-tasks"]) {
    if (!vscodeGenerate?.getElementById(anchor)) failures.push(`VS Code Generate guide is missing: ${anchor}`);
  }
  if (!vscodeGenerate?.querySelector('a[href="/connections/profiles/#vs-code"]') || !pages.get(resolve(directory, "getting-started/vscode/index.html"))?.querySelector('a[href="/vscode/generate/"]')) failures.push("VS Code Generate guide must connect to profile setup and onboarding");
  for (const anchor of ["atomize-browse-fields", "atomize-browse-queries"]) {
    if (!pages.get(resolve(directory, "vscode/project-data/index.html"))?.getElementById(anchor)) failures.push(`VS Code browser reference is missing: ${anchor}`);
  }
  for (const [route, image] of [["getting-started/vscode", "mock-preview"], ["vscode/author-yaml", "template-authoring"], ["vscode/generate", "generate-dry-run"], ["vscode/generate", "generate-confirmation"]]) {
    for (const mode of ["light", "dark"]) {
      const picture = pages.get(resolve(directory, `${route}/index.html`))?.querySelector(`img.themed-screenshot-${mode}[src="/vscode/${image}-${mode}.png"]`);
      if ((picture?.getAttribute("alt")?.length ?? 0) < 30) failures.push(`VS Code ${mode} screenshot or useful alt text is missing: ${image}`);
    }
  }
  if (features.studio) {
    if (!home?.querySelector('.onboarding-paths a[href="/getting-started/studio/"]')) failures.push("Home must link to the Studio quickstart");
    for (const [route, title] of [["getting-started/studio", "Try Atomize Studio offline"], ["studio/author-templates", "Author Templates in Studio"], ["studio/open-save", "Open, save, and export"], ["studio/settings-recovery", "Studio settings and recovery"]]) {
      const page = pages.get(resolve(directory, `${route}/index.html`));
      if (page?.querySelector("h1")?.textContent !== title || !page?.querySelector("[data-pagefind-body]") || !page?.querySelector(".development-notice")) failures.push(`Studio page, metadata, or search indexing is missing: ${route}`);
    }
    for (const [route, title] of [["studio/generate", "Generate Tasks in Studio"], ["studio/project-data", "Use project data in Studio"]]) {
      const page = pages.get(resolve(directory, `${route}/index.html`));
      if (page?.querySelector("h1")?.textContent !== title || !page?.querySelector("[data-pagefind-body]") || !page?.querySelector(".development-notice")) failures.push(`Studio page, metadata, or search indexing is missing: ${route}`);
    }
    const studioGenerate = pages.get(resolve(directory, "studio/generate/index.html"));
    for (const anchor of ["generate-tasks-from-real-stories", "follow-progress-or-cancel", "review-results-and-recover"]) {
      if (!studioGenerate?.getElementById(anchor)) failures.push(`Studio Generate guide is missing: ${anchor}`);
    }
    if (!studioGenerate?.querySelector('a[href="/connections/profiles/#atomize-studio"]') || !studio?.querySelector('a[href="/studio/generate/"]')) failures.push("Studio Generate guide must connect to profile setup and onboarding");
    if (!pages.get(resolve(directory, "studio/project-data/index.html"))?.getElementById("work-project-setting")) failures.push("Studio Work Project Setting is missing");
    for (const [route, image] of [["getting-started/studio", "mock-preview"], ["studio/author-templates", "template-authoring"], ["studio/generate", "live-execution-confirmation"]]) {
      for (const mode of ["light", "dark"]) {
        const picture = pages.get(resolve(directory, `${route}/index.html`))?.querySelector(`img.themed-screenshot-${mode}[src="/studio/${image}-${mode}.png"]`);
        if ((picture?.getAttribute("alt")?.length ?? 0) < 30) failures.push(`Studio ${mode} screenshot or useful alt text is missing: ${image}`);
      }
    }
    if (!studio?.querySelector('a[href="/studio/author-templates/#choose-a-starting-path"]') || !studio?.querySelector('a[href="/studio/settings-recovery/#global-settings"]')) failures.push("Studio quickstart is missing working authoring and connection paths");
  }
  for (const [route, title] of [["connections", "Connect Azure DevOps"], ["connections/profiles", "Set up Connection Profiles"], ["connections/automation", "Use profiles in scripts and CI"], ["connections/troubleshooting", "Fix connection problems"]]) {
    const page = pages.get(resolve(directory, `${route}/index.html`));
    if (page?.querySelector("h1")?.textContent !== title || !page?.querySelector("[data-pagefind-body]") || !page?.querySelector(".development-notice")) failures.push(`Connection page, metadata, or search indexing is missing: ${route}`);
  }
  const connections = pages.get(resolve(directory, "connections/index.html"));
  const profiles = pages.get(resolve(directory, "connections/profiles/index.html"));
  const connectionFailures = pages.get(resolve(directory, "connections/troubleshooting/index.html"));
  for (const scope of ["Work Items", "Project and Team", "Wiki"]) {
    if (![...(connections?.querySelectorAll("table") ?? [])].some(table => table.textContent?.includes("PAT scope") && table.textContent.includes(scope))) failures.push(`Connection permissions are missing the ${scope} scope`);
  }
  for (const anchor of ["atomize-cli", ...(features.studio ? ["atomize-studio", "shared-between-the-cli-and-atomize-studio"] : []), "vs-code", "vs-code-profiles", "rotating-tokens"]) {
    if (!profiles?.getElementById(anchor)) failures.push(`Connection Profile setup is missing: ${anchor}`);
  }
  for (const mode of ["light", "dark"]) {
    for (const tool of features.studio ? ["studio", "vscode"] : ["vscode"]) {
      const picture = profiles?.querySelector(`img.themed-screenshot-${mode}[src="/${tool}/connection-profiles-${mode}.png"]`);
      if ((picture?.getAttribute("alt")?.length ?? 0) < 30) failures.push(`${tool} ${mode} Connection Profile screenshot or useful alt text is missing`);
    }
  }
  for (const anchor of ["authentication-failed-401-unauthorized", "project-details-or-grounded-choices-do-not-load", ...(features.studio ? ["studio-says-a-profile-uses-cli-insecure-storage"] : []), "vs-code-says-no-stored-token-for-profile", "permission-errors"]) {
    if (!connectionFailures?.getElementById(anchor)) failures.push(`Connection recovery is missing: ${anchor}`);
  }
  if (!quickstart?.querySelector('a[href="/connections/profiles/"]') || (features.studio && !studio?.querySelector('a[href="/connections/profiles/#atomize-studio"]')) || !pages.get(resolve(directory, "getting-started/vscode/index.html"))?.querySelector('a[href="/connections/profiles/#vs-code"]')) failures.push("Quickstarts must lead to their connection setup");
  for (const [route, title] of [["cli/generate", "Generate Tasks from the CLI"], ["cli/automation", "Automate the CLI"], ["cli/reference", "CLI reference"], ["cli/reference/auth", "auth commands"], ["cli/reference/generate", "generate command"], ["cli/reference/preview-validate", "preview and validate commands"], ["cli/reference/templates", "template commands"], ["cli/reference/fields-queries", "fields and queries commands"]]) {
    const page = pages.get(resolve(directory, `${route}/index.html`));
    if (page?.querySelector("h1")?.textContent !== title || !page?.querySelector("[data-pagefind-body]") || !page?.querySelector(".development-notice")) failures.push(`CLI page, metadata, or search indexing is missing: ${route}`);
  }
  const cliGenerate = pages.get(resolve(directory, "cli/generate/index.html"))?.body?.textContent ?? "";
  for (const text of ["Dry run complete. No tasks were created.", "This will CREATE tasks in your work tracking system.", "Refusing live execution without confirmation", "Created 6 tasks for 1 story."]) {
    if (!cliGenerate.includes(text)) failures.push(`CLI generate guide is missing its transcript: ${text}`);
  }
  const reference = (route: string) => pages.get(resolve(directory, `cli/reference/${route}/index.html`));
  for (const [route, anchors] of [["auth", ["auth-add", "auth-list", "auth-use", "auth-remove", "auth-test", "auth-rotate"]], ["generate", ["generate"]], ["preview-validate", ["preview", "validate"]], ["templates", ["template-create", "template-improve", "template-list", "template-install", "template-remove", "template-resolve", "template-metadata", "template-migrate"]], ["fields-queries", ["fields-list", "queries-list"]]] as const) {
    for (const anchor of anchors) if (!reference(route)?.getElementById(anchor)) failures.push(`CLI reference is missing ${anchor} on ${route}`);
  }
  if (!quickstart?.querySelector('a[href="/cli/generate/"]')) failures.push("CLI quickstart must lead to connected generation");
  for (const [route, title, anchors] of [
    ...(features.studio ? [["studio/ai", "Draft and improve with AI in Studio", ["before-you-start", "ai-drafting", "improve-with-ai", "reference-documents"]] as const] : []),
    ["vscode/ai", "Draft and improve with AI in VS Code", ["before-you-start", "atomize-draft-template-with-ai", "atomize-improve-template-with-ai", "reference-documents"]],
    ["cli/ai", "Draft and improve with AI from the CLI", ["before-you-start", "draft-a-template", "reference-documents", "review-the-draft", "template-improve"]],
  ] as const) {
    const page = pages.get(resolve(directory, `${route}/index.html`));
    if (page?.querySelector("h1")?.textContent !== title || !page?.querySelector("[data-pagefind-body]") || !page?.querySelector(".development-notice")) failures.push(`AI page, metadata, or search indexing is missing: ${route}`);
    for (const anchor of anchors) if (!page?.getElementById(anchor)) failures.push(`AI guide is missing ${anchor} on ${route}`);
    if (!page?.querySelector('a[href="/connections/profiles/#ai-drafting-copilot-session"]')) failures.push(`AI guide must explain the Copilot Session: ${route}`);
    if (page?.body?.textContent?.includes("GitHub Models")) failures.push(`AI guide must not mention retired GitHub Models setup: ${route}`);
  }
  if (!pages.get(resolve(directory, "cli/reference/templates/index.html"))?.querySelector('a[href="/cli/ai/#template-improve"]')) failures.push("template reference must point to template improve");
  if (!pages.get(resolve(directory, "connections/profiles/index.html"))?.body?.textContent?.includes("gh auth login")) failures.push("Copilot Session must explain sign-in recovery");
  if (home?.querySelector("h1")?.textContent !== "Turn Stories into repeatable Tasks" || home.querySelector('meta[http-equiv="refresh"]')) failures.push("Documentation home is missing or still redirects");
  const paths = home?.querySelectorAll(".onboarding-paths:not(.reference-paths) > a");
  if (!home?.querySelector(`.reference-paths a[href="${schemaRoute}"]`) || !home?.querySelector('.reference-paths a[href="/cli/reference/"]')) failures.push("Home must point to the Schema and CLI references");
  const onboardingPaths = features.studio ? 3 : 2;
  if (paths?.length !== onboardingPaths || !home?.querySelector('.onboarding-paths a[href="/getting-started/cli/"]')) failures.push(`Home must offer ${onboardingPaths} working onboarding paths`);
  if (quickstart?.querySelector("h1")?.textContent !== "Try Atomize from the CLI") failures.push("CLI quickstart is missing");
  const commands = [...(quickstart?.querySelectorAll("pre") ?? [])].map(block => block.textContent).join("\n");
  for (const command of ["npm install -g @sppg2001/atomize", "atomize --version", "atomize validate template:backend-api", "atomize preview template:backend-api --mock-story", "Add password reset", "estimationSummary.totalTaskEstimation: 8"]) {
    if (!commands.includes(command)) failures.push(`CLI quickstart is missing its verified command or expected result: ${command}`);
  }
  for (const tag of [...(features.studio ? ["studio-v0"] : []), "vscode-v0", "v5"]) {
    if (!releases?.querySelector(`a[href="https://github.com/Simao-Pereira-Gomes/Atomize/releases?q=tag%3A${tag}"]`)) failures.push(`Release notes destination is missing: ${tag}`);
  }
  for (const [name, page] of [["home", home], ["CLI quickstart", quickstart], ["release notes", releases]] as const) {
    if (!page?.querySelector("[data-pagefind-body]") || !page?.querySelector(".development-notice") || !page?.querySelector(".documentation-build time")) failures.push(`${name}: search indexing, development notice, or provenance is missing`);
  }
  if (guide?.querySelector("h1")?.textContent !== "Compose Templates") failures.push("Composition guide title is missing");
  for (const [path, document] of pages) {
    if (document.querySelector(".documentation-header") && !document.querySelector('atomize-sidebar-toggle button[aria-controls="starlight__sidebar"]')) failures.push(`${path}: desktop navigation toggle is missing`);
    if (document.querySelector('a[href*="github.com/Simao-Pereira-Gomes/Atomize/edit/"]')) failures.push(`${path}: public editing link must not be published`);
    if (document.querySelector('a[href*="github.com/Simao-Pereira-Gomes/Atomize/blob/"], a[href*="github.com/Simao-Pereira-Gomes/Atomize/tree/"]')) failures.push(`${path}: links to a GitHub document; publish it on the portal or mark it <!-- atomize:feature github -->`);
    if (document.querySelector(".documentation-header") && (!document.querySelector(`.documentation-sections a[href="${schemaRoute}"]`) || document.querySelectorAll('.documentation-sections a[aria-current="page"]').length !== 1)) failures.push(`${path}: header section tabs are missing or select more than one section`);
    const content = document.body?.cloneNode(true) as HTMLElement | undefined;
    content?.querySelectorAll("script, style, noscript").forEach(element => { element.remove(); });
    if (content?.textContent?.includes("\u2014")) failures.push(`${path}: website content must not contain em dashes`);
    if (!features.studio) {
      const page = relative(directory, path).replaceAll("\\", "/").replace(/(?:^|\/)index\.html$/, "");
      const description = document.querySelector('meta[name="description"]')?.getAttribute("content") ?? "";
      if (isHiddenPage(page)) failures.push(`${path}: unpublished Studio page was built`);
      if (/(?<!Visual )Studio/.test(`${content?.textContent ?? ""} ${description} ${document.title}`)) failures.push(`${path}: mentions Studio while its documentation is unpublished; mark it with <!-- atomize:feature studio -->`);
      if (content?.querySelector('a[href*="/studio/"], a[href*="getting-started/studio"], a[href*="Atomize-Studio.md"]')) failures.push(`${path}: links to Studio documentation while it is unpublished`);
    }
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
  if (!schemaPage?.querySelector(`.documentation-sections a[href="${schemaRoute}"][aria-current="page"]`)) failures.push("Schema Reference header tab must be selected");
  const sidebarHrefs = (route: string) => [...(pages.get(resolve(directory, `${route}index.html`))?.querySelectorAll("nav.sidebar a[href]") ?? [])].map(link => link.getAttribute("href"));
  if (!sidebarHrefs("vscode/generate/").includes("/cli/reference/auth/") || !sidebarHrefs("cli/reference/auth/").includes("/vscode/generate/") || (features.studio && !sidebarHrefs("cli/reference/auth/").includes("/studio/generate/"))) failures.push("Guide sidebars must list every tool's guides and reference pages, including the CLI reference");
  if (pages.get(resolve(directory, "vscode/generate/index.html"))?.querySelectorAll(".documentation-sections-mobile a").length !== 2) failures.push("Section tabs must be available in the mobile menu");
  if (!schemaPage?.querySelector(`a[href="${templateGuideUrl("inheritance-extends")}"]`)) failures.push("Schema Reference is missing its composition-guide link");
  // Every field's "guide" link must land on a portal page and heading, not on GitHub.
  for (const anchor of schemaGuideAnchors) {
    const [route, fragment] = templateGuideUrl(anchor).split("#");
    const page = route.startsWith("/") ? pages.get(resolve(directory, `${route.slice(1)}index.html`)) : undefined;
    if (!page || (fragment && !page.getElementById(fragment))) failures.push(`Schema field guide link does not reach a portal page: ${anchor}`);
  }
  for (const [route, title, anchors] of [
    ["reference/templates", "Template structure", ["overview", "file-identity", "file-naming"]],
    ["reference/templates/filter", "Choose Stories with filters", ["special-values", "date-filters", "savedquery"]],
    ["reference/templates/tasks", "Define Tasks", ["variable-interpolation", "assignment-patterns", "task-custom-fields", "task-dependencies", "repeated-tasks"]],
    ["reference/templates/conditions", "Add conditions", ["conditional-tasks", "conditional-estimation"]],
    ["reference/templates/estimation", "Estimate Tasks", ["estimation-terms", "from-story-estimate-to-task-estimate", "unresolvable-story-estimates", "estimation-field-mapping", "check-estimation-against-your-project", "task-creation"]],
    ["reference/templates/validation", "Validation, metadata, and retired fields", ["metadata", "deprecated-fields"]],
    ["reference/templates/example", "Complete example", []],
  ] as const) {
    const page = pages.get(resolve(directory, `${route}/index.html`));
    if (page?.querySelector("h1")?.textContent !== title || !page?.querySelector("[data-pagefind-body]") || !page?.querySelector(".development-notice")) failures.push(`Template guide, metadata, or search indexing is missing: ${route}`);
    for (const anchor of anchors) if (!page?.getElementById(anchor)) failures.push(`Template guide is missing ${anchor} on ${route}`);
    if (!page?.querySelector(`a[href^="${schemaRoute}#"]`)) failures.push(`Template guide must link to Schema Reference fields: ${route}`);
  }
  for (const [route, title, anchors] of [
    ["catalog", "How the Catalog works", ["workspace-root", "precedence-and-catalog-overrides", "template-lineage"]],
    ["catalog/create", "Create Templates", ["start-from-the-catalog", "build-with-the-wizard", "author-directly-in-vs-code", "create-mixins", ...(features.studio ? ["create-in-atomize-studio"] : [])]],
    ["catalog/manage", "Install and manage Catalog items", ["install-templates-and-mixins", "update-an-installed-item", "remove-items", "move-legacy-catalog-folders", "atomize-install-to-catalog", ...(features.studio ? ["in-atomize-studio"] : [])]],
    ["catalog/team", "Share Templates with your team", ["post-creation-checklist"]],
  ] as const) {
    const page = pages.get(resolve(directory, `${route}/index.html`));
    if (page?.querySelector("h1")?.textContent !== title || !page?.querySelector("[data-pagefind-body]") || !page?.querySelector(".development-notice")) failures.push(`Catalog page, metadata, or search indexing is missing: ${route}`);
    for (const anchor of anchors) if (!page?.getElementById(anchor)) failures.push(`Catalog guide is missing ${anchor} on ${route}`);
  }
  const catalogConcepts = pages.get(resolve(directory, "catalog/index.html"))?.body?.textContent ?? "";
  for (const text of ["~/.atomize/catalog", "⚠ overrides", "↖ based on"]) if (!catalogConcepts.includes(text)) failures.push(`Catalog concepts are missing ${text}`);
  for (const [route, title, anchors] of [
    ["validation", "Validate Templates", ["two-separate-choices", "offline-and-online-validation", "run-validation-in-your-tool", "lenient-mode", "strict-mode", "how-to-set-the-mode"]],
    ["validation/errors", "Fix validation errors", ["errors-vs-warnings", "estimation-errors", "task-count-errors", "dependency-errors", "repeat-errors", "condition-errors", "schema-errors", "understanding-error-messages", "quick-reference"]],
    ["troubleshooting", "Troubleshooting", ["atomize-command-not-found", "no-stories-found", "authentication-failed", "validation-failed"]],
  ] as const) {
    const page = pages.get(resolve(directory, `${route}/index.html`));
    if (page?.querySelector("h1")?.textContent !== title || !page?.querySelector("[data-pagefind-body]") || !page?.querySelector(".development-notice")) failures.push(`Validation page, metadata, or search indexing is missing: ${route}`);
    for (const anchor of anchors) if (!page?.getElementById(anchor)) failures.push(`Validation guide is missing ${anchor} on ${route}`);
  }
  const validationGuide = pages.get(resolve(directory, "validation/index.html"))?.body?.textContent ?? "";
  for (const text of ["Could not validate project references against ADO", "Field assistance is not validation", "atomize validate \"$template\" --strict"]) if (!validationGuide.includes(text)) failures.push(`Validation guide is missing: ${text}`);
  const troubleshooting = pages.get(resolve(directory, "troubleshooting/index.html"));
  for (const href of ["/connections/troubleshooting/", "/validation/errors/", "/cli/reference/#ai-template-generation-fails", "/vscode/settings-recovery/#troubleshoot-the-offline-workflow"]) {
    if (!troubleshooting?.querySelector(`a[href="${href}"]`)) failures.push(`Troubleshooting must link to ${href}`);
  }
  for (const [route, title] of [["workflows", "Everyday workflows"], ["reference/templates/examples", "Example Templates"]] as const) {
    const page = pages.get(resolve(directory, `${route}/index.html`));
    if (page?.querySelector("h1")?.textContent !== title || !page?.querySelector("[data-pagefind-body]")) failures.push(`Page, metadata, or search indexing is missing: ${route}`);
  }
  const examplesPage = pages.get(resolve(directory, "reference/templates/examples/index.html"));
  for (const file of ["backend.atomize.yaml", "points-to-hours.atomize.yaml", "repeated-review-tasks.atomize.yaml"]) {
    if (!examplesPage?.querySelector(`[id="${exampleAnchor(file)}"]`) || !examplesPage.body?.textContent?.includes(`examples/${file}`)) failures.push(`Example Templates page is missing ${file}`);
  }
  if (!pages.get(resolve(directory, "connections/index.html"))?.getElementById("mock-platform")) failures.push("Connect Azure DevOps must describe the Mock platform");
  const estimationTerms = [...(pages.get(resolve(directory, "reference/templates/estimation/index.html"))?.querySelectorAll("table") ?? [])].find(table => table.textContent?.includes("Set with"))?.textContent ?? "";
  for (const term of ["Story Estimate", "Task Estimate", "Estimation Conversion", "Unresolvable Story Estimate", "Estimation Field Mapping"]) {
    if (!estimationTerms.includes(term)) failures.push(`Estimation terms are missing ${term}`);
  }
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
