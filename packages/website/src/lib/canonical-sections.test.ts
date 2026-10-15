import { describe, expect, test } from "bun:test";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import { parseHTML } from "linkedom";
import canonicalSections from "./canonical-sections";

describe("canonical guide rendering", () => {
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

  test("an include marker inside a code example stays literal", async () => {
    const renderer = await createMarkdownProcessor({ remarkPlugins: [canonicalSections] });
    const { code } = await renderer.render("```html\n<!-- atomize:include nonexistent-section -->\n```");
    expect(parseHTML(code).document.querySelector("pre")?.textContent).toContain("atomize:include nonexistent-section");
  });
});
