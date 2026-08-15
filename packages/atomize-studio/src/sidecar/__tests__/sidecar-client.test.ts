import { describe, expect, it } from 'vitest';
import { installCatalogItem, removeCatalogItem, SidecarRequestError } from '../sidecar-client.js';

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

		await installCatalogItem('name: Delivery\n', 'delivery', 'project', undefined, call);

		expect(calls).toEqual([{ content: 'name: Delivery\n', name: 'delivery', scope: 'project', overwrite: false }]);
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
