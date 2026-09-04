import { describe, expect, it } from 'vitest';
import { cancelGenerate, cancelOnlineValidation, checkCopilotAuthStatus, inspectPreview, installCatalogItem, queryGenerateStories, removeCatalogItem, runGenerate, runMockPreview, SidecarRequestError, validateOnline } from '../sidecar-client.js';

describe('Online Validation bridge', () => {
	it('sends the Template, selected profile, and client validation id through the native bridge', async () => {
		const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
		const call = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
			calls.push({ command, args });
			return { valid: true, errors: [], warnings: [], mode: 'lenient', requirements: { customFieldTaskCount: 0, conditionFieldRefs: [], hasSavedQuery: false, needsOnlineVerification: false } } as T;
		};
		const template = { version: '1.0', name: 'Delivery', filter: {}, tasks: [] };
		await validateOnline('validation-1', template, 'ado', call);
		expect(calls).toEqual([{ command: 'validation_online', args: { validationId: 'validation-1', template, profile: 'ado' } }]);
	});

	it('cancels an active validation by its client id', async () => {
		const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
		await cancelOnlineValidation('validation-1', async <T>(command: string, args?: Record<string, unknown>) => {
			calls.push({ command, args });
			return undefined as T;
		});
		expect(calls).toEqual([{ command: 'validation_cancel', args: { validationId: 'validation-1' } }]);
	});
});

describe('installCatalogItem', () => {
	it('invokes catalog_install_item with content, name, scope, and overwrite', async () => {
		const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
		const call = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
			calls.push({ command, args });
			return { kind: 'template', scope: 'user', name: 'delivery' } as T;
		};

		const result = await installCatalogItem('name: Delivery\n', 'delivery', 'user', false, call);

		expect(calls).toEqual([
			{ command: 'catalog_install_item', args: { content: 'name: Delivery\n', name: 'delivery', scope: 'user', overwrite: false } },
		]);
		expect(result).toEqual({ kind: 'template', scope: 'user', name: 'delivery' });
	});

	it('defaults overwrite to false when omitted', async () => {
		const calls: Array<Record<string, unknown> | undefined> = [];
		const call = async <T>(_command: string, args?: Record<string, unknown>): Promise<T> => {
			calls.push(args);
			return undefined as T;
		};

		await installCatalogItem('name: Delivery\n', 'delivery', 'project', undefined, call, '/projects/atomize');

		expect(calls).toEqual([{ content: 'name: Delivery\n', name: 'delivery', scope: 'project', overwrite: false, workspaceRoot: '/projects/atomize' }]);
	});

	it('wraps a structured sidecar error, preserving its code', async () => {
		const call = async () => {
			throw { code: 'CATALOG_ITEM_ALREADY_EXISTS', message: 'A template named "delivery" already exists.' };
		};

		const error = await installCatalogItem('name: Delivery\n', 'delivery', 'user', false, call).catch((e) => e);

		expect(error).toBeInstanceOf(SidecarRequestError);
		expect((error as SidecarRequestError).code).toBe('CATALOG_ITEM_ALREADY_EXISTS');
		expect((error as SidecarRequestError).message).toBe('A template named "delivery" already exists.');
	});

	it('wraps an unstructured failure as SIDECAR_REQUEST_FAILED', async () => {
		const call = async () => {
			throw new Error('sidecar unreachable');
		};

		const error = await installCatalogItem('name: Delivery\n', 'delivery', 'user', false, call).catch((e) => e);

		expect(error).toBeInstanceOf(SidecarRequestError);
		expect((error as SidecarRequestError).code).toBe('SIDECAR_REQUEST_FAILED');
		expect((error as SidecarRequestError).message).toBe('sidecar unreachable');
	});
});

describe('removeCatalogItem', () => {
	it('invokes catalog_remove_item with kind and name', async () => {
		const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
		const call = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
			calls.push({ command, args });
			return undefined as T;
		};

		await removeCatalogItem('template', 'delivery', call);

		expect(calls).toEqual([{ command: 'catalog_remove_item', args: { kind: 'template', name: 'delivery' } }]);
	});
});

describe('inspectPreview', () => {
	it('invokes preview_inspect with the Preview Source', async () => {
		const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
		const call = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
			calls.push({ command, args });
			return { fields: [] } as T;
		};

		const result = await inspectPreview('template:delivery', call);

		expect(calls).toEqual([{ command: 'preview_inspect', args: { source: 'template:delivery' } }]);
		expect(result).toEqual({ fields: [] });
	});

	it('wraps a structured sidecar error, preserving its code', async () => {
		const call = async () => {
			throw { code: 'TEMPLATE_RESOLUTION_FAILED', message: 'Atomize Studio could not resolve this Template: template not found.' };
		};

		const error = await inspectPreview('template:missing', call).catch((e) => e);

		expect(error).toBeInstanceOf(SidecarRequestError);
		expect((error as SidecarRequestError).code).toBe('TEMPLATE_RESOLUTION_FAILED');
	});
});

describe('runMockPreview', () => {
	it('invokes preview_mock_story with the Preview Source and mock Story JSON', async () => {
		const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
		const call = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
			calls.push({ command, args });
			return { tasks: [], skippedTasks: [], estimationSummary: { storyEstimation: 0, totalTaskEstimation: 0, percentageUsed: 0 } } as T;
		};

		await runMockPreview('/tmp/delivery.atomize.yaml', '{"estimation":10}', call);

		expect(calls).toEqual([{ command: 'preview_mock_story', args: { source: '/tmp/delivery.atomize.yaml', mockStory: '{"estimation":10}' } }]);
	});

	it('wraps an unstructured failure as SIDECAR_REQUEST_FAILED', async () => {
		const call = async () => {
			throw new Error('sidecar unreachable');
		};

		const error = await runMockPreview('template:delivery', '{}', call).catch((e) => e);

		expect(error).toBeInstanceOf(SidecarRequestError);
		expect((error as SidecarRequestError).code).toBe('SIDECAR_REQUEST_FAILED');
	});
});

describe('queryGenerateStories', () => {
	it('invokes generate_query_stories with the Preview Source and profile name', async () => {
		const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
		const call = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
			calls.push({ command, args });
			return { stories: [] } as T;
		};

		const result = await queryGenerateStories('template:release-checklist', 'contoso-prod', call);

		expect(calls).toEqual([{ command: 'generate_query_stories', args: { source: 'template:release-checklist', profile: 'contoso-prod' } }]);
		expect(result).toEqual({ stories: [] });
	});

	it('wraps a structured sidecar error, preserving its code', async () => {
		const call = async () => {
			throw { code: 'GENERATE_AUTH_FAILED', message: 'Atomize could not sign in to this Azure DevOps project. Check its access token, then try again.' };
		};

		const error = await queryGenerateStories('template:release-checklist', 'contoso-prod', call).catch((e) => e);

		expect(error).toBeInstanceOf(SidecarRequestError);
		expect((error as SidecarRequestError).code).toBe('GENERATE_AUTH_FAILED');
	});
});

describe('runGenerate', () => {
	it('invokes generate_run with the run id, source, profile, dryRun, and scope', async () => {
		const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
		const call = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
			calls.push({ command, args });
			return { report: { storiesProcessed: 0 } } as T;
		};

		await runGenerate('run-1', 'template:release-checklist', 'contoso-prod', true, { kind: 'filter' }, false, call);

		expect(calls).toEqual([{
			command: 'generate_run',
			args: { runId: 'run-1', source: 'template:release-checklist', profile: 'contoso-prod', dryRun: true, scope: { kind: 'filter' }, continueOnError: false },
		}]);
	});

	it('defaults continueOnError to false when omitted', async () => {
		const calls: Array<Record<string, unknown> | undefined> = [];
		const call = async <T>(_command: string, args?: Record<string, unknown>): Promise<T> => {
			calls.push(args);
			return undefined as T;
		};

		await runGenerate('run-2', 'template:release-checklist', 'contoso-prod', false, { kind: 'stories', storyIds: ['1031'] }, undefined, call);

		expect(calls).toEqual([{ runId: 'run-2', source: 'template:release-checklist', profile: 'contoso-prod', dryRun: false, scope: { kind: 'stories', storyIds: ['1031'] }, continueOnError: false }]);
	});

	it('wraps an unstructured failure as SIDECAR_REQUEST_FAILED', async () => {
		const call = async () => {
			throw new Error('sidecar unreachable');
		};

		const error = await runGenerate('run-3', 'template:release-checklist', 'contoso-prod', true, { kind: 'filter' }, false, call).catch((e) => e);

		expect(error).toBeInstanceOf(SidecarRequestError);
		expect((error as SidecarRequestError).code).toBe('SIDECAR_REQUEST_FAILED');
	});
});

describe('cancelGenerate', () => {
	it('invokes generate_cancel with the run id', async () => {
		const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
		const call = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
			calls.push({ command, args });
			return undefined as T;
		};

		await cancelGenerate('run-1', call);

		expect(calls).toEqual([{ command: 'generate_cancel', args: { runId: 'run-1' } }]);
	});
});

describe('checkCopilotAuthStatus', () => {
	it('invokes ai_auth_status and returns the result', async () => {
		const calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
		const call = async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
			calls.push({ command, args });
			return { authenticated: false } as T;
		};

		const result = await checkCopilotAuthStatus(call);

		expect(calls).toEqual([{ command: 'ai_auth_status', args: undefined }]);
		expect(result).toEqual({ authenticated: false });
	});
});
