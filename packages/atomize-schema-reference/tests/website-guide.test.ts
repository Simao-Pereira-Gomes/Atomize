import { describe, expect, it } from "vitest";
import { canonicalSections } from "../../website/src/lib/documentation";
import { websiteGuideUrl, websiteUrl } from "../src/website-guide";

describe("websiteGuideUrl", () => {
	it("matches the website's canonical route for every Template Reference anchor", () => {
		for (const section of Object.values(canonicalSections)) {
			if (section.source !== "docs/Template-Reference.md") continue;
			for (const anchor of section.anchors) {
				const route = anchor === section.pageAnchor ? section.route : `${section.route.split("#")[0]}#${anchor}`;
				expect(websiteGuideUrl(anchor)).toBe(`${websiteUrl}${route}`);
			}
		}
	});

	it("falls back to the Template Reference overview", () => {
		expect(websiteGuideUrl()).toBe(`${websiteUrl}/reference/templates/`);
		expect(websiteGuideUrl("unknown")).toBe(`${websiteUrl}/reference/templates/`);
	});
});
