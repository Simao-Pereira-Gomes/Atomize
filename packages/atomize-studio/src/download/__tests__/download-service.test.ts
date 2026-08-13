import { describe, expect, it } from 'vitest';
import { DownloadError, downloadTemplate, slugifyTemplateName } from '../download-service.js';

describe('downloadTemplate', () => {
	it('writes the yaml to the chosen path and returns it', async () => {
		const writes: Array<{ path: string; contents: string }> = [];
		const saveDialog = async () => '/Users/me/Desktop/backend-standard.atomize.yaml';
		const writeFile = async (path: string, contents: string) => {
			writes.push({ path, contents });
		};

		const result = await downloadTemplate('name: test\n', 'backend-standard.atomize.yaml', saveDialog, writeFile);

		expect(result).toBe('/Users/me/Desktop/backend-standard.atomize.yaml');
		expect(writes).toEqual([{ path: '/Users/me/Desktop/backend-standard.atomize.yaml', contents: 'name: test\n' }]);
	});

	it('returns undefined and never writes when the dialog is cancelled', async () => {
		let writeCalled = false;
		const saveDialog = async () => null;
		const writeFile = async () => {
			writeCalled = true;
		};

		const result = await downloadTemplate('name: test\n', 'backend-standard.atomize.yaml', saveDialog, writeFile);

		expect(result).toBeUndefined();
		expect(writeCalled).toBe(false);
	});

	it('wraps a save dialog failure in DownloadError', async () => {
		const saveDialog = async () => {
			throw new Error('dialog crashed');
		};
		const writeFile = async () => {};

		const error = await downloadTemplate('name: test\n', 'x.atomize.yaml', saveDialog, writeFile).catch(e => e);
		expect(error).toBeInstanceOf(DownloadError);
		expect((error as DownloadError).message).toBe('dialog crashed');
	});

	it('wraps a write failure in DownloadError', async () => {
		const saveDialog = async () => '/Users/me/Desktop/x.atomize.yaml';
		const writeFile = async () => {
			throw new Error('disk full');
		};

		const error = await downloadTemplate('name: test\n', 'x.atomize.yaml', saveDialog, writeFile).catch(e => e);
		expect(error).toBeInstanceOf(DownloadError);
		expect((error as DownloadError).message).toBe('disk full');
	});
});

describe('slugifyTemplateName', () => {
	it('lowercases and hyphenates spaces and punctuation', () => {
		expect(slugifyTemplateName('Backend API Standard')).toBe('backend-api-standard');
		expect(slugifyTemplateName('Bug Fix / Hotfix!')).toBe('bug-fix-hotfix');
	});

	it('leaves an already-slugified name unchanged', () => {
		expect(slugifyTemplateName('backend-standard')).toBe('backend-standard');
	});

	it('trims leading and trailing separators', () => {
		expect(slugifyTemplateName('  --Weird Name--  ')).toBe('weird-name');
	});

	it('falls back to "template" for an empty or fully-stripped name', () => {
		expect(slugifyTemplateName('')).toBe('template');
		expect(slugifyTemplateName('   ')).toBe('template');
		expect(slugifyTemplateName('!!!')).toBe('template');
	});
});
