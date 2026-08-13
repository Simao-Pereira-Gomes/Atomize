export type SaveDialog = (defaultPath: string) => Promise<string | null>;
export type FileWriter = (path: string, contents: string) => Promise<void>;

export class DownloadError extends Error {
	override readonly name = 'DownloadError';
}

export function slugifyTemplateName(name: string): string {
	const slug = name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return slug || 'template';
}

async function defaultSaveDialog(defaultPath: string): Promise<string | null> {
	const { save } = await import('@tauri-apps/plugin-dialog');
	return await save({
		defaultPath,
		filters: [{ name: 'Atomize YAML', extensions: ['yaml'] }],
	});
}

async function defaultWriteFile(path: string, contents: string): Promise<void> {
	const { writeTextFile } = await import('@tauri-apps/plugin-fs');
	await writeTextFile(path, contents);
}

export async function downloadTemplate(
	yaml: string,
	suggestedFileName: string,
	saveDialog: SaveDialog = defaultSaveDialog,
	writeFile: FileWriter = defaultWriteFile,
): Promise<string | undefined> {
	let path: string | null;
	try {
		path = await saveDialog(suggestedFileName);
	} catch (error) {
		throw new DownloadError(error instanceof Error ? error.message : 'Could not open the save dialog.');
	}
	if (!path) return undefined;

	try {
		await writeFile(path, yaml);
	} catch (error) {
		throw new DownloadError(error instanceof Error ? error.message : 'Could not save the template file.');
	}
	return path;
}
