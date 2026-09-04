import { describe, expect, it } from 'bun:test';
import {
	detectAtomizeLanguage,
	handleDocument,
	isAtomizeDocument,
	isAtomizeSchemaDocument,
	isAtomizeToolingDocument,
	isContentOnlyDetected,
	isMixinDocument,
} from '../authoring/language-detection.js';

// --- detectAtomizeLanguage ---

describe('detectAtomizeLanguage', () => {
	describe('Modeline detection', () => {
		it('returns atomize-yaml when first line is # atomize-yaml', () => {
			expect(detectAtomizeLanguage(['# atomize-yaml', 'name: "Something"'])).toBe('atomize-yaml');
		});

		it('returns atomize-yaml when modeline has extra whitespace', () => {
			expect(detectAtomizeLanguage(['#  atomize-yaml', 'name: "Something"'])).toBe('atomize-yaml');
		});

		it('returns atomize-yaml for modeline-only file (no structural keys)', () => {
			expect(detectAtomizeLanguage(['# atomize-yaml'])).toBe('atomize-yaml');
		});

		it('returns null when modeline appears on line 2, not line 1', () => {
			const lines = ['name: "Something"', '# atomize-yaml', 'tasks:'];
			expect(detectAtomizeLanguage(lines)).toBeNull();
		});
	});

	describe('Template detection', () => {
		it('returns atomize-yaml when version, filter, and tasks are at root', () => {
			const lines = ['version: "1.0"', 'name: "My Template"', 'filter:', '  team: "Dev"', 'tasks:', '  - id: "do-thing"'];
			expect(detectAtomizeLanguage(lines)).toBe('atomize-yaml');
		});

		it('returns atomize-yaml when keys appear in any order', () => {
			const lines = ['tasks:', '  - id: "do-thing"', 'filter:', '  team: "Dev"', 'version: "2.0"'];
			expect(detectAtomizeLanguage(lines)).toBe('atomize-yaml');
		});

		it('returns null when filter is absent (avoids false positives on Taskfile.yml etc.)', () => {
			const lines = ['version: "1.0"', 'tasks:', '  - id: "do-thing"'];
			expect(detectAtomizeLanguage(lines)).toBeNull();
		});

		it('exits early once version, filter, and tasks are all found', () => {
			const lines = ['version: "1.0"', 'filter:', 'tasks:', ...Array(100).fill('  - id: "x"')];
			expect(detectAtomizeLanguage(lines)).toBe('atomize-yaml');
		});

		it('returns atomize-yaml for composed templates with extends and filter', () => {
			const lines = ['extends: "./base-template.yaml"', 'name: "Child"', 'filter:', '  workItemTypes: ["User Story"]'];
			expect(detectAtomizeLanguage(lines)).toBe('atomize-yaml');
		});

		it('returns atomize-yaml for composed templates with mixins and tasks', () => {
			const lines = ['mixins:', '  - "./security.yaml"', 'tasks:', '  - title: "Review"'];
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

		it('returns atomize-yaml (Template) when mixin-like content also has version and filter', () => {
			const lines = ['version: "1.0"', 'filter:', 'tasks:', '  - id: "x"'];
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

		it('returns null for YAML with extends but no other Atomize structure', () => {
			const lines = ['extends: base'];
			expect(detectAtomizeLanguage(lines)).toBeNull();
		});

		it('returns null for YAML with tasks as a nested key', () => {
			// tasks: is indented — not at root level
			const lines = ['pipeline:', '  tasks:', '    - id: "step"'];
			expect(detectAtomizeLanguage(lines)).toBeNull();
		});

		it('returns null for GitHub Actions workflow YAML', () => {
			const lines = [
				'name: CI',
				'on:',
				'  push:',
				'jobs:',
				'  test:',
				'    runs-on: ubuntu-latest',
				'    steps:',
				'      - id: checkout',
				'        uses: actions/checkout@v4',
			];
			expect(detectAtomizeLanguage(lines)).toBeNull();
		});
	});

	describe('Edge cases', () => {
		it('handles Windows line endings (CRLF)', () => {
			const lines = ['version: "1.0"\r', 'filter:\r', 'tasks:\r', '  - id: "x"\r'];
			expect(detectAtomizeLanguage(lines)).toBe('atomize-yaml');
		});

		it('only scans the first 50 lines', () => {
			// version and filter appear after line 50 — not seen when slice is passed
			const lines = [
				'tasks:',
				...Array(49).fill('  - id: "x"'),
				'version: "1.0"', // line 51
				'filter:',         // line 52
			];
			// Tasks at root + nested id, no version in first 50 lines → Mixin
			expect(detectAtomizeLanguage(lines.slice(0, 50))).toBe('atomize-yaml');
			// Pass all 52 lines — version + filter are found → Template
			expect(detectAtomizeLanguage(lines)).toBe('atomize-yaml');
		});

		it('handles extra whitespace around colon', () => {
			const lines = ['version  :  "1.0"', 'filter  :', 'tasks  :', '  - id  : "x"'];
			expect(detectAtomizeLanguage(lines)).toBe('atomize-yaml');
		});
	});
});

describe('isMixinDocument', () => {
	it('identifies a Mixin even when its filename has a durable Atomize extension', () => {
		const doc = {
			languageId: 'yaml',
			fileName: '/catalog/mixins/documentation.atomize.yaml',
			getText: () => 'name: Documentation\ntasks:\n  - id: update-docs\n    title: Update docs',
		};

		expect(isMixinDocument(doc)).toBe(true);
	});

	it('does not classify a full Template as a Mixin', () => {
		const doc = {
			languageId: 'yaml',
			fileName: '/catalog/templates/backend-api.atomize.yaml',
			getText: () => 'version: "1.0"\nfilter:\n  workItemTypes: [User Story]\ntasks:\n  - id: api',
		};

		expect(isMixinDocument(doc)).toBe(false);
	});

	it('does not classify an extending Template without a local version as a Mixin', () => {
		const doc = {
			languageId: 'yaml',
			fileName: '/workspace/child-template.atomize.yaml',
			getText: () => 'extends: "./base-template.yaml"\nname: Child\ntasks:\n  - id: implementation\n    title: Implement child behavior',
		};

		expect(isMixinDocument(doc)).toBe(false);
	});
});

// --- isAtomizeDocument ---

describe('isAtomizeDocument', () => {
	const atomizeLikeContent = 'name: "Mixin"\ntasks:\n  - id: "update"\n    title: "Update"';

	it('returns true for .atomize.yaml files by filename', () => {
		const doc = { fileName: '/path/template.atomize.yaml', languageId: 'yaml', getText: () => 'name: anything' };
		expect(isAtomizeDocument(doc)).toBe(true);
	});

	it('returns false for GitHub Actions workflows under an atomize checkout path', () => {
		const doc = {
			fileName: '/Users/simaogomes/Dev/atomize/Atomize/.github/workflows/ci.yml',
			languageId: 'yaml',
			getText: () => atomizeLikeContent,
		};
		expect(isAtomizeDocument(doc)).toBe(false);
	});
});

// --- isAtomizeToolingDocument ---

describe('isAtomizeToolingDocument', () => {
	const atomizeLikeContent = 'name: "Mixin"\ntasks:\n  - id: "update"\n    title: "Update"';

	it('returns true for .atomize.yaml files', () => {
		const doc = { fileName: '/path/template.atomize.yaml', languageId: 'yaml', getText: () => 'name: anything' };
		expect(isAtomizeToolingDocument(doc)).toBe(true);
	});

	it('returns true for files with the atomize-yaml modeline', () => {
		const doc = { fileName: '/path/template.yaml', languageId: 'yaml', getText: () => '# atomize-yaml\nname: anything' };
		expect(isAtomizeToolingDocument(doc)).toBe(true);
	});

	it('returns true for documents already assigned the atomize-yaml language ID', () => {
		const doc = { fileName: '/path/template.yaml', languageId: 'atomize-yaml', getText: () => atomizeLikeContent };
		expect(isAtomizeToolingDocument(doc)).toBe(true);
	});

	it('returns false for content-only detected Atomize YAML', () => {
		const doc = { fileName: '/path/template.yaml', languageId: 'yaml', getText: () => atomizeLikeContent };
		expect(isAtomizeDocument(doc)).toBe(true);
		expect(isAtomizeToolingDocument(doc)).toBe(false);
	});
});

// --- isAtomizeSchemaDocument ---

describe('isAtomizeSchemaDocument', () => {
	const templateContent = 'version: "1.0"\nfilter:\n  team: Dev\ntasks:\n  - id: "x"\n    title: "X"';
	const mixinContent = 'name: "Mixin"\ntasks:\n  - id: "update"\n    title: "Update"';

	it('returns true for .atomize.yaml files', () => {
		const doc = { fileName: '/path/template.atomize.yaml', languageId: 'yaml', getText: () => 'name: anything' };
		expect(isAtomizeSchemaDocument(doc)).toBe(true);
	});

	it('returns true for files with the atomize-yaml modeline', () => {
		const doc = { fileName: '/path/template.yaml', languageId: 'yaml', getText: () => '# atomize-yaml\nname: anything' };
		expect(isAtomizeSchemaDocument(doc)).toBe(true);
	});

	it('returns true for documents already assigned the atomize-yaml language ID', () => {
		const doc = { fileName: '/path/template.yaml', languageId: 'atomize-yaml', getText: () => 'name: anything' };
		expect(isAtomizeSchemaDocument(doc)).toBe(true);
	});

	it('returns true for content-only detected Templates', () => {
		const doc = { fileName: '/path/template.yaml', languageId: 'yaml', getText: () => templateContent };
		expect(isAtomizeSchemaDocument(doc)).toBe(true);
		expect(isAtomizeToolingDocument(doc)).toBe(false);
	});

	it('returns true for content-only detected Mixins', () => {
		const doc = { fileName: '/path/mixin.yaml', languageId: 'yaml', getText: () => mixinContent };
		expect(isAtomizeSchemaDocument(doc)).toBe(true);
		expect(isAtomizeToolingDocument(doc)).toBe(false);
	});

	it('returns false for generic YAML', () => {
		const doc = { fileName: '/path/config.yaml', languageId: 'yaml', getText: () => 'name: foo\ndescription: bar' };
		expect(isAtomizeSchemaDocument(doc)).toBe(false);
	});

	it('returns false for GitHub Actions workflows even when content looks mixin-like', () => {
		const doc = {
			fileName: '/Users/simaogomes/Dev/atomize/Atomize/.github/workflows/ci.yml',
			languageId: 'yaml',
			getText: () => mixinContent,
		};
		expect(isAtomizeSchemaDocument(doc)).toBe(false);
	});
});

// --- isContentOnlyDetected ---

describe('isContentOnlyDetected', () => {
	const templateContent = 'version: "1.0"\nfilter:\n  team: Dev\ntasks:\n  - id: "x"\n    title: "X"';
	const mixinContent = 'name: "Mixin"\ntasks:\n  - id: "update"\n    title: "Update"';

	it('returns true when structure matches but no extension or modeline', () => {
		const doc = { fileName: '/path/config.yaml', languageId: 'yaml', getText: () => templateContent };
		expect(isContentOnlyDetected(doc)).toBe(true);
	});

	it('returns false when file has .atomize.yaml extension', () => {
		const doc = { fileName: '/path/my.atomize.yaml', languageId: 'yaml', getText: () => templateContent };
		expect(isContentOnlyDetected(doc)).toBe(false);
	});

	it('returns false when file has modeline on line 1', () => {
		const doc = { fileName: '/path/config.yaml', languageId: 'yaml', getText: () => `# atomize-yaml\n${templateContent}` };
		expect(isContentOnlyDetected(doc)).toBe(false);
	});

	it('returns false when languageId is already atomize-yaml', () => {
		const doc = { fileName: '/path/config.yaml', languageId: 'atomize-yaml', getText: () => templateContent };
		expect(isContentOnlyDetected(doc)).toBe(false);
	});

	it('returns false for generic YAML that does not match structure', () => {
		const doc = { fileName: '/path/config.yaml', languageId: 'yaml', getText: () => 'name: foo\ndescription: bar' };
		expect(isContentOnlyDetected(doc)).toBe(false);
	});

	it('returns true for mixin matched by content only', () => {
		const doc = { fileName: '/path/mixin.yaml', languageId: 'yaml', getText: () => mixinContent };
		expect(isContentOnlyDetected(doc)).toBe(true);
	});

	it('returns false for GitHub Actions workflows even when content looks mixin-like', () => {
		const doc = {
			fileName: '/Users/simaogomes/Dev/atomize/Atomize/.github/workflows/ci.yml',
			languageId: 'yaml',
			getText: () => mixinContent,
		};
		expect(isContentOnlyDetected(doc)).toBe(false);
	});
});

// --- handleDocument ---

describe('handleDocument', () => {
	const templateContent = 'version: "1.0"\nfilter:\n  team: Dev\ntasks:\n  - id: "x"\n    title: "X"';
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

	it('switches atomize-yaml documents back to yaml so the YAML language service provides hovers', () => {
		const calls: Array<[unknown, string]> = [];
		const doc = { fileName: '/path/to/file.yaml', languageId: 'atomize-yaml', getText: () => templateContent };
		handleDocument(
			doc,
			(doc, lang) => calls.push([doc, lang]),
		);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.[0]).toBe(doc);
		expect(calls[0]?.[1]).toBe('yaml');
	});

	it('does nothing for a .atomize.yaml file already using yaml', () => {
		const calls: Array<[unknown, string]> = [];
		const doc = { fileName: '/path/to/file.atomize.yaml', languageId: 'yaml', getText: () => templateContent };
		handleDocument(doc, (d, lang) => calls.push([d, lang]));
		expect(calls).toHaveLength(0);
	});

	it('switches a .atomize.yaml file from plaintext to yaml', () => {
		const calls: Array<[unknown, string]> = [];
		const doc = { fileName: '/path/to/file.atomize.yaml', languageId: 'plaintext', getText: () => templateContent };
		handleDocument(doc, (d, lang) => calls.push([d, lang]));
		expect(calls).toHaveLength(1);
		expect(calls[0]?.[0]).toBe(doc);
		expect(calls[0]?.[1]).toBe('yaml');
	});

	it('does nothing for a .atomize.yml file already using yaml', () => {
		const calls: Array<[unknown, string]> = [];
		const doc = { fileName: '/path/to/mixin.atomize.yml', languageId: 'yaml', getText: () => mixinContent };
		handleDocument(doc, (d, lang) => calls.push([d, lang]));
		expect(calls).toHaveLength(0);
	});

	it('does nothing for a file with a modeline already using yaml', () => {
		const calls: Array<[unknown, string]> = [];
		const doc = { fileName: '/path/to/file.yaml', languageId: 'yaml', getText: () => `# atomize-yaml\n${templateContent}` };
		handleDocument(doc, (d, lang) => calls.push([d, lang]));
		expect(calls).toHaveLength(0);
	});

	it('does nothing for a content-only Template document without extension or modeline', () => {
		const calls: unknown[] = [];
		handleDocument(
			{ fileName: '/path/to/file.yaml', languageId: 'yaml', getText: () => templateContent },
			(doc, lang) => calls.push([doc, lang]),
		);
		expect(calls).toHaveLength(0);
	});

	it('does nothing for a content-only Mixin document without extension or modeline', () => {
		const calls: unknown[] = [];
		handleDocument(
			{ fileName: '/path/to/mixin.yml', languageId: 'yaml', getText: () => mixinContent },
			(doc, lang) => calls.push([doc, lang]),
		);
		expect(calls).toHaveLength(0);
	});

	it('does nothing for generic YAML that is not an Atomize file', () => {
		const calls: unknown[] = [];
		handleDocument(
			{ fileName: '/path/to/config.yaml', languageId: 'yaml', getText: () => genericContent },
			(doc, lang) => calls.push([doc, lang]),
		);
		expect(calls).toHaveLength(0);
	});

	it('does nothing for uppercase .atomize.YAML extension already using yaml', () => {
		const calls: unknown[] = [];
		handleDocument(
			{ fileName: '/path/to/template.atomize.YAML', languageId: 'yaml', getText: () => templateContent },
			(doc, lang) => calls.push([doc, lang]),
		);
		expect(calls).toHaveLength(0);
	});

	it('does nothing for GitHub Actions workflows under an atomize checkout path', () => {
		const calls: unknown[] = [];
		handleDocument(
			{
				fileName: '/Users/simaogomes/Dev/atomize/Atomize/.github/workflows/ci.yml',
				languageId: 'yaml',
				getText: () => mixinContent,
			},
			(doc, lang) => calls.push([doc, lang]),
		);
		expect(calls).toHaveLength(0);
	});
});
