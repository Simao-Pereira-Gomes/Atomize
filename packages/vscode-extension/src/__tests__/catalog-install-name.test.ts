import { describe, expect, it } from 'bun:test';
import { catalogInstallName } from '../catalog/install-name.js';

describe('catalog install name', () => {
	it("uses a saved file's own name without its Atomize YAML extension", () => {
		expect(catalogInstallName('/repo/templates/backend-api.atomize.yaml', 'Ignored')).toBe('backend-api');
		expect(catalogInstallName('/repo/templates/sprint_tasks.yml', undefined)).toBe('sprint_tasks');
	});

	it('makes a file name safe for the Catalog', () => {
		expect(catalogInstallName('/repo/My API Template.atomize.yaml', undefined)).toBe('my-api-template');
	});

	it("names an unsaved draft after its Template name", () => {
		expect(catalogInstallName(undefined, 'Backend API + Security Review')).toBe('backend-api-security-review');
	});

	it('falls back to "template" when there is nothing usable to name it after', () => {
		expect(catalogInstallName(undefined, undefined)).toBe('template');
		expect(catalogInstallName(undefined, '???')).toBe('template');
	});
});
