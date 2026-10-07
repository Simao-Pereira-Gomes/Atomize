import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { TemplateLoader } from "@sppg2001/atomize-core/templates/loader";
import { TemplateValidator } from "@sppg2001/atomize-core/templates/validator";

const catalogDir = resolve(__dirname, "../../catalog/templates");
const files = readdirSync(catalogDir).filter((f) => f.endsWith(".yaml"));

describe("built-in Templates", () => {
  test.each(files)("%s validates and names any estimation source by reference name", async (file) => {
    const template = await new TemplateLoader().load(resolve(catalogDir, file));

    expect(new TemplateValidator().validate(template).errors).toEqual([]);
    const source = template.estimation?.source;
    // Platform reference names are dotted (e.g. Microsoft.VSTS.Scheduling.StoryPoints); aliases like "story-points" are not.
    if (source !== undefined) expect(source).toContain(".");
  });
});
