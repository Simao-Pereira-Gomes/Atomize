import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ExtensionTelemetry, type TelemetryUi } from '../telemetry/extension-telemetry.js';

const pkg = await import('@sppg2001/atomize-telemetry');

let dir: string;
let consentPath: string;
let vscodeTelemetryOn: boolean;
let fetchMock: ReturnType<typeof mock>;
let loads: number;
let choices: Array<string | undefined>;
let messages: string[];
let opened: string[];
let listeners: Array<(enabled: boolean) => void>;

/** What VS Code does when the user flips its telemetry switch: update the property and fire the event. */
const setVscodeTelemetry = (enabled: boolean) => {
	vscodeTelemetryOn = enabled;
	for (const listener of listeners) listener(enabled);
};

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'atomize-ext-telemetry-'));
	consentPath = join(dir, 'telemetry.json');
	vscodeTelemetryOn = true;
	fetchMock = mock(async () => new Response('{}'));
	loads = 0;
	choices = [];
	messages = [];
	opened = [];
	listeners = [];
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const ui: TelemetryUi = {
	showInformationMessage: async (message) => { messages.push(message); return choices.shift(); },
	showWarningMessage: async () => choices.shift(),
	openExternal: async (url) => { opened.push(url); return true; },
};

function make(env: Record<string, string | undefined> = {}): ExtensionTelemetry {
	return new ExtensionTelemetry({
		atomizeVersion: '0.7.3',
		isVscodeTelemetryEnabled: () => vscodeTelemetryOn,
		onDidChangeVscodeTelemetryEnabled: listener => { listeners.push(listener); return { dispose() { listeners = listeners.filter(l => l !== listener); } }; },
		loadPackage: async () => { loads++; return pkg; },
		ui,
		consentPath,
		env,
		fetch: fetchMock as unknown as typeof fetch,
		projectKey: 'phc_test',
	});
}

const sentEvents = () => fetchMock.mock.calls.map(call => JSON.parse((call[1] as RequestInit).body as string));
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

describe('two gates', () => {
	// Only (shared enabled) AND (VS Code telemetry on) sends.
	test.each([
		{ shared: true, vscode: true, sends: true },
		{ shared: true, vscode: false, sends: false },
		{ shared: false, vscode: true, sends: false },
		{ shared: false, vscode: false, sends: false },
	])('shared=$shared vscode=$vscode sends=$sends', async ({ shared, vscode, sends }) => {
		pkg.setConsent(shared, { path: consentPath });
		vscodeTelemetryOn = vscode;
		const t = make();
		t.track({ event: 'session_started' });
		await t.flush(100);
		expect(fetchMock).toHaveBeenCalledTimes(sends ? 1 : 0);
	});

	test('toggling VS Code telemetry takes effect without a restart', async () => {
		pkg.setConsent(true, { path: consentPath });
		const t = make();
		t.track({ event: 'session_started' });
		setVscodeTelemetry(false);
		t.track({ event: 'session_started' });
		setVscodeTelemetry(true);
		t.track({ event: 'session_started' });
		await t.flush(100);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	test('stops following VS Code once disposed', async () => {
		pkg.setConsent(true, { path: consentPath });
		const t = make();
		t.dispose();
		expect(listeners).toHaveLength(0);
	});

	test('a disable written from outside stops the next send', async () => {
		pkg.setConsent(true, { path: consentPath });
		const t = make();
		t.track({ event: 'session_started' });
		await t.flush(100);
		pkg.setConsent(false, { path: consentPath });
		t.track({ event: 'session_started' });
		await t.flush(100);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	test('an env override stops it', async () => {
		pkg.setConsent(true, { path: consentPath });
		const t = make({ DO_NOT_TRACK: '1' });
		t.track({ event: 'session_started' });
		await t.flush(100);
		expect(fetchMock).not.toHaveBeenCalled();
	});
});

describe('activation cost', () => {
	test('constructing it loads nothing and reads no file', () => {
		make();
		expect(loads).toBe(0);
	});

	test('while VS Code telemetry is off it never loads the package', async () => {
		vscodeTelemetryOn = false;
		const t = make();
		t.sessionStarted();
		t.finished('preview', { variant: 'live' }, { outcome: 'success' }, Date.now());
		await settle();
		expect(loads).toBe(0);
	});
});

describe('events', () => {
	test('session_started and a command_finished carry the vscode surface', async () => {
		pkg.setConsent(true, { path: consentPath });
		const t = make();
		t.sessionStarted();
		await t.instrument('preview', { variant: 'mock-story' }, async () => {})();
		await t.flush(100);
		const events = sentEvents();
		expect(events.map(e => e.event)).toEqual(['session_started', 'command_finished']);
		expect(events[1].properties).toMatchObject({ surface: 'vscode', action: 'preview', outcome: 'success', variant: 'mock-story' });
	});

	test('a throw is a failure with its category, rethrown', async () => {
		pkg.setConsent(true, { path: consentPath });
		const t = make();
		const failing = t.instrument('auth.add', {}, async () => { throw Object.assign(new Error('pat=SECRET'), { name: 'AuthError' }); });
		await expect(failing()).rejects.toThrow();
		await t.flush(100);
		const [event] = sentEvents();
		expect(event.properties).toMatchObject({ outcome: 'failure', errorCategory: 'auth' });
		expect(JSON.stringify(event)).not.toContain('SECRET');
	});

	test('run.cancelled() reports cancelled and run.set fills props', async () => {
		pkg.setConsent(true, { path: consentPath });
		const t = make();
		await t.instrument('catalog.install', { scope: 'user' }, async run => { run.set({ scope: 'project' }); run.cancelled(); })();
		await t.flush(100);
		expect(sentEvents()[0].properties).toMatchObject({ outcome: 'cancelled', scope: 'project' });
	});
});

describe('nudge', () => {
	const succeed = async (t: ExtensionTelemetry) => {
		await t.instrument('fields.list', {}, async () => {})();
		await settle();
	};

	test('shown once after the first successful command while undecided', async () => {
		const t = make();
		await succeed(t);
		await succeed(t);
		expect(messages).toHaveLength(1);
		expect(messages[0]).toContain('anonymous usage data');
	});

	test('never while VS Code telemetry is off', async () => {
		vscodeTelemetryOn = false;
		await succeed(make());
		expect(messages).toHaveLength(0);
	});

	test('not after a failure or a cancellation', async () => {
		const t = make();
		await t.instrument('fields.list', {}, async run => run.cancelled())();
		await t.instrument('fields.list', {}, async run => run.failed(new Error('x')))();
		await settle();
		expect(messages).toHaveLength(0);
	});

	test('not once the user has decided, nor under an env override', async () => {
		pkg.setConsent(false, { path: consentPath });
		await succeed(make());
		expect(messages).toHaveLength(0);
		rmSync(consentPath);
		await succeed(make({ ATOMIZE_TELEMETRY: '0' }));
		expect(messages).toHaveLength(0);
	});

	test('Not now sets nudged.vscode, so a later session never shows it again', async () => {
		choices = ['Not now'];
		await succeed(make());
		expect(pkg.readConsent(consentPath)).toMatchObject({ enabled: undefined, nudged: { vscode: true } });
		await succeed(make());
		expect(messages).toHaveLength(1);
	});

	test('dismissing counts as an answer too', async () => {
		choices = [undefined];
		await succeed(make());
		expect(pkg.readConsent(consentPath).nudged.vscode).toBe(true);
	});

	test('Learn more opens the docs and is not an answer: the question comes back', async () => {
		choices = ['Learn more', 'Not now'];
		await succeed(make());
		expect(opened).toEqual([pkg.TELEMETRY_DOCS_URL]);
		expect(messages).toHaveLength(2);
		expect(pkg.readConsent(consentPath).nudged.vscode).toBe(true);
	});

	test('Enable writes the shared decision and sends telemetry_enabled from the notification', async () => {
		choices = ['Enable'];
		const t = make();
		await succeed(t);
		await t.flush(100);
		const state = pkg.readConsent(consentPath);
		expect(state.enabled).toBe(true);
		expect(state.anonymousId).toBeDefined();
		const enabled = sentEvents().find(e => e.event === 'telemetry_enabled');
		expect(enabled.properties.source).toBe('vscode-notification');
	});
});

describe('commands', () => {
	test('disable turns it off everywhere and keeps the ID', async () => {
		const { anonymousId } = pkg.setConsent(true, { path: consentPath });
		await make().disable();
		expect(pkg.readConsent(consentPath)).toMatchObject({ enabled: false, anonymousId });
		expect(messages.at(-1)).toContain(anonymousId as string);
	});

	test('show status reports the saved choice and the VS Code switch', async () => {
		pkg.setConsent(true, { path: consentPath });
		vscodeTelemetryOn = false;
		await make({ DO_NOT_TRACK: '1' }).showStatus();
		expect(messages.at(-1)).toContain('disabled by DO_NOT_TRACK');
		expect(messages.at(-1)).toContain('saved choice: enabled');
		expect(messages.at(-1)).toContain('VS Code telemetry: off');
	});

	test('request deletion is sent whatever the gates say, then disables', async () => {
		const { anonymousId } = pkg.setConsent(true, { path: consentPath });
		pkg.setConsent(false, { path: consentPath });
		vscodeTelemetryOn = false;
		choices = ['Request Deletion'];
		await make({ DO_NOT_TRACK: '1' }).requestDeletion();
		const [event] = sentEvents();
		expect(event).toMatchObject({ event: 'telemetry_deletion_requested', distinct_id: anonymousId });
		expect(pkg.readConsent(consentPath)).toMatchObject({ enabled: false, anonymousId: undefined });
	});

	test('declining the confirmation sends nothing and changes nothing', async () => {
		pkg.setConsent(true, { path: consentPath });
		choices = [undefined];
		await make().requestDeletion();
		expect(fetchMock).not.toHaveBeenCalled();
		expect(pkg.readConsent(consentPath).enabled).toBe(true);
	});

	test('request deletion with no Anonymous ID has nothing to delete', async () => {
		await make().requestDeletion();
		expect(fetchMock).not.toHaveBeenCalled();
		expect(messages.at(-1)).toContain('Nothing to delete');
	});
});
