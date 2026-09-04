import { afterEach, describe, expect, it } from 'bun:test';
import {
	forgetCatalogDocumentPath,
	rememberCatalogDocumentPath,
	resolveDocumentPath,
} from '../catalog/catalog-document-path.js';

const virtualMixinDocument = {
	fsPath: '/mixin/documentation.atomize.yaml',
	toString: () => 'atomize-catalog://catalog/mixin/documentation.atomize.yaml',
};

describe('resolveDocumentPath', () => {
	afterEach(() => forgetCatalogDocumentPath(virtualMixinDocument));

	it('uses a Catalog Browser virtual document backing file', () => {
		rememberCatalogDocumentPath(virtualMixinDocument, '/extension/dist/catalog/mixins/documentation.atomize.yaml');

		expect(resolveDocumentPath(virtualMixinDocument)).toBe('/extension/dist/catalog/mixins/documentation.atomize.yaml');
	});

	it('uses the URI filesystem path for ordinary documents', () => {
		const file = { fsPath: '/workspace/template.atomize.yaml', toString: () => 'file:///workspace/template.atomize.yaml' };

		expect(resolveDocumentPath(file)).toBe('/workspace/template.atomize.yaml');
	});
});
