import type { SchemaNode, SchemaTab, SchemaTrees } from "./tree";

export interface SchemaPermalink {
	tab: SchemaTab;
	path: string;
}

const schemaPathPattern =
	/^[A-Za-z_$][\w$-]*(?:\[\])*(?:\.(?:[A-Za-z_$][\w$-]*|\*)(?:\[\])*)*$/;

export function buildPermalink(tab: SchemaTab, path: string): string {
	if (
		(tab !== "template" && tab !== "mixin") ||
		!schemaPathPattern.test(path)
	) {
		throw new Error(`Invalid Schema Reference permalink: ${tab}.${path}`);
	}
	return `${tab}.${path}`;
}

export function parsePermalink(fragment: string): SchemaPermalink | undefined {
	let value: string;
	try {
		value = decodeURIComponent(
			fragment.startsWith("#") ? fragment.slice(1) : fragment,
		);
	} catch {
		return undefined;
	}
	const separator = value.indexOf(".");
	if (separator < 1) return undefined;
	const tab = value.slice(0, separator);
	const path = value.slice(separator + 1);
	if ((tab !== "template" && tab !== "mixin") || !schemaPathPattern.test(path))
		return undefined;
	return { tab, path };
}

/** Resolve a document path to a field, walking up to its closest known ancestor.
 * Without an explicit tab, shared task definitions belong to the Template tab.
 */
export function normalizeDocumentPath(
	trees: SchemaTrees,
	documentPath: string,
	tab: SchemaTab = "template",
): string | undefined {
	let path = documentPath.replace(/\[\d+\]/g, "[]");
	if (!schemaPathPattern.test(path)) return undefined;
	const paths = new Set<string>();
	function visit(nodes: SchemaNode[]) {
		for (const node of nodes) {
			paths.add(node.path);
			visit(node.children);
			visit(node.alternatives);
		}
	}
	visit(trees[tab]);
	while (path) {
		if (paths.has(path)) return buildPermalink(tab, path);
		const segments = path.split(".");
		const dictionaryPath = [...paths].find((candidate) => {
			const parts = candidate.split(".");
			return (
				parts.length === segments.length &&
				parts.every((part, index) => part === "*" || part === segments[index])
			);
		});
		if (dictionaryPath) return buildPermalink(tab, dictionaryPath);
		path = path.endsWith("[]")
			? path.slice(0, -2)
			: path.slice(0, Math.max(0, path.lastIndexOf(".")));
	}
	return undefined;
}
