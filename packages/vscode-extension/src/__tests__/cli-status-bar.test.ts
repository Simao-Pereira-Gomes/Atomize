import { describe, expect, it } from 'bun:test';
import { deriveStatusBarState } from '../cli-status-bar.js';

describe('deriveStatusBarState', () => {
	it('shows warning and routes to showCliUnavailable when CLI is not found', () => {
		const state = deriveStatusBarState({ available: false });
		expect(state.text).toBe('$(warning) Atomize: not found');
		expect(state.command).toBe('atomize.showCliUnavailable');
	});

	it('shows installed version and routes to openSettings when CLI is available', () => {
		const state = deriveStatusBarState({ available: true, version: '2.1.0' });
		expect(state.text).toBe('Atomize 2.1.0');
		expect(state.command).toBe('atomize.openSettings');
	});

	it('shows update badge and routes to openSettings when a newer version is available', () => {
		const state = deriveStatusBarState(
			{ available: true, version: '2.1.0' },
			{ updateAvailable: true, latestVersion: '2.2.0' },
		);
		expect(state.text).toBe('$(arrow-up) Atomize 2.1.0 → 2.2.0');
		expect(state.command).toBe('atomize.openSettings');
	});

	it('treats updateAvailable: false as the available state even when latestVersion is present', () => {
		const state = deriveStatusBarState(
			{ available: true, version: '2.2.0' },
			{ updateAvailable: false, latestVersion: '2.2.0' },
		);
		expect(state.text).toBe('Atomize 2.2.0');
	});

	it('falls back to "unknown" when CLI is available but reports no version', () => {
		const state = deriveStatusBarState({ available: true });
		expect(state.text).toBe('Atomize unknown');
		expect(state.command).toBe('atomize.openSettings');
	});
});
