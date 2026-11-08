import { TemplateLibrary } from '@sppg2001/atomize-core';
import * as vscode from 'vscode';

/**
 * atomize-core's TemplateCatalog locates its builtin templates by walking up
 * from its own module file via import.meta.url — esbuild empties that out
 * under CJS bundling (esbuild.mjs copies the catalog dir to dist/catalog to
 * compensate), so packageRoot must be supplied explicitly here rather than
 * left to TemplateCatalog's default resolution.
 */
export function createTemplateLibrary(folder?: string): TemplateLibrary {
	const invocationCwd = folder ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	return new TemplateLibrary({ packageRoot: __dirname, invocationCwd });
}
