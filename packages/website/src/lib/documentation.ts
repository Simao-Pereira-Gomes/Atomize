/** Canonical section ownership and published routes, shared by Markdown and the viewer. */
export const canonicalSections = {
  "onboarding-overview": {
    source: "README.md",
    pageAnchor: "",
    route: "/",
    anchors: [],
  },
  "cli-quickstart": {
    source: "README.md",
    pageAnchor: "start-with-the-cli",
    route: "/getting-started/cli/",
    anchors: ["start-with-the-cli", "install-the-cli", "use-a-built-in-template", "run-your-first-mock-preview", "connect-when-you-are-ready"],
  },
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
