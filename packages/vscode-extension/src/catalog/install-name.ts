import { basename } from 'node:path';

const slug = (text: string) => text.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * The Catalog name an editor's Template or Mixin installs under: a saved file's own name without
 * its `.atomize.yaml` or `.yaml` extension, or, for an unsaved draft, its Template name, slugged the
 * way Atomize Studio names an install. Catalog names allow only letters, numbers, `_` and `-`.
 */
export function catalogInstallName(fileName: string | undefined, templateName: unknown): string {
	if (fileName) {
		const fromFile = slug(basename(fileName).replace(/(\.atomize)?\.ya?ml$/i, ''));
		if (fromFile) return fromFile;
	}
	return (typeof templateName === 'string' && slug(templateName)) || 'template';
}
