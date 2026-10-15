/** Canonical section ownership and published routes, shared by Markdown and the viewer. */
export const canonicalSections = {
  "template-composition": {
    source: "docs/Template-Reference.md",
    pageAnchor: "composition",
    route: "/reference/templates/composition/",
    anchors: ["composition", "inheritance-extends", "mixins-mixins", "resolution-order", "inspect-composition-in-your-tool", "compatibility"],
  },
} as const;

export const repositoryUrl = "https://github.com/Simao-Pereira-Gomes/Atomize";

export function templateGuideUrl(anchor?: string) {
  const page = canonicalSections["template-composition"];
  if (anchor && (page.anchors as readonly string[]).includes(anchor)) {
    return `${page.route}${anchor === page.pageAnchor ? "" : `#${anchor}`}`;
  }
  return `${repositoryUrl}/blob/main/docs/Template-Reference.md${anchor ? `#${anchor}` : ""}`;
}
