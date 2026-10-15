import {
	SchemaReference,
	type SchemaReferenceProps,
} from "@sppg2001/atomize-schema-reference/viewer";
import { templateGuideUrl } from "../lib/documentation";

// Functions must be supplied inside the island, rather than serialized by Astro.
export function WebsiteSchemaReference(
	props: Pick<SchemaReferenceProps, "trees" | "versionLabel" | "notice">,
) {
	return (
		<SchemaReference
			{...props}
			guideUrl={templateGuideUrl}
		/>
	);
}
