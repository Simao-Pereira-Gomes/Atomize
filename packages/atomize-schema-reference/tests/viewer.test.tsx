import { renderToString } from "solid-js/web";
import { expect, it } from "vitest";
import schema from "../schema/atomize-template.schema.json";
import { SchemaReference } from "../src/SchemaReference";
import { buildSchemaTrees } from "../src/tree";

it("renders the viewer using the real generated schema", () => {
	const html = renderToString(() => (
		<SchemaReference
			trees={buildSchemaTrees(schema)}
			versionLabel="test version"
			guideUrl={(anchor) => `https://example.com/guide#${anchor}`}
		/>
	));
	expect(html).toContain("Schema Reference");
	expect(html).toContain("test version");
	expect(html).toContain("Required unless extends is set");
	expect(html).toContain("tasks[].condition");
	expect(html).toContain("Mixin");
	expect(html).toContain("Runtime rules");
	expect(html).toContain("Non-empty task IDs must be unique within the file.");
	expect(html).toContain("Generated task counts include each repeated copy");
	expect(html).toContain('href="https://example.com/guide#assignment-patterns"');
	expect(html).toContain('href="https://example.com/guide#inheritance-extends"');
	expect(html).toContain("Read about tasks[].assignTo in the Template Reference");
	expect(html).toContain("YAML examples");
	expect(html).toContain('aria-label="YAML example for tasks[].condition"');
	expect(html).toContain("condition:\n  field: tags\n  operator: contains\n  value: security");
	expect(html).toContain('assignTo: "@ParentAssignee"');
	expect(html).toContain("estimationPercentCondition:\n  - condition:");
	expect(html).toContain("customFields:\n  Custom.ClientTier: Enterprise");
	expect(html).toContain("savedQuery:\n  path: Shared Queries/Teams/Backend Team/Sprint Active Stories");
	expect(html).toContain("conversion:\n  factor: 4");
	expect(html).toContain('"1": 2');
	expect(html).toContain("multipliers: true");
	const embedded = renderToString(() => (
		<SchemaReference
			trees={buildSchemaTrees(schema)}
			versionLabel="embedded version"
			syncUrl={false}
			showPermalinks={false}
		/>
	));
	expect(html).toContain("Copy link to tasks[].condition");
	expect(embedded).not.toContain("Copy link to");
	expect(embedded).toContain("tasks[].condition");
});

it("can render its navigation elsewhere while the fields keep their layout", () => {
	const trees = buildSchemaTrees(schema);
	const inline = renderToString(() => <SchemaReference trees={trees} versionLabel="inline" />);
	expect(inline).toContain("schema-reference-sidebar");
	expect(inline).not.toContain("schema-reference-layout-detached");
	// Hosts resolve the mount only in the browser; on the server the navigation renders nowhere.
	const detached = renderToString(() => (
		<SchemaReference trees={trees} versionLabel="detached" navigationMount={() => undefined} />
	));
	expect(detached).toContain("schema-reference-layout-detached");
	expect(detached).not.toContain("schema-reference-sidebar");
	expect(detached).toContain("Runtime rules");
	expect(detached).toContain('data-permalink="template.tasks"');
});

it("shows an array's item fields directly, with the item type as a fact", () => {
	const html = renderToString(() => <SchemaReference trees={buildSchemaTrees(schema)} versionLabel="items" />);
	expect(html).not.toContain(">Array item<");
	// tasks lists its Task fields, which keep their own permalinks.
	expect(html).toContain('data-permalink="template.tasks[].title"');
	expect(html).toContain("Each item");
	expect(html).toContain("string · minLength 1");
	expect(html).not.toMatch(/Each item<\/dt><dd[^>]*><code[^>]*>object · additionalProperties/);
});

it("labels the file kinds with their field counts", () => {
	const trees = buildSchemaTrees(schema);
	const html = renderToString(() => <SchemaReference trees={trees} versionLabel="counts" />);
	// Server rendering adds hydration markers between the count and its hidden label.
	const counted = (count: number) => new RegExp(`>${count}(<!--[^>]*-->)*<span class="schema-reference-sr-only"> fields</span>`);
	expect(html).toMatch(counted(trees.template.length));
	expect(html).toMatch(counted(trees.mixin.length));
	expect(html).not.toMatch(/>0[12]</);
});
