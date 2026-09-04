interface DocumentUri {
	fsPath: string;
	toString(): string;
}

const backingPaths = new Map<string, string>();

export function rememberCatalogDocumentPath(uri: DocumentUri, path: string): void {
	backingPaths.set(uri.toString(), path);
}

export function forgetCatalogDocumentPath(uri: DocumentUri): void {
	backingPaths.delete(uri.toString());
}

export function resolveDocumentPath(uri: DocumentUri): string {
	return backingPaths.get(uri.toString()) ?? uri.fsPath;
}
