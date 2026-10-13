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
});
