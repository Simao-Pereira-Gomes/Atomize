import {
	SchemaReference,
	type SchemaReferenceProps,
} from "@sppg2001/atomize-schema-reference/viewer";

// Functions must be supplied inside the island, rather than serialized by Astro.
export function WebsiteSchemaReference(
	props: Pick<SchemaReferenceProps, "trees" | "versionLabel" | "notice">,
) {
	return (
		<SchemaReference
			{...props}
			guideUrl={(anchor) =>
				`https://github.com/Simao-Pereira-Gomes/Atomize/blob/main/docs/Template-Reference.md#${anchor}`
			}
		/>
	);
}
