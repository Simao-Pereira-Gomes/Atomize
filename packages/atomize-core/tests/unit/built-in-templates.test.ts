import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { TemplateLibrary } from "@sppg2001/atomize-core/templates/template-library";
import { TemplateValidator } from "@sppg2001/atomize-core/templates/validator";

const library = new TemplateLibrary();
const load = async (path: string) => (await library.loadSource(path)).template;

const catalogDir = resolve(__dirname, "../../catalog/templates");
const files = readdirSync(catalogDir).filter((f) => f.endsWith(".yaml"));

describe("built-in Templates", () => {
  test.each(files)("%s validates and names any estimation source by reference name", async (file) => {
    const template = await load(resolve(catalogDir, file));

    expect(new TemplateValidator().validate(template).errors).toEqual([]);
    const source = template.estimation?.source;
    // Platform reference names are dotted (e.g. Microsoft.VSTS.Scheduling.StoryPoints); aliases like "story-points" are not.
    if (source !== undefined) expect(source).toContain(".");
  });
});
