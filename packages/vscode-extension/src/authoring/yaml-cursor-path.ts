import { isMap, isNode, isScalar, isSeq, parseDocument } from 'yaml';

export function yamlCursorPath(text: string, offset: number): string | undefined {
	if (!Number.isInteger(offset) || offset < 0 || offset > text.length) return undefined;
	function contains(range: readonly number[] | null | undefined): boolean {
		if (!range) return false;
		return offset >= range[0] && (offset < range[1]
			|| (offset === range[1] && range[1] > range[0] && text[offset - 1] !== '\n')
			|| (offset === text.length && offset === range[1] && range[0] === range[1]));
	}
	function visit(node: unknown, path: string): string | undefined {
		if (isMap(node)) {
			for (const pair of node.items) {
				if (!isScalar(pair.key) || pair.key.value === null) continue;
				const name = String(pair.key.value);
				const childPath = path ? `${path}.${name}` : name;
				if (contains(pair.key.range)) return childPath;
				const found = visit(pair.value, childPath);
				if (found) return found;
			}
		} else if (isSeq(node)) {
			for (let index = 0; index < node.items.length; index++) {
				const found = visit(node.items[index], `${path}[${index}]`);
				if (found) return found;
			}
		} else if (isNode(node) && contains(node.range)) {
			return path || undefined;
		}
		return undefined;
	}
	try {
		return visit(parseDocument(text).contents, '');
	} catch {
		return undefined;
	}
}
