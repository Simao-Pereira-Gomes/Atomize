import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { removeConnectionProfile, rotateAzureDevOpsToken, setDefaultConnectionProfile } from '../../connections/connection-client.js';
import { inspectPreview, installCatalogItem, removeCatalogItem, runGenerate, runMockPreview, validateOnline } from '../../sidecar/sidecar-client.js';
import {
	endingOfError,
	observed,
	reportFinished,
	reportSessionStarted,
	setNudgeListener,
	setTelemetryTransportForTesting,
	type TelemetryStatus,
} from '../telemetry.js';

type Call = { command: string; args?: Record<string, unknown> };
let calls: Call[];
let status: TelemetryStatus;
let nudges: number;

const undecided: TelemetryStatus = { state: 'undecided', override: null, anonymousId: null, nudged: false };

beforeEach(() => {
	calls = [];
	nudges = 0;
	status = undecided;
	setTelemetryTransportForTesting((async (command: string, args?: Record<string, unknown>) => {
		calls.push({ command, args });
		if (command === 'telemetry_status') return status;
		if (command === 'telemetry_set_consent') {
			if ((args as { decision: string }).decision === 'dismissNudge') status = { ...status, nudged: true };
			return status;
		}
		return { reported: true };
	}) as never);
	setNudgeListener(() => { nudges++; });
});
afterEach(() => {
	setNudgeListener(undefined);
	setTelemetryTransportForTesting(undefined);
});

const events = () => calls.filter(c => c.command === 'telemetry_report').map(c => (c.args as { event: Record<string, unknown> }).event);
const settle = () => new Promise(resolve => setTimeout(resolve, 5));
const noopCall = async <T>() => undefined as T;
const withResult = <R>(result: R) => async <T>() => result as unknown as T;

describe('reporting', () => {
	it('session_started is one bare event', () => {
		reportSessionStarted();
		expect(events()).toEqual([{ event: 'session_started' }]);
	});

	it('a finished action carries only enums, booleans and counts', () => {
		reportFinished('preview', { variant: 'inspect' }, { outcome: 'success' }, Date.now() - 10);
		const [event] = events();
		expect(event).toMatchObject({ event: 'command_finished', action: 'preview', outcome: 'success', variant: 'inspect' });
		expect(typeof event?.durationMs).toBe('number');
	});

	it('never throws or rejects when the bridge fails', async () => {
		setTelemetryTransportForTesting((async () => { throw new Error('sidecar down'); }) as never);
		expect(() => reportFinished('preview', { variant: 'inspect' }, { outcome: 'success' }, Date.now())).not.toThrow();
		await settle();
	});
});

describe('error endings', () => {
	it.each([
		['REQUEST_CANCELLED', { outcome: 'cancelled' }],
		['AI_DRAFT_CANCELLED', { outcome: 'cancelled' }],
		['GENERATE_TOKEN_EXPIRED', { outcome: 'failure', errorCategory: 'auth' }],
		['VALIDATION_AUTH_FAILED', { outcome: 'failure', errorCategory: 'auth' }],
		['COPILOT_AUTH_REQUIRED', { outcome: 'failure', errorCategory: 'ai' }],
		['AI_DRAFT_MALFORMED', { outcome: 'failure', errorCategory: 'ai' }],
		['TEMPLATE_RESOLUTION_FAILED', { outcome: 'failure', errorCategory: 'template' }],
		['REFERENCE_UNAVAILABLE', { outcome: 'failure', errorCategory: 'reference-docs' }],
		['GENERATE_RUN_FAILED', { outcome: 'failure', errorCategory: 'platform' }],
		['SOMETHING_ELSE', { outcome: 'failure', errorCategory: 'unknown' }],
	])('%s', (code, expected) => {
		expect(endingOfError({ code })).toEqual(expected);
	});

	it('an error with no code is an unknown failure', () => {
		expect(endingOfError(new Error('secret message'))).toEqual({ outcome: 'failure', errorCategory: 'unknown' });
	});
});

describe('observed', () => {
	it('reports a cancellation and rethrows the original error', async () => {
		const error = Object.assign(new Error('Request cancelled.'), { code: 'REQUEST_CANCELLED' });
		await expect(observed('validate', { mode: 'online', valid: false, issueCount: 0 }, async () => { throw error; })).rejects.toBe(error);
		expect(events()[0]).toMatchObject({ action: 'validate', outcome: 'cancelled' });
	});

	it('never puts an error message in the event', async () => {
		await expect(observed('preview', { variant: 'inspect' }, async () => { throw Object.assign(new Error('pat=SECRET'), { code: 'X' }); })).rejects.toThrow();
		expect(JSON.stringify(events())).not.toContain('SECRET');
	});
});

describe('Studio actions report one command_finished each', () => {
	it('validation_online: an invalid Template is a success with valid: false', async () => {
		const result = { valid: false, errors: [{}, {}], warnings: [{}], mode: 'lenient', requirements: {} };
		await validateOnline('v1', {}, 'ado', withResult(result));
		expect(events()).toHaveLength(1);
		expect(events()[0]).toMatchObject({ action: 'validate', outcome: 'success', mode: 'online', valid: false, issueCount: 3 });
	});

	it('preview_inspect and preview_mock_story', async () => {
		await inspectPreview('x.yaml', noopCall);
		await runMockPreview('x.yaml', '{}', noopCall);
		expect(events().map(e => [e.action, e.variant])).toEqual([['preview', 'inspect'], ['preview', 'mock-story']]);
	});

	it('generate_run reports counts, and a stopped run is cancelled', async () => {
		const report = { storiesProcessed: 4, storiesSuccess: 3, storiesFailed: 1, tasksCalculated: 12, tasksCreated: 9, stopped: undefined };
		await runGenerate('r1', 'x.yaml', 'ado', false, { kind: 'filter' }, true, withResult({ report }));
		expect(events()[0]).toMatchObject({ action: 'generate', outcome: 'failure', mode: 'execute', continueOnError: true, storyCount: 4, taskCount: 9, failedStoryCount: 1 });
		calls = [];
		await runGenerate('r2', 'x.yaml', 'ado', true, { kind: 'filter' }, false, withResult({ report: { ...report, storiesFailed: 0, stopped: { reason: 'cancelled' } } }));
		expect(events()[0]).toMatchObject({ action: 'generate', outcome: 'cancelled', mode: 'dry-run', taskCount: 12 });
	});

	it('a resume run is generate.resume', async () => {
		const report = { storiesProcessed: 1, storiesSuccess: 1, storiesFailed: 0, tasksCalculated: 2, tasksCreated: 2 };
		await runGenerate('r3', 'x.yaml', 'ado', false, { kind: 'stories', storyIds: ['1'], resume: true }, false, withResult({ report }));
		expect(events()[0]).toMatchObject({ action: 'generate.resume', outcome: 'success' });
	});

	it('catalog install and remove carry their scope', async () => {
		await installCatalogItem('name: X', 'x', 'project', false, noopCall, '/work');
		await removeCatalogItem('template', 'x', noopCall);
		expect(events().map(e => [e.action, e.scope])).toEqual([['catalog.install', 'project'], ['catalog.remove', 'user']]);
	});

	it('connection profile changes are auth.*', async () => {
		await rotateAzureDevOpsToken('a', 'pat', noopCall);
		await removeConnectionProfile('a', noopCall);
		await setDefaultConnectionProfile('a', noopCall);
		expect(events().map(e => e.action)).toEqual(['auth.rotate', 'auth.remove', 'auth.use']);
		expect(JSON.stringify(events())).not.toContain('pat');
	});
});

describe('banner', () => {
	const succeed = async () => { reportFinished('preview', { variant: 'inspect' }, { outcome: 'success' }, Date.now()); await settle(); };

	it('is due once after the first success, and recorded as shown straight away', async () => {
		await succeed();
		await succeed();
		expect(nudges).toBe(1);
		expect(calls.filter(c => c.command === 'telemetry_set_consent').map(c => (c.args as { decision: string }).decision)).toEqual(['dismissNudge']);
	});

	it('never after a decision, under an env override, or once already shown', async () => {
		for (const blocked of [{ ...undecided, state: 'disabled' as const }, { ...undecided, state: 'enabled' as const }, { ...undecided, override: 'DO_NOT_TRACK' as const }, { ...undecided, nudged: true }]) {
			status = blocked;
			setNudgeListener(undefined);
			setNudgeListener(() => { nudges++; });
			await succeed();
		}
		expect(nudges).toBe(0);
	});

	it('not after a failure or a cancellation', async () => {
		reportFinished('preview', { variant: 'inspect' }, { outcome: 'cancelled' }, Date.now());
		reportFinished('preview', { variant: 'inspect' }, { outcome: 'failure' }, Date.now());
		await settle();
		expect(nudges).toBe(0);
	});
});

describe('no new home-directory access for the webview', () => {
	const tauri = resolve(import.meta.dirname, '../../../src-tauri');
	const read = (file: string) => readFileSync(resolve(tauri, file), 'utf8');

	it('the capability file and CSP mention neither the home folder nor the consent file', () => {
		for (const text of [read('capabilities/default.json'), read('tauri.conf.json')]) {
			expect(text).not.toMatch(/\$HOME|\$HOMEDIR|\$APPDATA|~\/\.atomize|telemetry\.json|\/\.atomize/);
		}
	});

	it('Rust only relays telemetry calls and never reads the consent file', () => {
		expect(read('src/lib.rs')).not.toMatch(/telemetry\.json/);
		expect(read('src/sidecar.rs')).not.toMatch(/telemetry\.json/);
	});
});
