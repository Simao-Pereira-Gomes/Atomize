/** Canonical section ownership and published routes, shared by Markdown and the viewer. */
export const canonicalSections = {
  "studio-install": { source: "docs/Atomize-Studio.md", pageAnchor: "install", route: "/getting-started/studio/#install-studio", anchors: ["install"] },
  "studio-first-preview": { source: "docs/Atomize-Studio.md", pageAnchor: "first-mock-preview", route: "/getting-started/studio/", anchors: ["first-mock-preview", "choose-a-preview-source", "enter-a-small-mock-story", "continue-from-your-first-preview"] },
  "studio-navigation": { source: "docs/Atomize-Studio.md", pageAnchor: "studio-areas", route: "/studio/author-templates/#find-your-way-around", anchors: ["studio-areas"] },
  "studio-starting-paths": { source: "docs/Atomize-Studio.md", pageAnchor: "starting-paths", route: "/studio/author-templates/#choose-a-starting-path", anchors: ["starting-paths"] },
  "studio-authoring-controls": { source: "docs/Atomize-Studio.md", pageAnchor: "builder-sections", route: "/studio/author-templates/#edit-the-builder-sections", anchors: ["builder-sections"] },
  "studio-review": { source: "docs/Atomize-Studio.md", pageAnchor: "review-and-export", route: "/studio/author-templates/#review-and-export", anchors: ["review-and-export"] },
  "studio-template-diff": { source: "docs/Atomize-Studio.md", pageAnchor: "template-diff", route: "/studio/author-templates/#compare-with-the-source", anchors: ["template-diff"] },
  "studio-open-save": { source: "docs/Atomize-Studio.md", pageAnchor: "open", route: "/studio/open-save/", anchors: ["open"] },
  "studio-settings": { source: "docs/Atomize-Studio.md", pageAnchor: "global-settings", route: "/studio/settings-recovery/#global-settings", anchors: ["global-settings"] },
  "studio-recovery": { source: "docs/Atomize-Studio.md", pageAnchor: "companion-process-recovery", route: "/studio/settings-recovery/#companion-process-recovery", anchors: ["companion-process-recovery"] },
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
export const schemaRoute = "/reference/templates/schema/";

export function templateGuideUrl(anchor?: string) {
  return canonicalGuideUrl("docs/Template-Reference.md", anchor);
}

export function canonicalGuideUrl(source: string, anchor?: string) {
  const page = Object.values(canonicalSections).find(section => section.source === source && anchor && (section.anchors as readonly string[]).includes(anchor));
  if (page) {
    return `${page.route}${anchor === page.pageAnchor ? "" : `#${anchor}`}`;
  }
  return `${repositoryUrl}/blob/main/${source}${anchor ? `#${anchor}` : ""}`;
}
