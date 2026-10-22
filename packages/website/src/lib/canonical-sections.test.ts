import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import { parseHTML } from "linkedom";
import type { Root, RootContent } from "mdast";
import { unified } from "unified";
import canonicalSections, { applyFeatureMarkers } from "./canonical-sections";
import { canonicalGuideUrl } from "./documentation";
import { features } from "./features";

const opening: RootContent = { type: "html", value: "<!-- atomize:section template-composition -->" };
const closing: RootContent = { type: "html", value: "<!-- /atomize:section -->" };

function includeFixture(children: RootContent[]) {
  const processor = unified().use(function () {
    this.parser = () => structuredClone({ type: "root", children } satisfies Root);
  }).use(canonicalSections);
  return processor.run({ type: "root", children: [{ type: "html", value: "<!-- atomize:include template-composition -->" }] });
}

describe("canonical guide rendering", () => {
  // These guides describe Studio, so they render as a build that publishes it.
  const studio = features.studio;
  beforeAll(() => { features.studio = true; });
  afterAll(() => { features.studio = studio; });

  test("connection setup keeps VS Code storage separate and links to its portal sections", async () => {
    const renderer = await createMarkdownProcessor({ remarkPlugins: [canonicalSections] });
    const { code } = await renderer.render("<!-- atomize:include auth-setup -->\n\n<!-- atomize:include auth-vscode -->");
    const { document } = parseHTML(code);
    expect(code).toContain("Manage projects…");
    expect(code).toContain("Studio has no separate test action");
    expect(code).toContain("Later CLI or Studio changes are not synchronized");
    expect(document.querySelector('a[href="/connections/#required-permissions"]')).not.toBeNull();
    expect(document.querySelector('a[href="/connections/profiles/#shared-between-the-cli-and-atomize-studio"]')).not.toBeNull();
    expect(document.querySelector("h2#atomize-cli")).not.toBeNull();
  });

  test("CLI profile resolution does not describe a token fallback", async () => {
    const renderer = await createMarkdownProcessor({ remarkPlugins: [canonicalSections] });
    const { code } = await renderer.render("<!-- atomize:include auth-resolution -->");
    expect(code).toContain("<code>ATOMIZE_PAT</code> is not a fallback");
    expect(parseHTML(code).document.querySelectorAll("ol > li")).toHaveLength(3);
  });

  test("platform support describes current adapters without planned platforms", async () => {
    const renderer = await createMarkdownProcessor({ remarkPlugins: [canonicalSections] });
    const { code } = await renderer.render("<!-- atomize:include platform-support -->");
    expect(code).toContain("Azure DevOps Server (on-premises) is not supported");
    expect(code).not.toMatch(/Jira|Planned|Coming soon/);
  });

  test("Studio Generate describes the Live Preview before confirmation and when Tasks are created", async () => {
    const renderer = await createMarkdownProcessor({ remarkPlugins: [canonicalSections] });
    const { code } = await renderer.render("<!-- atomize:include studio-generate -->");
    const { document } = parseHTML(code);
    expect(code).toContain("DRY RUN: nothing has been created yet");
    expect(code).toContain("Tasks are created only after step 5");
    expect(code).toContain("with the Tasks it will get and their estimates");
    expect(code).toContain("is not rolled back");
    expect(code).not.toContain("no separate Live Preview");
    expect(document.querySelector('img.themed-screenshot-dark[src="/studio/live-execution-confirmation-dark.png"]')?.getAttribute("alt")).toContain("Live Execution Confirmation");
    expect(document.querySelector('a[href="/studio/project-data/#work-project-setting"]')).not.toBeNull();
  });

  test("VS Code Generate keeps confirmation with a pre-selected profile and shows both screenshots", async () => {
    const renderer = await createMarkdownProcessor({ remarkPlugins: [canonicalSections] });
    const { code } = await renderer.render("<!-- atomize:include vscode-generate -->");
    const { document } = parseHTML(code);
    expect(code).toContain("every execution is still confirmed");
    expect(code).toContain("Tasks are created only after step 6");
    expect(code).toContain("no cancel action once creation starts");
    expect(document.querySelector('img.themed-screenshot-light[src="/vscode/generate-dry-run-light.png"]')).not.toBeNull();
    expect(document.querySelector('img.themed-screenshot-dark[src="/vscode/generate-confirmation-dark.png"]')?.getAttribute("alt")).toContain("confirmation dialog");
    expect(document.querySelector('a[href="/vscode/generate/#choose-stories"]')).not.toBeNull();
    expect(document.querySelectorAll("ol").length).toBe(2);
  });

  test("CLI generation states when Tasks are created and what automation must acknowledge", async () => {
    const renderer = await createMarkdownProcessor({ remarkPlugins: [canonicalSections] });
    const { code } = await renderer.render("<!-- atomize:include workflow-cli-generate -->\n\n<!-- atomize:include workflow-cli-automation -->");
    const { document } = parseHTML(code);
    expect(code).toContain("only with <code>--execute</code>, and only after you confirm or pass <code>--auto-approve</code>");
    expect(code).toContain("It runs a dry run unless you also pass <code>--execute</code>");
    expect(document.querySelector('a[href="/connections/profiles/"]')).not.toBeNull();
    expect(document.querySelector('a[href="/connections/automation/#cicd-setup"]')).not.toBeNull();
    expect(document.querySelector('a[href="/cli/reference/generate/"]')).not.toBeNull();
    expect([...document.querySelectorAll("td")].some(cell => cell.textContent === "Authentication failed")).toBe(true);
  });

  test("the CLI reference documents every registered generate and template command", async () => {
    const renderer = await createMarkdownProcessor({ remarkPlugins: [canonicalSections] });
    const { code } = await renderer.render("<!-- atomize:include cli-generate -->\n\n<!-- atomize:include cli-template -->\n\n<!-- atomize:include cli-template-improve -->\n\n<!-- atomize:include cli-template-manage -->");
    for (const flag of ["--json-stream", "--auto-approve", "--include-sensitive-report-data"]) expect(code).toContain(flag);
    expect(parseHTML(code).document.querySelector("h2#template-migrate")).not.toBeNull();
  });

  test("AI guides keep Grounding an explicit choice and link Reference Documents to the CLI guide", async () => {
    const renderer = await createMarkdownProcessor({ remarkPlugins: [canonicalSections] });
    const { code } = await renderer.render("<!-- atomize:include creation-ai -->\n\n<!-- atomize:include studio-ai -->\n\n<!-- atomize:include vscode-ai -->\n\n<!-- atomize:include cli-template-improve -->");
    for (const choice of ["Draft without project context", "Retry after sign-in", "continue without grounding", "Save Improvement as New Template", "Install GitHub Copilot Chat", "--no-project-references"]) expect(code).toContain(choice);
    expect(code).not.toContain("GitHub Models");
    expect(parseHTML(code).document.querySelector('a[href="/cli/ai/#reference-documents"]')).not.toBeNull();
    expect(canonicalGuideUrl("docs/Cli-Reference.md", "template-improve")).toBe("/cli/ai/#template-improve");
    expect(canonicalGuideUrl("docs/Template-Creation.md", "ai-assisted-drafts")).toBe("/cli/ai/");
  });

  test("the estimation guide distinguishes the estimation terms and each unresolvable-estimate policy", async () => {
    const renderer = await createMarkdownProcessor({ remarkPlugins: [canonicalSections] });
    const { code } = await renderer.render("<!-- atomize:include template-estimation -->");
    const { document } = parseHTML(code);
    for (const term of ["Story Estimate", "Task Estimate", "Estimation Conversion", "Unresolvable Story Estimate", "Estimation Field Mapping"]) expect(code).toContain(term);
    for (const policy of ["warn", "skip", "use-default"]) expect([...document.querySelectorAll("td code")].some(cell => cell.textContent === policy)).toBe(true);
    expect(document.querySelector('a[href="/reference/templates/estimation/#task-creation"]')).not.toBeNull();
    expect(canonicalGuideUrl("docs/Template-Reference.md", "repeated-tasks")).toBe("/reference/templates/tasks/#repeated-tasks");
  });

  test("the Catalog guide explains scopes, overrides, and lineage, and the CLI reference links to it", async () => {
    const renderer = await createMarkdownProcessor({ remarkPlugins: [canonicalSections] });
    const { code } = await renderer.render("<!-- atomize:include catalog-concepts -->\n\n<!-- atomize:include cli-template-manage -->");
    for (const text of ["~/.atomize/catalog", "--scope user", "⚠ overrides", "↖ based on"]) expect(code).toContain(text);
    expect(parseHTML(code).document.querySelector('a[href="/catalog/#precedence-and-catalog-overrides"]')).not.toBeNull();
    expect(canonicalGuideUrl("docs/Template-Creation.md", "post-creation-checklist")).toBe("/catalog/team/#post-creation-checklist");
  });

  test("the validation guide separates connectivity from strictness and links whole validation guides to the portal", async () => {
    const renderer = await createMarkdownProcessor({ remarkPlugins: [canonicalSections] });
    const { code } = await renderer.render("<!-- atomize:include validation-choices -->\n\n<!-- atomize:include validation-online -->\n\n<!-- atomize:include template-validation -->");
    for (const text of ["Offline Validation", "Online Validation", "doesn't make validation stricter", "Could not validate project references against ADO"]) expect(code).toContain(text);
    expect(parseHTML(code).document.querySelector('a[href="/validation/"]')).not.toBeNull();
    expect(canonicalGuideUrl("docs/Common-Validation-Errors.md")).toBe("/validation/errors/");
    expect(canonicalGuideUrl("docs/Workflows.md", "no-stories-found")).toBe("/troubleshooting/#no-stories-found");
  });

  test("a sub-anchor of a section published at a fragment route keeps one fragment", () => {
    expect(canonicalGuideUrl("docs/Auth-Guide.md", "when-the-keychain-is-unavailable")).toBe("/connections/profiles/#when-the-keychain-is-unavailable");
    expect(canonicalGuideUrl("docs/Auth-Guide.md", "credential-storage")).toBe("/connections/profiles/#credential-storage");
  });

  test("VS Code onboarding distinguishes opening a Catalog file from inserting its ref", async () => {
    const renderer = await createMarkdownProcessor({ remarkPlugins: [canonicalSections] });
    const { code } = await renderer.render("<!-- atomize:include vscode-first-preview -->");
    const { document } = parseHTML(code);
    expect(code).toContain("Open backing file");
    expect(code).toContain("Pressing Enter instead copies the ref");
    expect(document.querySelector('img.themed-screenshot-light[src="/vscode/mock-preview-light.png"]')?.getAttribute("alt")).toContain("Mock Preview Panel");
    expect(document.querySelector('img.themed-screenshot-dark[src="/vscode/mock-preview-dark.png"]')?.getAttribute("alt")).toContain("Mock Preview Panel");
    expect(document.querySelector('a[href="/vscode/author-yaml/#opt-your-file-into-atomize"]')).not.toBeNull();
    expect(document.querySelector('a[href="/vscode/inspect-templates/#inspect-the-resolved-template"]')).not.toBeNull();
    expect(document.querySelector("h2#atomize-yaml-opt-in")).toBeNull();
  });

  test("VS Code opt-in explains the limits of content detection and preserves the modeline", async () => {
    const renderer = await createMarkdownProcessor({ remarkPlugins: [canonicalSections] });
    const { code } = await renderer.render("<!-- atomize:include vscode-opt-in -->");
    expect(code).toContain("Session Atomize YAML Opt-In");
    expect(code).toContain("does not enable CodeLens or save-time Atomize validation");
    expect(parseHTML(code).document.querySelector("pre")?.textContent).toContain("# atomize-yaml");
    expect(code).not.toContain("atomize:section");
  });

  test("Studio preview keeps source selection independent and publishes local screenshots", async () => {
    const renderer = await createMarkdownProcessor({ remarkPlugins: [canonicalSections] });
    const { code } = await renderer.render("<!-- atomize:include studio-first-preview -->");
    const { document } = parseHTML(code);
    expect(document.querySelector('img.themed-screenshot-light[src="/studio/mock-preview-light.png"]')?.getAttribute("alt")).toContain("Preview Source");
    expect(code).toContain("independent of the Template");
    expect(document.querySelector('a[href="/studio/author-templates/#choose-a-starting-path"]')).not.toBeNull();
    expect(document.querySelector('a[href="/studio/settings-recovery/#global-settings"]')).not.toBeNull();
    expect(code).not.toContain("atomize:section");
  });

  test("Studio Open preserves flattening and save semantics without importing unrelated workflows", async () => {
    const renderer = await createMarkdownProcessor({ remarkPlugins: [canonicalSections] });
    const { code } = await renderer.render("<!-- atomize:include studio-open-save -->");
    const { document } = parseHTML(code);
    expect(code).toContain("permanently detaches");
    expect(code).toContain("Export as copy");
    expect(document.querySelector("h2#builder-sections")).toBeNull();
    expect(document.querySelector("h2#ai-drafting")).toBeNull();
  });

  test("CLI onboarding reuses README instructions and rebases next-step links", async () => {
    const renderer = await createMarkdownProcessor({ remarkPlugins: [canonicalSections] });
    const { code } = await renderer.render("<!-- atomize:include cli-quickstart -->");
    const { document } = parseHTML(code);
    expect(document.querySelector("h2#install-the-cli")).not.toBeNull();
    expect(document.querySelector("h2#run-your-first-mock-preview")).not.toBeNull();
    expect(document.querySelector('a[href="/connections/profiles/"]')).not.toBeNull();
    expect(document.querySelector('a[href="/cli/generate/"]')).not.toBeNull();
    expect(document.querySelector('a[href="/cli/reference/preview-validate/#preview"]')).not.toBeNull();
    expect(document.querySelector("h2#safety-model")).toBeNull();
    expect(code).not.toContain("atomize:section");
  });

  test("explicit boundaries survive heading renames and exclude neighbouring content", async () => {
    const heading: RootContent = { type: "heading", depth: 2, children: [{ type: "text", value: "Renamed explanation" }] };
    const content: RootContent = { type: "paragraph", children: [{ type: "text", value: "Shared explanation" }] };
    const result = await includeFixture([heading, opening, content, closing, heading]);
    expect(result.children).toEqual([content]);
  });

  test.each([
    ["missing", [], "Missing canonical section marker"],
    ["unclosed", [opening], "Unclosed canonical section"],
    ["nested", [opening, opening, closing], "Unclosed canonical section"],
    ["duplicate", [opening, closing, opening, closing], "Duplicate canonical section"],
  ] as const)("%s section boundaries fail instead of publishing the wrong content", async (_name, children, message) => {
    expect.assertions(1);
    try {
      await includeFixture([...children]);
    } catch (error) {
      expect(String(error)).toContain(message);
    }
  });

  test("adapts the composition section without leaking neighbouring reference sections", async () => {
    const renderer = await createMarkdownProcessor({ remarkPlugins: [canonicalSections] });
    const { code } = await renderer.render("A focused introduction.\n\n<!-- atomize:include template-composition -->");
    const { document } = parseHTML(code);
    expect(document.querySelector("p")?.textContent).toBe("A focused introduction.");
    expect(document.querySelector("h2#inheritance-extends")).not.toBeNull();
    expect(document.querySelector("h2#mixins-mixins")).not.toBeNull();
    expect(document.querySelector("h2#resolution-order")).not.toBeNull();
    expect(document.querySelector("pre")?.textContent).toContain('extends: "backend-api"');
    expect(document.querySelector("h2#filter")).toBeNull();
    expect(document.querySelector("h2#file-naming")).toBeNull();
  });

  test("a misspelled section fails instead of publishing an empty page", async () => {
    const renderer = await createMarkdownProcessor({ remarkPlugins: [canonicalSections] });
    expect.assertions(1);
    try {
      await renderer.render("<!-- atomize:include nonexistent-section -->");
    } catch (error) {
      expect(String(error)).toContain("Unknown canonical section");
    }
  });

  test("the shared composition guide explains each surface without requiring CLI workflows", async () => {
    const renderer = await createMarkdownProcessor({ remarkPlugins: [canonicalSections] });
    const { code } = await renderer.render("<!-- atomize:include template-composition -->");
    const { document } = parseHTML(code);
    const toolChoices = document.querySelector("table")?.textContent ?? "";
    expect(toolChoices).toContain("VS Code extension");
    expect(toolChoices).toContain("Atomize Studio");
    expect(toolChoices).toContain("CLI");
    expect(toolChoices).toContain("Show Effective Template");
    expect(toolChoices).toContain("flattened");
    expect(document.querySelector("pre code.language-bash")).toBeNull();
  });

  test("section markers stay out of the published page", async () => {
    const renderer = await createMarkdownProcessor({ remarkPlugins: [canonicalSections] });
    const { code } = await renderer.render("<!-- atomize:include template-composition -->");
    expect(code).not.toContain("atomize:section");
    expect(code).not.toContain("<hr");
  });

  test("a canonical picture that cannot be split into themed screenshots fails", async () => {
    expect.assertions(1);
    try {
      await includeFixture([opening, { type: "html", value: '<picture>\n  <img alt="Missing dark variant" src="/studio/x-light.png">\n</picture>' }, closing]);
    } catch (error) {
      expect(String(error)).toContain("Canonical <picture> must contain");
    }
  });

  test("an include marker inside a code example stays literal", async () => {
    const renderer = await createMarkdownProcessor({ remarkPlugins: [canonicalSections] });
    const { code } = await renderer.render("```html\n<!-- atomize:include nonexistent-section -->\n```");
    expect(parseHTML(code).document.querySelector("pre")?.textContent).toContain("atomize:include nonexistent-section");
  });
});

describe("feature markers", () => {
  const render = async (markdown: string, published: boolean) => {
    const features = () => (tree: Root) => applyFeatureMarkers(tree, message => { throw new Error(message); }, () => published);
    const renderer = await createMarkdownProcessor({ remarkPlugins: [features] });
    return (await renderer.render(markdown)).code;
  };
  const source = [
    "Use the CLI<!-- atomize:feature studio --> or Studio<!-- /atomize:feature --> today.",
    "",
    "- CLI",
    "- Studio settings <!-- atomize:feature studio -->",
    "",
    "| Tool | Notes |",
    "| --- | --- |",
    "| <!-- atomize:feature studio -->Studio | desktop |",
    "| CLI | terminal |",
    "",
    "<!-- atomize:feature studio -->",
    "",
    "## Studio section",
    "",
    "<!-- /atomize:feature -->",
    "",
    "<!-- atomize:feature !studio -->",
    "",
    "Two tools.",
    "",
    "<!-- /atomize:feature -->",
  ].join("\n");

  test("a hidden feature removes its words, items, rows, and blocks, and shows the alternative", async () => {
    const output = await render(source, false);
    const { document } = parseHTML(output);
    expect(output).not.toContain("Studio");
    expect(output).not.toContain("atomize:feature");
    expect(output).toContain("Use the CLI today.");
    expect(document.querySelectorAll("li")).toHaveLength(1);
    expect(document.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(output).toContain("Two tools.");
  });

  test("a published feature keeps its content, drops the alternative, and leaves no markers", async () => {
    const output = await render(source, true);
    const { document } = parseHTML(output);
    for (const text of ["or Studio today", "Studio settings"]) expect(output).toContain(text);
    expect(document.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(document.querySelector("h2")?.textContent).toBe("Studio section");
    expect(output).not.toContain("Two tools.");
    expect(output).not.toContain("atomize:feature");
  });

  test("a marker that starts a line of text is rejected instead of silently publishing raw Markdown", async () => {
    await expect(render("<!-- atomize:feature studio -->In Studio, do this.", false)).rejects.toThrow("cannot start a line");
  });

  test("an unclosed region is rejected", async () => {
    await expect(render("<!-- atomize:feature studio -->\n\nText", false)).rejects.toThrow("Unclosed feature marker");
  });
});

test("links to an unpublished feature's sections fall back to the GitHub guide", () => {
  expect(features.studio).toBe(false);
  expect(canonicalGuideUrl("docs/Atomize-Studio.md", "ai-drafting")).toBe("https://github.com/Simao-Pereira-Gomes/Atomize/blob/main/docs/Atomize-Studio.md#ai-drafting");
});
