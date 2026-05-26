import { describe, expect, it } from 'bun:test';
import { type CommandDocument, type CommandUri, resolveCommandDocument } from '../authoring/command-document-resolution.js';

function uri(value: string): CommandUri {
	return { toString: () => value };
}

function doc(value: string): CommandDocument {
	return { uri: uri(value) };
}

describe('resolveCommandDocument', () => {
	it('uses the active document when no command URI is provided', async () => {
		const active = doc('file:///active.atomize.yaml');

		await expect(resolveCommandDocument(undefined, active, [], async () => {
			throw new Error('should not open');
		})).resolves.toBe(active);
	});

	it('uses an already-open document for a matching command URI', async () => {
		const existing = doc('file:///existing.atomize.yaml');

		await expect(resolveCommandDocument(uri('file:///existing.atomize.yaml'), undefined, [existing], async () => {
			throw new Error('should not open');
		})).resolves.toBe(existing);
	});

	it('opens the command URI when the target document is not already open', async () => {
		const opened = doc('file:///later.atomize.yaml');
		const requested: string[] = [];

		const resolved = await resolveCommandDocument(
			uri('file:///later.atomize.yaml'),
			doc('file:///active.atomize.yaml'),
			[doc('file:///first.atomize.yaml')],
			async target => {
				requested.push(target.toString());
				return opened;
			},
		);

		expect(resolved).toBe(opened);
		expect(requested).toEqual(['file:///later.atomize.yaml']);
	});

	it('returns undefined when an unopened command URI cannot be opened', async () => {
		await expect(resolveCommandDocument(uri('file:///missing.atomize.yaml'), undefined, [], async () => {
			throw new Error('missing');
		})).resolves.toBeUndefined();
	});
});
