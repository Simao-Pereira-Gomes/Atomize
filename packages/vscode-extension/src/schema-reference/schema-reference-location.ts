import { buildSchemaTrees, type JsonSchema, normalizeDocumentPath, type SchemaTab } from '@sppg2001/atomize-schema-reference';
import schema from '@sppg2001/atomize-schema-reference/schema.json';

const trees = buildSchemaTrees(schema as JsonSchema);

export function schemaReferenceLocation(path: string | undefined, tab: SchemaTab): string | undefined {
	return path ? normalizeDocumentPath(trees, path, tab) : undefined;
}
