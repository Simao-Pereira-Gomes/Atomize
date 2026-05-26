export interface CommandUri {
	toString(): string;
}

export interface CommandDocument {
	uri: CommandUri;
}

export async function resolveCommandDocument<TDocument extends CommandDocument>(
	uri: CommandUri | undefined,
	activeDocument: TDocument | undefined,
	textDocuments: readonly TDocument[],
	openTextDocument: (uri: CommandUri) => PromiseLike<TDocument>,
): Promise<TDocument | undefined> {
	if (!uri) return activeDocument;

	const existing = textDocuments.find(doc => doc.uri.toString() === uri.toString());
	if (existing) return existing;

	try {
		return await openTextDocument(uri);
	} catch {
		return undefined;
	}
}
