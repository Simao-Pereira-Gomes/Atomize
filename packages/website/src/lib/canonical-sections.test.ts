import { describe, expect, test } from "bun:test";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import { parseHTML } from "linkedom";
import type { Root, RootContent } from "mdast";
import { unified } from "unified";
import canonicalSections from "./canonical-sections";

const opening: RootContent = { type: "html", value: "<!-- atomize:section template-composition -->" };
const closing: RootContent = { type: "html", value: "<!-- /atomize:section -->" };

function includeFixture(children: RootContent[]) {
  const processor = unified().use(function () {
    this.parser = () => structuredClone({ type: "root", children } satisfies Root);
  }).use(canonicalSections);
  return processor.run({ type: "root", children: [{ type: "html", value: "<!-- atomize:include template-composition -->" }] });
}

describe("canonical guide rendering", () => {
  test("Studio preview keeps source selection independent and publishes local screenshots", async () => {
    const renderer = await createMarkdownProcessor({ remarkPlugins: [canonicalSections] });
    const { code } = await renderer.render("<!-- atomize:include studio-first-preview -->");
    const { document } = parseHTML(code);
    expect(document.querySelector('img[src="/studio/mock-preview.png"]')?.getAttribute("alt")).toContain("Preview Source");
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
    expect(document.querySelector('a[href="https://github.com/Simao-Pereira-Gomes/Atomize/blob/main/docs/Auth-Guide.md#quick-setup"]')).not.toBeNull();
    expect(document.querySelector('a[href="https://github.com/Simao-Pereira-Gomes/Atomize/blob/main/docs/Workflows.md#generate-tasks"]')).not.toBeNull();
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

  test("an include marker inside a code example stays literal", async () => {
    const renderer = await createMarkdownProcessor({ remarkPlugins: [canonicalSections] });
    const { code } = await renderer.render("```html\n<!-- atomize:include nonexistent-section -->\n```");
    expect(parseHTML(code).document.querySelector("pre")?.textContent).toContain("atomize:include nonexistent-section");
  });
});
