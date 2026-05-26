import { afterEach, describe, expect, it, mock } from 'bun:test';
import { EventEmitter } from 'node:events';

import {
	type AdoProfileJson,
	parseAdoProfilesJson,
	sanitizeCliError,
	sortAdoProfiles,
	supportsNativeRotation,
} from '../profiles/profile-management-model.js';

const profiles: AdoProfileJson[] = [
	{
		name: 'zeta',
		platform: 'azure-devops',
		isDefault: false,
		organizationUrl: 'https://dev.azure.com/acme',
		project: 'Product',
		team: 'Core',
		tokenStorage: 'keychain',
	},
	{
		name: 'alpha',
		platform: 'azure-devops',
		isDefault: true,
		organizationUrl: 'https://dev.azure.com/acme',
		project: 'Product',
		team: 'Core',
		tokenStorage: 'file',
	},
	{
		name: 'beta',
		platform: 'azure-devops',
		isDefault: false,
		organizationUrl: 'https://dev.azure.com/acme',
		project: 'Product',
		team: 'Core',
		tokenStorage: 'keychain',
	},
];

describe('profile-management helpers', () => {
	it('sorts default first, then alphabetically', () => {
		expect(sortAdoProfiles(profiles).map(p => p.name)).toEqual(['alpha', 'beta', 'zeta']);
	});

	it('parses only Azure DevOps profiles from auth list JSON', () => {
		const parsed = parseAdoProfilesJson(JSON.stringify([
			...profiles,
			{ name: 'ai', platform: 'github-models', isDefault: true, model: 'gpt-4o', tokenStorage: 'keychain' },
		]));
		expect(parsed?.map(p => p.name)).toEqual(['zeta', 'alpha', 'beta']);
	});

	it('rejects malformed auth list JSON', () => {
		expect(parseAdoProfilesJson('not json')).toBeUndefined();
		expect(parseAdoProfilesJson(JSON.stringify({ profiles }))).toBeUndefined();
	});

	it('allows native rotation only for keychain-backed profiles', () => {
		expect(supportsNativeRotation(profiles[0])).toBe(true);
		expect(supportsNativeRotation(profiles[1])).toBe(false);
		expect(supportsNativeRotation({ ...profiles[0], tokenStorage: undefined })).toBe(false);
	});

	it('compacts CLI error output', () => {
		expect(sanitizeCliError({ stderr: 'Error: failed\n', stdout: 'details' })).toBe('Error: failed details');
		expect(sanitizeCliError({ stderr: '   ', stdout: '' })).toBeUndefined();
	});
});

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
		let profileListCall = 0;

		mock.module('vscode', () => ({
			ProgressLocation: { Notification: 15 },
			QuickPickItemKind: { Separator: -1 },
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

		mock.module('node:child_process', () => ({
			spawn: mock((_cliPath: string, args: string[]) => {
				const stdout = new EventEmitter();
				const stderr = new EventEmitter();
				const proc = new EventEmitter() as EventEmitter & {
					stdout: EventEmitter;
					stderr: EventEmitter;
					stdin: { end: (input?: string) => void };
				};
				proc.stdout = stdout;
				proc.stderr = stderr;
				proc.stdin = {
					end: () => {
						queueMicrotask(() => {
							let output = '';
							if (args.join(' ') === 'auth remove --help') output = '--confirm\n--new-default\n';
							else if (args.join(' ') === 'auth rotate --help') output = '--pat-stdin\n';
							else if (args.join(' ') === 'auth list --json') {
								profileListCall += 1;
								output = JSON.stringify(profileListCall < 3 ? [] : [{
									name: 'work',
									platform: 'azure-devops',
									isDefault: true,
									organizationUrl: 'https://dev.azure.com/acme',
									project: 'Product',
									team: 'Core',
									tokenStorage: 'keychain',
								}]);
							}
							if (output) stdout.emit('data', Buffer.from(output));
							proc.emit('close', 0);
						});
					},
				};
				return proc;
			}),
		}));

		const { manageProfiles } = await import('../profiles/profile-management.js');
		await manageProfiles('atomize', async () => true);

		expect(quickPickLabels).toEqual([
			['Add profile...'],
			['work', '', 'Add profile...'],
		]);
	});
});
