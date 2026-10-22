import { isHiddenPage } from "./features";
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
  "workflow-cli-generate": { source: "docs/Workflows.md", pageAnchor: "generate-from-the-cli", route: "/cli/generate/", anchors: ["generate-from-the-cli"] },
  "workflow-cli-automation": { source: "docs/Workflows.md", pageAnchor: "automate-with-the-cli", route: "/cli/automation/", anchors: ["automate-with-the-cli", "authentication", "machine-readable-output", "exit-codes-and-failure-handling"] },
  "cli-overview": { source: "docs/Cli-Reference.md", pageAnchor: "installation", route: "/cli/reference/", anchors: ["installation", "global-options", "commands-overview"] },
  "cli-configuration": { source: "docs/Cli-Reference.md", pageAnchor: "configuration", route: "/cli/reference/#configuration", anchors: ["configuration", "connection-profiles", "environment-variables", "env-file", "interactive-prompts--navigation"] },
  "cli-examples": { source: "docs/Cli-Reference.md", pageAnchor: "examples", route: "/cli/reference/#examples", anchors: ["examples", "troubleshooting", "ai-template-generation-fails"] },
  "cli-auth": { source: "docs/Cli-Reference.md", pageAnchor: "auth", route: "/cli/reference/auth/", anchors: ["auth", "auth-add", "auth-list", "auth-use", "auth-remove", "auth-test", "auth-rotate"] },
  "cli-generate": { source: "docs/Cli-Reference.md", pageAnchor: "generate", route: "/cli/reference/generate/", anchors: ["generate"] },
  "cli-preview": { source: "docs/Cli-Reference.md", pageAnchor: "preview", route: "/cli/reference/preview-validate/#preview", anchors: ["preview"] },
  "cli-validate": { source: "docs/Cli-Reference.md", pageAnchor: "validate", route: "/cli/reference/preview-validate/#validate", anchors: ["validate"] },
  "cli-fields": { source: "docs/Cli-Reference.md", pageAnchor: "fields", route: "/cli/reference/fields-queries/#fields", anchors: ["fields", "fields-list"] },
  "cli-queries": { source: "docs/Cli-Reference.md", pageAnchor: "queries", route: "/cli/reference/fields-queries/#queries", anchors: ["queries", "queries-list"] },
  "cli-template": { source: "docs/Cli-Reference.md", pageAnchor: "template-create", route: "/cli/reference/templates/", anchors: ["template-create"] },
  "cli-template-improve": { source: "docs/Cli-Reference.md", pageAnchor: "template-improve", route: "/cli/ai/#template-improve", anchors: ["template-improve"] },
  "cli-template-manage": { source: "docs/Cli-Reference.md", pageAnchor: "template-list", route: "/cli/reference/templates/#template-list", anchors: ["template-list", "template-install", "template-remove", "template-resolve", "template-metadata", "template-migrate"] },
  "creation-ai": { source: "docs/Template-Creation.md", pageAnchor: "ai-assisted-drafts", route: "/cli/ai/", anchors: ["ai-assisted-drafts", "reference-documents", "review-the-draft"] },
  "studio-ai": { source: "docs/Atomize-Studio.md", pageAnchor: "ai-drafting", route: "/studio/ai/", anchors: ["ai-drafting", "improve-with-ai", "reference-documents"] },
  "vscode-ai": { source: "docs/VS-Code-Extension.md", pageAnchor: "atomize-draft-template-with-ai", route: "/vscode/ai/", anchors: ["atomize-draft-template-with-ai", "atomize-improve-template-with-ai", "reference-documents"] },
  "vscode-live-preview": { source: "docs/VS-Code-Extension.md", pageAnchor: "atomize-preview-live", route: "/vscode/generate/#preview-against-a-real-story", anchors: ["atomize-preview-live"] },
  "vscode-generate": { source: "docs/VS-Code-Extension.md", pageAnchor: "atomize-generate", route: "/vscode/generate/#generate-tasks", anchors: ["atomize-generate"] },
  "vscode-story-browser": { source: "docs/VS-Code-Extension.md", pageAnchor: "choosing-stories-the-story-browser", route: "/vscode/generate/#choose-stories", anchors: ["choosing-stories-the-story-browser"] },
  "vscode-safety": { source: "docs/VS-Code-Extension.md", pageAnchor: "safety-model", route: "/vscode/generate/#what-connects-and-what-creates-tasks", anchors: ["safety-model"] },
  "vscode-browsers": { source: "docs/VS-Code-Extension.md", pageAnchor: "atomize-browse-fields", route: "/vscode/project-data/", anchors: ["atomize-browse-fields", "atomize-browse-queries"] },
  "studio-generate": { source: "docs/Atomize-Studio.md", pageAnchor: "generate-area", route: "/studio/generate/", anchors: ["generate-area", "generate-tasks-from-real-stories", "follow-progress-or-cancel", "review-results-and-recover"] },
  "studio-grounding": { source: "docs/Atomize-Studio.md", pageAnchor: "grounding", route: "/studio/project-data/", anchors: ["grounding", "work-project-setting"] },
  "platform-support": { source: "docs/Platform-Guide.md", pageAnchor: "overview", route: "/connections/", anchors: ["overview"] },
  "auth-permissions": { source: "docs/Auth-Guide.md", pageAnchor: "required-permissions", route: "/connections/#required-permissions", anchors: ["required-permissions"] },
  "auth-setup": { source: "docs/Auth-Guide.md", pageAnchor: "quick-setup", route: "/connections/profiles/", anchors: ["quick-setup", "local-development", "atomize-cli", "verify-your-profiles", "atomize-studio", "vs-code"] },
  "auth-storage": { source: "docs/Auth-Guide.md", pageAnchor: "credential-storage", route: "/connections/profiles/#credential-storage", anchors: ["credential-storage", "when-the-keychain-is-unavailable"] },
  "auth-shared": { source: "docs/Auth-Guide.md", pageAnchor: "shared-between-the-cli-and-atomize-studio", route: "/connections/profiles/#shared-between-the-cli-and-atomize-studio", anchors: ["shared-between-the-cli-and-atomize-studio"] },
  "auth-vscode": { source: "docs/Auth-Guide.md", pageAnchor: "vs-code-profiles", route: "/connections/profiles/#vs-code-profiles", anchors: ["vs-code-profiles"] },
  "auth-rotation": { source: "docs/Auth-Guide.md", pageAnchor: "rotating-tokens", route: "/connections/profiles/#rotating-tokens", anchors: ["rotating-tokens"] },
  "auth-copilot": { source: "docs/Auth-Guide.md", pageAnchor: "ai-drafting-copilot-session", route: "/connections/profiles/#ai-drafting-copilot-session", anchors: ["ai-drafting-copilot-session"] },
  "auth-resolution": { source: "docs/Auth-Guide.md", pageAnchor: "profile-resolution-order", route: "/connections/automation/#profile-resolution-order", anchors: ["profile-resolution-order"] },
  "auth-multiple": { source: "docs/Auth-Guide.md", pageAnchor: "managing-multiple-profiles", route: "/connections/automation/#managing-multiple-profiles", anchors: ["managing-multiple-profiles", "switching-the-default", "removing-a-profile"] },
  "auth-ci": { source: "docs/Auth-Guide.md", pageAnchor: "cicd-setup", route: "/connections/automation/#cicd-setup", anchors: ["cicd-setup"] },
  "auth-troubleshooting": { source: "docs/Auth-Guide.md", pageAnchor: "troubleshooting", route: "/connections/troubleshooting/", anchors: ["troubleshooting", "authentication-failed-401-unauthorized", "project-details-or-grounded-choices-do-not-load", "keychain-unavailable", "studio-says-a-profile-uses-cli-insecure-storage", "studio-cannot-read-a-profiles-token", "vs-code-says-no-stored-token-for-profile"] },
  "platform-troubleshooting": { source: "docs/Platform-Guide.md", pageAnchor: "troubleshooting", route: "/connections/troubleshooting/#azure-devops-errors", anchors: ["troubleshooting", "authentication-failures", "no-work-items-found", "permission-errors", "connection-timeouts"] },
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
  "template-file-naming": { source: "docs/Template-Reference.md", pageAnchor: "file-naming", route: "/reference/templates/#file-naming", anchors: ["file-naming", "option-1-atomizeyaml-extension-recommended", "option-1--atomizeyaml-extension-recommended", "option-2-modeline", "option-2--modeline", "content-detection-fallback"] },
  "template-overview": { source: "docs/Template-Reference.md", pageAnchor: "overview", route: "/reference/templates/", anchors: ["overview", "file-identity"] },
  "template-filter": { source: "docs/Template-Reference.md", pageAnchor: "filter", route: "/reference/templates/filter/", anchors: ["filter", "special-values", "date-filters", "area-paths-exact-vs-descendants", "iterations-exact-vs-descendants", "savedquery"] },
  "template-tasks": { source: "docs/Template-Reference.md", pageAnchor: "tasks", route: "/reference/templates/tasks/", anchors: ["tasks", "variable-interpolation", "assignment-patterns", "task-custom-fields"] },
  "template-dependencies": { source: "docs/Template-Reference.md", pageAnchor: "task-dependencies", route: "/reference/templates/tasks/#task-dependencies", anchors: ["task-dependencies", "repeated-tasks"] },
  "template-conditional-tasks": { source: "docs/Template-Reference.md", pageAnchor: "conditional-tasks", route: "/reference/templates/conditions/", anchors: ["conditional-tasks"] },
  "template-conditional-estimation": { source: "docs/Template-Reference.md", pageAnchor: "conditional-estimation", route: "/reference/templates/conditions/#conditional-estimation", anchors: ["conditional-estimation"] },
  "template-estimation": { source: "docs/Template-Reference.md", pageAnchor: "estimation", route: "/reference/templates/estimation/", anchors: ["estimation", "estimation-terms", "from-story-estimate-to-task-estimate", "unresolvable-story-estimates", "estimation-field-mapping", "check-estimation-against-your-project"] },
  "platform-task-creation": { source: "docs/Platform-Guide.md", pageAnchor: "task-creation", route: "/reference/templates/estimation/#task-creation", anchors: ["task-creation", "how-the-task-estimate-is-calculated"] },
  "template-validation": { source: "docs/Template-Reference.md", pageAnchor: "validation", route: "/reference/templates/validation/", anchors: ["validation", "metadata", "deprecated-fields"] },
  "template-example": { source: "docs/Template-Reference.md", pageAnchor: "complete-example", route: "/reference/templates/example/", anchors: ["complete-example"] },
  "catalog-concepts": { source: "docs/Template-Creation.md", pageAnchor: "understand-the-catalog", route: "/catalog/", anchors: ["understand-the-catalog", "workspace-root", "precedence-and-catalog-overrides", "template-lineage"] },
  "creation-paths": { source: "docs/Template-Creation.md", pageAnchor: "choose-a-creation-path", route: "/catalog/create/", anchors: ["choose-a-creation-path"] },
  "creation-manual": { source: "docs/Template-Creation.md", pageAnchor: "start-from-the-catalog", route: "/catalog/create/#start-from-the-catalog", anchors: ["start-from-the-catalog", "build-with-the-wizard", "author-directly-in-vs-code"] },
  "creation-studio": { source: "docs/Template-Creation.md", pageAnchor: "create-in-atomize-studio", route: "/catalog/create/#create-in-atomize-studio", anchors: ["create-in-atomize-studio"] },
  "creation-mixins": { source: "docs/Template-Creation.md", pageAnchor: "create-mixins", route: "/catalog/create/#create-mixins", anchors: ["create-mixins"] },
  "catalog-manage": { source: "docs/Template-Creation.md", pageAnchor: "manage-the-catalog", route: "/catalog/manage/", anchors: ["manage-the-catalog", "install-templates-and-mixins", "update-an-installed-item", "remove-items", "move-legacy-catalog-folders"] },
  "vscode-catalog-install": { source: "docs/VS-Code-Extension.md", pageAnchor: "atomize-install-to-catalog", route: "/catalog/manage/#atomize-install-to-catalog", anchors: ["atomize-install-to-catalog"] },
  "studio-catalog": { source: "docs/Atomize-Studio.md", pageAnchor: "catalog-area", route: "/catalog/manage/#in-atomize-studio", anchors: ["catalog-area"] },
  "catalog-team": { source: "docs/Template-Creation.md", pageAnchor: "share-templates-with-your-team", route: "/catalog/team/", anchors: ["share-templates-with-your-team"] },
  "creation-checklist": { source: "docs/Template-Creation.md", pageAnchor: "post-creation-checklist", route: "/catalog/team/#post-creation-checklist", anchors: ["post-creation-checklist"] },
  "template-composition": {
    source: "docs/Template-Reference.md",
    pageAnchor: "composition",
    route: "/reference/templates/composition/",
    anchors: ["composition", "inheritance-extends", "mixins-mixins", "resolution-order", "inspect-composition-in-your-tool", "compatibility"],
  },
} as const;

export const repositoryUrl = "https://github.com/Simao-Pereira-Gomes/Atomize";
export const schemaRoute = "/reference/templates/schema/";

/** The header tabs switch between the guides and the shared Schema Reference, which brings its own navigation. */
export type DocumentationSection = "guides" | "schema";
export const sectionTabs: { key: DocumentationSection; label: string; href: string }[] = [
  { key: "guides", label: "Guides", href: "/" },
  { key: "schema", label: "Schema Reference", href: schemaRoute },
];
export function documentationSection(pathname: string): DocumentationSection {
  const path = pathname.replace(/\/?$/, "/");
  return path === schemaRoute || path === "/schema/" ? "schema" : "guides";
}

export function templateGuideUrl(anchor?: string) {
  return canonicalGuideUrl("docs/Template-Reference.md", anchor);
}

export function canonicalGuideUrl(source: string, anchor?: string) {
  const page = Object.values(canonicalSections).find(section => section.source === source && anchor && (section.anchors as readonly string[]).includes(anchor));
  if (page && !isHiddenPage(page.route)) {
    return anchor === page.pageAnchor ? page.route : `${page.route.split("#")[0]}#${anchor}`;
  }
  return `${repositoryUrl}/blob/main/${source}${anchor ? `#${anchor}` : ""}`;
}
