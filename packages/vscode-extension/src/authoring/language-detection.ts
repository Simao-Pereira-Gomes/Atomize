import { MixinTemplateSchema } from '@sppg2001/atomize-core/templates/schema';

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
 * A Mixin contributes tasks to a Template and cannot run on its own. A document is a Mixin when it
 * has root tasks and every root key is one a Mixin allows; any Template-only key (filter, extends,
 * mixins, estimation, …) makes it a Template, even an incomplete one.
 */
export function isMixinDocument(doc: { getText(): string }): boolean {
	const rootKeys = doc.getText().split('\n')
		.map(raw => /^([A-Za-z_][\w-]*)\s*:/.exec(raw.replace(/\r$/, ''))?.[1])
		.filter((key): key is string => key !== undefined);
	return rootKeys.includes('tasks') && rootKeys.every(key => MIXIN_KEYS.has(key));
}

const MIXIN_KEYS: ReadonlySet<string> = new Set(Object.keys(MixinTemplateSchema.shape));

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
 * Template signature: `tasks:` AND `filter:` at root level, or `extends:`/`mixins:` with Template content.
 *                     A root `formatVersion:` with `tasks:` is Atomize-specific on its own.
 * Mixin signature:    `tasks:` at root level + nested `id:` property, and either `formatVersion:` or no
 *                     `version:` (other tools' files, like Taskfile.yml, carry a version of their own).
 */
export function detectAtomizeLanguage(lines: string[]): AtomizeLanguageId | null {
	if (lines.length > 0 && /^#\s*atomize-yaml/.test(lines[0]?.replace(/\r$/, '') ?? '')) {
		return LANGUAGE_ID;
	}

	let hasVersion = false;
	let hasFormatVersion = false;
	let hasRootTasks = false;
	let hasRootFilter = false;
	let hasRootExtends = false;
	let hasRootMixins = false;
	let hasNestedId = false;

	for (const raw of lines) {
		const line = raw.replace(/\r$/, '');
		if (/^version\s*:/.test(line)) hasVersion = true;
		if (/^formatVersion\s*:/.test(line)) hasFormatVersion = true;
		if (/^tasks\s*:/.test(line)) hasRootTasks = true;
		if (/^filter\s*:/.test(line)) hasRootFilter = true;
		if (/^extends\s*:/.test(line)) hasRootExtends = true;
		if (/^mixins\s*:/.test(line)) hasRootMixins = true;
		if (/^\s+(?:-\s+)?id\s*:/.test(line)) hasNestedId = true;

		// Template: must have tasks + filter (filter is Atomize-specific).
		// Requiring filter avoids false positives on Taskfile.yml and similar formats.
		if (hasRootTasks && (hasRootFilter || hasFormatVersion)) return LANGUAGE_ID;
		if ((hasRootExtends || hasRootMixins) && (hasRootFilter || hasRootTasks || hasVersion || hasFormatVersion)) return LANGUAGE_ID;
	}

	// Mixin: tasks at root + nested id, with no version of another tool's format.
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
