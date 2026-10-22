import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { TemplateLibrary } from "../../atomize-core/src/templates/template-library.ts";
import { inspectTemplate, runPreview } from "../../atomize-core/src/templates/template-inspector.ts";

const root = new URL("../../../", import.meta.url);
const { template } = await new TemplateLibrary().loadSource(fileURLToPath(new URL("packages/atomize-core/catalog/templates/backend-api.atomize.yaml", root)));
const mock = { title: "Add password reset", estimation: 8, type: "User Story" };
const preview = runPreview(template, JSON.stringify(mock));
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("CLI quickstart transcript matches the current built-in Template", async () => {
  const markdown = await read("README.md");
  const titles = [...markdown.matchAll(/^tasks\[\d+\]\.title: (.+)$/gm)].map(match => match[1]);
  expect(titles).toEqual(preview.tasks.map(task => task.title));
  for (const [key, value] of Object.entries(preview.estimationSummary)) {
    expect(markdown).toContain(`estimationSummary.${key}: ${value}`);
  }
});

test.each(["docs/Atomize-Studio.md", "docs/VS-Code-Extension.md"])("%s Mock walkthrough matches the current form and output", async path => {
  const markdown = await read(path);
  const table = markdown.match(/\| Input \| Value \|\n\|[^\n]+\n((?:\|[^\n]+\n)+)/)?.[1] ?? "";
  const inputs = [...table.matchAll(/^\| ([^|]+) \| ([^|]+) \|$/gm)].map(match => match[1].replaceAll("`", "").trim().toLowerCase());
  expect(inputs.sort()).toEqual(inspectTemplate(template).fields.map(field => field.name).sort());
  expect(markdown).toContain(`expect **${preview.tasks.length} Tasks**`);
  expect(markdown).toContain(`**${preview.estimationSummary.totalTaskEstimation} hours**`);
  expect(markdown).toContain(preview.tasks[0].title.replace(mock.title, "Mock Story"));
});

test("VS Code generation screenshot captions match two Stories with estimate 8", async () => {
  const markdown = await read("docs/VS-Code-Extension.md");
  expect(markdown).toContain(`${2 * preview.tasks.length} Tasks, ${2 * preview.estimationSummary.totalTaskEstimation} hours`);
  expect(markdown).toContain(`create ${2 * preview.tasks.length} tasks for 2 stories`);
});

test("CLI dry-run transcript matches the current Task titles, estimates, and allocation", async () => {
  const markdown = await read("docs/Workflows.md");
  const result = runPreview(template, JSON.stringify({ ...mock, title: "Implement user authentication API" }));
  expect(markdown).toContain(`Tasks calculated:  ${result.tasks.length}`);
  expect(markdown).toContain(`Tasks created:     ${result.tasks.length}`);
  expect(markdown).toContain(`Created ${result.tasks.length} tasks for 1 story.`);
  expect(markdown).toContain(`Distribution: ${result.estimationSummary.totalTaskEstimation} hours (100%)`);
  for (const task of result.tasks) {
    expect(markdown).toContain(`- ${task.title}: ${task.estimation} hours (${task.estimationPercent}%)`);
  }
});
