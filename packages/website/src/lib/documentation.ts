/** Canonical section ownership and published routes, shared by Markdown and the viewer. */
export const canonicalSections = {
  "vscode-install": { source: "docs/VS-Code-Extension.md", pageAnchor: "install", route: "/getting-started/vscode/#install-the-extension", anchors: ["install"] },
  "vscode-first-preview": { source: "docs/VS-Code-Extension.md", pageAnchor: "first-mock-preview", route: "/getting-started/vscode/", anchors: ["first-mock-preview", "open-a-built-in-template", "run-mock-preview", "continue-from-your-first-preview"] },
  "vscode-opt-in": { source: "docs/VS-Code-Extension.md", pageAnchor: "atomize-yaml-opt-in", route: "/vscode/author-yaml/#opt-your-file-into-atomize", anchors: ["atomize-yaml-opt-in"] },
  "vscode-authoring": { source: "docs/VS-Code-Extension.md", pageAnchor: "authoring-support", route: "/vscode/author-yaml/", anchors: ["authoring-support", "snippets", "quick-fixes"] },
  "vscode-validation": { source: "docs/VS-Code-Extension.md", pageAnchor: "atomize-validate", route: "/vscode/settings-recovery/#validate-without-a-connection", anchors: ["atomize-validate"] },
  "vscode-catalog": { source: "docs/VS-Code-Extension.md", pageAnchor: "atomize-browse-catalog", route: "/vscode/inspect-templates/#browse-the-catalog", anchors: ["atomize-browse-catalog"] },
  "vscode-effective": { source: "docs/VS-Code-Extension.md", pageAnchor: "atomize-show-effective-template", route: "/vscode/inspect-templates/#inspect-the-resolved-template", anchors: ["atomize-show-effective-template"] },
  "vscode-schema": { source: "docs/VS-Code-Extension.md", pageAnchor: "atomize-open-schema-reference", route: "/vscode/inspect-templates/#open-the-installed-schema-reference", anchors: ["atomize-open-schema-reference"] },
  "vscode-settings": { source: "docs/VS-Code-Extension.md", pageAnchor: "settings", route: "/vscode/settings-recovery/#configure-the-editor", anchors: ["settings"] },
  "vscode-recovery": { source: "docs/VS-Code-Extension.md", pageAnchor: "troubleshooting", route: "/vscode/settings-recovery/", anchors: ["troubleshooting", "deprecated-cli-settings-notice", "connected-commands-need-a-profile", "schema-hovers-or-completions-are-missing", "codelens-actions-are-missing", "offline-commands-cannot-complete"] },
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
