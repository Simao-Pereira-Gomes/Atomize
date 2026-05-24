const LANGUAGE_ID = 'atomize-yaml' as const;

export const LAYER1_PATTERNS: RegExp[] = [
	/\.atomize\.ya?ml$/i,
];

const CONTENT_DETECTION_EXCLUDED_PATTERNS: RegExp[] = [
	/(?:^|[\\/])\.github[\\/]workflows[\\/][^\\/]+\.ya?ml$/i,
];

function isContentDetectionExcluded(fileName: string): boolean {
	return CONTENT_DETECTION_EXCLUDED_PATTERNS.some(re => re.test(fileName));
}

function hasModeline(text: string): boolean {
	const firstLine = text.split('\n', 1)[0]?.replace(/\r$/, '') ?? '';
	return /^#\s*atomize-yaml/.test(firstLine);
}

export function isAtomizeToolingDocument(doc: { languageId: string; fileName: string; getText(): string }): boolean {
	if (doc.languageId === LANGUAGE_ID) return true;
	if (doc.languageId !== 'yaml') return false;
	if (LAYER1_PATTERNS.some(re => re.test(doc.fileName))) return true;
	return hasModeline(doc.getText());
}

export function isAtomizeDocument(doc: { languageId: string; fileName: string; getText(): string }): boolean {
	if (isAtomizeToolingDocument(doc)) return true;
	if (doc.languageId !== 'yaml') return false;
	if (isContentDetectionExcluded(doc.fileName)) return false;
	const lines = doc.getText().split('\n').slice(0, 50);
	return detectAtomizeLanguage(lines) !== null;
}

/**
 * Schema support is broader than full tooling: content-only matches get hovers
 * and autocomplete, but not CodeLens actions or save-time CLI validation.
 */
export function isAtomizeSchemaDocument(doc: { languageId: string; fileName: string; getText(): string }): boolean {
	return isAtomizeDocument(doc);
}

export type AtomizeLanguageId = typeof LANGUAGE_ID;

/**
 * Detects whether lines of YAML content belong to an Atomize Template or Mixin.
 *
 * Template signature: `version:` AND `tasks:` at root level.
 * Mixin signature:    `tasks:` at root level + nested `id:` property + no `version:`.
 */
export function detectAtomizeLanguage(lines: string[]): AtomizeLanguageId | null {
	if (lines.length > 0 && /^#\s*atomize-yaml/.test(lines[0]?.replace(/\r$/, '') ?? '')) {
		return LANGUAGE_ID;
	}

	let hasVersion = false;
	let hasRootTasks = false;
	let hasRootFilter = false;
	let hasNestedId = false;

	for (const raw of lines) {
		const line = raw.replace(/\r$/, '');
		if (/^version\s*:/.test(line)) hasVersion = true;
		if (/^tasks\s*:/.test(line)) hasRootTasks = true;
		if (/^filter\s*:/.test(line)) hasRootFilter = true;
		if (/^\s+(?:-\s+)?id\s*:/.test(line)) hasNestedId = true;

		// Template: must have version + tasks + filter (filter is Atomize-specific).
		// Requiring filter avoids false positives on Taskfile.yml and similar formats.
		if (hasVersion && hasRootTasks && hasRootFilter) return LANGUAGE_ID;
	}

	// Mixin: tasks at root + nested id, no version key.
	if (hasRootTasks && hasNestedId && !hasVersion) return LANGUAGE_ID;

	return null;
}

/**
 * Returns true when a document is an Atomize file detected only by content
 * heuristics — i.e. it has neither the .atomize.yaml extension nor a modeline.
 * Used to prompt the user to adopt a durable opt-in convention.
 */
export function isContentOnlyDetected(doc: { languageId: string; fileName: string; getText(): string }): boolean {
	if (isAtomizeToolingDocument(doc)) return false;
	if (doc.languageId !== 'yaml') return false;
	if (isContentDetectionExcluded(doc.fileName)) return false;
	const lines = doc.getText().split('\n').slice(0, 50);
	return detectAtomizeLanguage(lines) !== null;
}

/**
 * Keeps Atomize files on the YAML language service. Older extension builds
 * assigned durable Atomize files to atomize-yaml, but Red Hat YAML hovers and
 * completions are provided to yaml documents.
 */
export function handleDocument(
	doc: { fileName: string; languageId: string; getText(): string },
	setLanguage: (doc: unknown, lang: string) => void,
): void {
	if (!/\.ya?ml$/i.test(doc.fileName)) return;
	if (LAYER1_PATTERNS.some(re => re.test(doc.fileName)) && doc.languageId !== 'yaml') {
		setLanguage(doc, 'yaml');
		return;
	}
	if (doc.languageId === LANGUAGE_ID) setLanguage(doc, 'yaml');
}
