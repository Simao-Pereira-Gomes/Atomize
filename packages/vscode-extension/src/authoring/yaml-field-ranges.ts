import { isMap, isScalar, isSeq, parseDocument } from 'yaml';

export interface YamlFieldRange {
	path: string;
	start: number;
	end: number;
}

export function yamlFieldRanges(text: string): YamlFieldRange[] {
	const fields: YamlFieldRange[] = [];
	function visit(node: unknown, path: string): void {
		if (isMap(node)) {
			for (const pair of node.items) {
				if (!isScalar(pair.key) || pair.key.value === null || !pair.key.range) continue;
				const name = String(pair.key.value);
				const child = path ? `${path}.${name}` : name;
				fields.push({ path: child, start: pair.key.range[0], end: pair.key.range[1] });
				visit(pair.value, child);
			}
		} else if (isSeq(node)) {
			node.items.forEach((item, index) => { visit(item, `${path}[${index}]`); });
		}
	}
	try {
		visit(parseDocument(text).contents, '');
	} catch {
		// An incomplete document can still have fields found before recovery failed.
	}
	return fields;
}
