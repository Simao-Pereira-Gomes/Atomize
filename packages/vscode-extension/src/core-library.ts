import { TemplateLibrary } from '@sppg2001/atomize-core';
import { TemplateCatalog } from '@sppg2001/atomize-core/services/template/template-catalog';
import { TemplateLoader } from '@sppg2001/atomize-core/templates/loader';
import { TemplateSourceResolver } from '@sppg2001/atomize-core/templates/source-resolver';
import * as vscode from 'vscode';

/**
 * atomize-core's TemplateCatalog locates its builtin templates by walking up
 * from its own module file via import.meta.url — esbuild empties that out
 * under CJS bundling (esbuild.mjs copies the catalog dir to dist/catalog to
 * compensate), so packageRoot must be supplied explicitly here rather than
 * left to TemplateCatalog's default resolution.
 */
export function createTemplateLibrary(): TemplateLibrary {
	const invocationCwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	const catalog = new TemplateCatalog({ packageRoot: __dirname, invocationCwd });
	const resolver = new TemplateSourceResolver(new TemplateLoader(catalog), catalog);
	return new TemplateLibrary(
		resolver,
		catalog,
	);
}
