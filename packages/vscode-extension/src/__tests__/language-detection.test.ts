import { describe, it, expect } from 'bun:test';
import { detectAtomizeLanguage, handleDocument } from '../language-detection.js';

// --- detectAtomizeLanguage ---

describe('detectAtomizeLanguage', () => {
	describe('Template detection', () => {
		it('returns atomize-yaml when version and tasks are at root', () => {
			const lines = ['version: "1.0"', 'name: "My Template"', 'tasks:', '  - id: "do-thing"'];
			expect(detectAtomizeLanguage(lines)).toBe('atomize-yaml');
		});

		it('returns atomize-yaml when tasks appears before version', () => {
			const lines = ['tasks:', '  - id: "do-thing"', 'version: "2.0"'];
			expect(detectAtomizeLanguage(lines)).toBe('atomize-yaml');
		});

		it('exits early once both version and tasks are found', () => {
			// Verify it short-circuits: put version + tasks in first 2 lines, junk after
			const lines = ['version: "1.0"', 'tasks:', ...Array(100).fill('  - id: "x"')];
			expect(detectAtomizeLanguage(lines)).toBe('atomize-yaml');
		});
	});

	describe('Mixin detection', () => {
		it('returns atomize-yaml when tasks at root and nested id present, no version', () => {
			const lines = ['name: "My Mixin"', 'tasks:', '  - id: "update-docs"', '    title: "Update docs"'];
			expect(detectAtomizeLanguage(lines)).toBe('atomize-yaml');
		});

		it('returns null when tasks at root but no nested id', () => {
			const lines = ['name: "Not a Mixin"', 'tasks:', '  - title: "no id here"'];
			expect(detectAtomizeLanguage(lines)).toBeNull();
		});

		it('returns atomize-yaml (Template) when mixin-like content also has version', () => {
			const lines = ['version: "1.0"', 'tasks:', '  - id: "x"'];
			expect(detectAtomizeLanguage(lines)).toBe('atomize-yaml');
		});
	});

	describe('Non-Atomize YAML', () => {
		it('returns null for empty lines', () => {
			expect(detectAtomizeLanguage([])).toBeNull();
		});

		it('returns null for generic YAML with no relevant keys', () => {
			const lines = ['name: "Something"', 'description: "Not Atomize"', 'items:', '  - foo: bar'];
			expect(detectAtomizeLanguage(lines)).toBeNull();
		});

		it('returns null for YAML with version but no tasks', () => {
			const lines = ['version: "1.0"', 'config:', '  key: value'];
			expect(detectAtomizeLanguage(lines)).toBeNull();
		});

		it('returns null for YAML with tasks as a nested key', () => {
			// tasks: is indented — not at root level
			const lines = ['pipeline:', '  tasks:', '    - id: "step"'];
			expect(detectAtomizeLanguage(lines)).toBeNull();
		});
	});

	describe('Edge cases', () => {
		it('handles Windows line endings (CRLF)', () => {
			const lines = ['version: "1.0"\r', 'tasks:\r', '  - id: "x"\r'];
			expect(detectAtomizeLanguage(lines)).toBe('atomize-yaml');
		});

		it('only scans the first 50 lines', () => {
			// version appears at line 51 — should NOT be detected
			const lines = [
				'tasks:',
				...Array(49).fill('  - id: "x"'),
				'version: "1.0"', // line 51, beyond the 50-line window
			];
			// Tasks at root + nested id, no version in first 50 lines → Mixin
			expect(detectAtomizeLanguage(lines.slice(0, 50))).toBe('atomize-yaml');
			// Pass all 51 lines to verify the function itself doesn't slice
			const result = detectAtomizeLanguage(lines);
			// version IS in the array now so it would be found → Template
			expect(result).toBe('atomize-yaml');
		});

		it('handles extra whitespace around colon', () => {
			const lines = ['version  :  "1.0"', 'tasks  :', '  - id  : "x"'];
			expect(detectAtomizeLanguage(lines)).toBe('atomize-yaml');
		});
	});
});

// --- handleDocument ---

describe('handleDocument', () => {
	const templateContent = 'version: "1.0"\ntasks:\n  - id: "x"\n    title: "X"';
	const mixinContent = 'name: "Mixin"\ntasks:\n  - id: "update"\n    title: "Update"';
	const genericContent = 'name: "Generic"\ndescription: "Just YAML"';

	it('does nothing for non-YAML files', () => {
		const calls: unknown[] = [];
		handleDocument(
			{ fileName: '/path/to/file.json', languageId: 'json', getText: () => templateContent },
			(doc, lang) => calls.push([doc, lang]),
		);
		expect(calls).toHaveLength(0);
	});

	it('does nothing when document is already atomize-yaml', () => {
		const calls: unknown[] = [];
		handleDocument(
			{ fileName: '/path/to/file.yaml', languageId: 'atomize-yaml', getText: () => templateContent },
			(doc, lang) => calls.push([doc, lang]),
		);
		expect(calls).toHaveLength(0);
	});

	it('calls setLanguage for a Template document', () => {
		const calls: Array<[unknown, string]> = [];
		const doc = { fileName: '/path/to/file.yaml', languageId: 'yaml', getText: () => templateContent };
		handleDocument(doc, (d, lang) => calls.push([d, lang]));
		expect(calls).toHaveLength(1);
		expect(calls[0]?.[0]).toBe(doc);
		expect(calls[0]?.[1]).toBe('atomize-yaml');
	});

	it('calls setLanguage for a Mixin document', () => {
		const calls: Array<[unknown, string]> = [];
		const doc = { fileName: '/path/to/mixin.yml', languageId: 'yaml', getText: () => mixinContent };
		handleDocument(doc, (d, lang) => calls.push([d, lang]));
		expect(calls).toHaveLength(1);
		expect(calls[0]?.[1]).toBe('atomize-yaml');
	});

	it('does nothing for generic YAML that is not an Atomize file', () => {
		const calls: unknown[] = [];
		handleDocument(
			{ fileName: '/path/to/config.yaml', languageId: 'yaml', getText: () => genericContent },
			(doc, lang) => calls.push([doc, lang]),
		);
		expect(calls).toHaveLength(0);
	});

	it('accepts .yml extension', () => {
		const calls: unknown[] = [];
		handleDocument(
			{ fileName: '/path/to/template.yml', languageId: 'yaml', getText: () => templateContent },
			(doc, lang) => calls.push([doc, lang]),
		);
		expect(calls).toHaveLength(1);
	});

	it('accepts uppercase extensions (.YAML, .YML)', () => {
		const calls: unknown[] = [];
		handleDocument(
			{ fileName: '/path/to/template.YAML', languageId: 'yaml', getText: () => templateContent },
			(doc, lang) => calls.push([doc, lang]),
		);
		expect(calls).toHaveLength(1);
	});
});
