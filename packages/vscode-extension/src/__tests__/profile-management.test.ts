import { afterEach, describe, expect, it, mock } from 'bun:test';
import { baseVscodeMock } from './vscode-test-helpers.js';

function createFakeContext() {
	const globalStateMap = new Map<string, unknown>();
	const secretsMap = new Map<string, string>();
	return {
		globalState: {
			get: (key: string, def?: unknown) => globalStateMap.has(key) ? globalStateMap.get(key) : def,
			update: async (key: string, value: unknown) => { globalStateMap.set(key, value); },
		},
		secrets: {
			get: async (key: string) => secretsMap.get(key),
			store: async (key: string, value: string) => { secretsMap.set(key, value); },
			delete: async (key: string) => { secretsMap.delete(key); },
		},
	};
}

const fakeCredentialResolver = {
	resolveByName: async () => { throw new Error('not used in this test'); },
};

let importCounter = 0;

describe('manageProfiles', () => {
	afterEach(() => {
		mock.restore();
	});

	it('refreshes the profile quick pick after adding a profile', async () => {
		const quickPickLabels: string[][] = [];
		const inputValues = [
			'work',
			'https://dev.azure.com/acme',
			'Product',
			'Core',
			'pat-token',
		];

		mock.module('vscode', () => ({
			...baseVscodeMock(),
			window: {
				showErrorMessage: mock(() => undefined),
				showInformationMessage: mock(() => undefined),
				showInputBox: mock(async () => inputValues.shift()),
				showQuickPick: mock(async (items: Array<{ label: string; action?: string }>) => {
					quickPickLabels.push(items.map(item => item.label));
					return quickPickLabels.length === 1
						? items.find(item => item.action === 'add')
						: undefined;
				}),
				showWarningMessage: mock(() => undefined),
				withProgress: mock(async (_options: unknown, task: () => Promise<unknown>) => task()),
			},
		}));

		mock.module('../profiles/cli-import.js', () => ({
			readCliProfiles: async () => [],
		}));

		const { manageProfiles } = await import(`../profiles/profile-management.js?t=${importCounter++}`);
		const { ProfileStore } = await import(`../profiles/profile-store.js?t=${importCounter++}`);

		const store = new ProfileStore(createFakeContext());
		await manageProfiles(store, fakeCredentialResolver);

		expect(quickPickLabels).toEqual([
			['Add profile...'],
			['work', '', 'Add profile...'],
		]);
	});
});
