import { LineCounter, parseDocument, isMap, isSeq, isPair, type ParsedNode } from 'yaml';

export interface PlainRange {
	start: { line: number; character: number };
	end: { line: number; character: number };
}

export interface TextEdit {
	startLine: number;
	startCharacter: number;
	endLine: number;
	endCharacter: number;
	newText: string;
}

function slugify(title: string): string {
	return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 30);
}

function lineIndent(line: string): number {
	return line.match(/^(\s*)/)?.[1].length ?? 0;
}

function blockEndLine(lines: string[], keyLine: number, keyIndentLevel: number): number {
	for (let i = keyLine + 1; i < lines.length; i++) {
		const l = lines[i] ?? '';
		if (l.trim() === '') continue;
		if (lineIndent(l) <= keyIndentLevel) return i;
	}
	return lines.length;
}

export function fixMissingTaskId(docText: string, range: PlainRange, _data: unknown): TextEdit[] | null {
	const lc = new LineCounter();
	const doc = parseDocument(docText, { lineCounter: lc });
	const root = doc.contents;
	if (!isMap(root)) return null;

	const tasksNode = root.get('tasks', true);
	if (!isSeq(tasksNode)) return null;

	// The diagnostic range points to the task's `- ` list-item line.
	// In standard Atomize YAML the first key is always inline with `- `, so
	// the task's YAML node starts on the same line as the diagnostic.
	const diagLine = range.start.line;
	let targetTask: (typeof tasksNode.items)[number] | undefined;

	for (const item of tasksNode.items) {
		if (!isMap(item) || !item.range) continue;
		if (lc.linePos(item.range[0]).line - 1 === diagLine) {
			targetTask = item;
			break;
		}
	}

	if (!isMap(targetTask)) return null;
	if (targetTask.get('id') !== undefined) return null;

	const title = targetTask.get('title');
	if (typeof title !== 'string') return null;

	const slug = slugify(title);
	if (!slug) return null;

	const firstPair = targetTask.items[0];
	if (!isPair(firstPair)) return null;

	const firstKey = firstPair.key as ParsedNode;
	if (!firstKey.range) return null;

	const pos = lc.linePos(firstKey.range[0]);
	const line = pos.line - 1;
	const character = pos.col - 1;

	return [{
		startLine: line,
		startCharacter: character,
		endLine: line,
		endCharacter: character,
		newText: `id: ${slug}\n${' '.repeat(character)}`,
	}];
}

const STRUCTURED_FILTER_KEYS = new Set([
	'workItemTypes', 'states', 'statesExclude', 'statesWereEver',
	'tags', 'areaPaths', 'areaPathsUnder', 'iterations', 'iterationsUnder',
	'assignedTo', 'changedAfter', 'createdAfter', 'priority',
]);

export function fixSavedQueryWithStructuredFilter(docText: string, _range: PlainRange, _data: unknown): TextEdit[] | null {
	const lc = new LineCounter();
	const doc = parseDocument(docText, { lineCounter: lc });
	const root = doc.contents;
	if (!isMap(root)) return null;

	const filterNode = root.get('filter', true);
	if (!isMap(filterNode)) return null;

	const lines = docText.split('\n');
	const edits: TextEdit[] = [];

	for (const pair of filterNode.items) {
		if (!isPair(pair)) continue;
		const key = pair.key as ParsedNode;
		if (!key.range) continue;

		const keyValue = (key as { value?: unknown }).value;
		const keyStr = typeof keyValue === 'string' ? keyValue : String(keyValue ?? '');
		if (!STRUCTURED_FILTER_KEYS.has(keyStr)) continue;

		const pos = lc.linePos(key.range[0]);
		const keyLine = pos.line - 1;
		const indent = lineIndent(lines[keyLine] ?? '');
		const blockEnd = blockEndLine(lines, keyLine, indent);

		edits.push({
			startLine: keyLine,
			startCharacter: 0,
			endLine: blockEnd,
			endCharacter: 0,
			newText: '',
		});
	}

	return edits.length > 0 ? edits : null;
}
