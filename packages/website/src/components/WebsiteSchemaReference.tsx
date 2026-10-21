import {
	SchemaReference,
	type SchemaReferenceProps,
} from "@sppg2001/atomize-schema-reference/viewer";
import { Portal } from "solid-js/web";
import { templateGuideUrl } from "../lib/documentation";

// The site sidebar hosts the field navigation on this page, so the fields get the full content width.
const sidebar = () =>
	typeof document === "undefined"
		? undefined
		: (document.querySelector("#starlight__sidebar .sidebar-content") ?? undefined);

// Functions must be supplied inside the island, rather than serialized by Astro.
export function WebsiteSchemaReference(
	props: Pick<SchemaReferenceProps, "trees" | "versionLabel" | "notice">,
) {
	return (
		<>
			<Portal mount={sidebar()} ref={(element) => { element.className = "schema-reference-back"; }}>
				<a href="/">
					<span aria-hidden="true">←</span> All documentation
				</a>
			</Portal>
			<SchemaReference
				{...props}
				guideUrl={templateGuideUrl}
				navigationMount={sidebar}
			/>
		</>
	);
}
