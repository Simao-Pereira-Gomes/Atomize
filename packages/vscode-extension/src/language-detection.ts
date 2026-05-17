const LANGUAGE_ID = 'atomize-yaml' as const;

export type AtomizeLanguageId = typeof LANGUAGE_ID;

/**
 * Detects whether lines of YAML content belong to an Atomize Template or Mixin.
 *
 * Template signature: `version:` AND `tasks:` at root level.
 * Mixin signature:    `tasks:` at root level + nested `id:` property + no `version:`.
 */
export function detectAtomizeLanguage(lines: string[]): AtomizeLanguageId | null {
	let hasVersion = false;
	let hasRootTasks = false;
	let hasNestedId = false;

	for (const raw of lines) {
		const line = raw.replace(/\r$/, '');
		if (/^version\s*:/.test(line)) hasVersion = true;
		if (/^tasks\s*:/.test(line)) hasRootTasks = true;
		if (/^\s+(?:-\s+)?id\s*:/.test(line)) hasNestedId = true;

		if (hasVersion && hasRootTasks) return LANGUAGE_ID;
	}

	if (hasRootTasks && hasNestedId && !hasVersion) return LANGUAGE_ID;

	return null;
}

/**
 * Runs language detection on a text document and calls setLanguage when
 * the document is identified as atomize-yaml. Uses structural typing so
 * this function is importable without a vscode dependency.
 */
export function handleDocument(
	doc: { fileName: string; languageId: string; getText(): string },
	setLanguage: (doc: unknown, lang: string) => void,
): void {
	if (!/\.ya?ml$/i.test(doc.fileName)) return;
	if (doc.languageId === LANGUAGE_ID) return;
	const lines = doc.getText().split('\n').slice(0, 50);
	const detected = detectAtomizeLanguage(lines);
	if (detected) setLanguage(doc, detected);
}
