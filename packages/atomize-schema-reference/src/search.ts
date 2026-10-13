import type { SchemaNode } from "./tree";

/** Keep name/description matches and the ancestors that make them navigable. */
export function searchSchemaTree(
	nodes: SchemaNode[],
	query: string,
): SchemaNode[] {
	const term = query.trim().toLocaleLowerCase();
	if (!term) return nodes;

	function filter(branch: SchemaNode[]): SchemaNode[] {
		return branch.flatMap((node) => {
			const children = filter(node.children);
			const alternatives = filter(node.alternatives);
			const matches = `${node.name} ${node.description}`
				.toLocaleLowerCase()
				.includes(term);
			return matches || children.length || alternatives.length
				? [{ ...node, children, alternatives }]
				: [];
		});
	}

	return filter(nodes);
}
