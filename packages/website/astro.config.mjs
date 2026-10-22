import { unified } from "@astrojs/markdown-remark";
import solid from "@astrojs/solid-js";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import canonicalSections, { watchCanonicalGuides } from "./src/lib/canonical-sections.ts";
import { features } from "./src/lib/features.ts";

export default defineConfig({
  site: "https://atomize-cd9.pages.dev",
  integrations: [solid(), starlight({
    title: "atomize",
    logo: { src: "../vscode-extension/icons/atomize-product.svg" },
    social: [{ icon: "github", label: "GitHub", href: "https://github.com/Simao-Pereira-Gomes/Atomize" }],
    customCss: ["./src/styles/atomize-website.css"],
    expressiveCode: { themes: ["catppuccin-mocha", "catppuccin-latte"], useStarlightUiThemeColors: true },
    components: {
      Header: "./src/components/DocumentationHeader.astro",
      PageTitle: "./src/components/DocumentationTitle.astro",
      Sidebar: "./src/components/DocumentationSidebar.astro",
      PageSidebar: "./src/components/DocumentationContents.astro",
      TableOfContents: "./src/components/DocumentationTableOfContents.astro",
      MobileTableOfContents: "./src/components/DocumentationMobileContents.astro",
      ThemeProvider: "./src/components/WebsiteThemeProvider.astro",
      ThemeSelect: "./src/components/WebsiteThemeSelect.astro",
    },
    sidebar: [
      { label: "Getting started", items: [
        { label: "Choose your tool", slug: "index" },
        { label: "CLI quickstart", slug: "getting-started/cli" },
        ...(features.studio ? [{ label: "Studio quickstart", slug: "getting-started/studio" }] : []),
        { label: "VS Code quickstart", slug: "getting-started/vscode" },
      ] },
      ...(features.studio ? [{ label: "Atomize Studio", items: [
        { label: "Author Templates", slug: "studio/author-templates" },
        { label: "Open, save, and export", slug: "studio/open-save" },
        { label: "Generate Tasks", slug: "studio/generate" },
        { label: "Use project data", slug: "studio/project-data" },
        { label: "Draft and improve with AI", slug: "studio/ai" },
        { label: "Settings and recovery", slug: "studio/settings-recovery" },
      ] }] : []),
      { label: "VS Code", items: [
        { label: "Author Atomize YAML", slug: "vscode/author-yaml" },
        { label: "Inspect Templates", slug: "vscode/inspect-templates" },
        { label: "Generate Tasks", slug: "vscode/generate" },
        { label: "Browse fields and queries", slug: "vscode/project-data" },
        { label: "Draft and improve with AI", slug: "vscode/ai" },
        { label: "Validation and settings", slug: "vscode/settings-recovery" },
      ] },
      { label: "CLI", items: [
        { label: "Generate Tasks", slug: "cli/generate" },
        { label: "Draft and improve with AI", slug: "cli/ai" },
        { label: "Automate the CLI", slug: "cli/automation" },
        { label: "Command reference", slug: "cli/reference" },
        { label: "auth", slug: "cli/reference/auth" },
        { label: "generate", slug: "cli/reference/generate" },
        { label: "preview and validate", slug: "cli/reference/preview-validate" },
        { label: "template", slug: "cli/reference/templates" },
        { label: "fields and queries", slug: "cli/reference/fields-queries" },
      ] },
      { label: "Connections", items: [
        { label: "Connect Azure DevOps", slug: "connections" },
        { label: "Connection Profiles", slug: "connections/profiles" },
        { label: "Scripts and CI", slug: "connections/automation" },
        { label: "Fix connection problems", slug: "connections/troubleshooting" },
      ] },
      { label: "Catalog and sharing", items: [
        { label: "How the Catalog works", slug: "catalog" },
        { label: "Create Templates", slug: "catalog/create" },
        { label: "Install and manage", slug: "catalog/manage" },
        { label: "Share with your team", slug: "catalog/team" },
      ] },
      { label: "Templates", items: [
        { label: "Template structure", slug: "reference/templates" },
        { label: "Choose Stories with filters", slug: "reference/templates/filter" },
        { label: "Define Tasks", slug: "reference/templates/tasks" },
        { label: "Add conditions", slug: "reference/templates/conditions" },
        { label: "Estimate Tasks", slug: "reference/templates/estimation" },
        { label: "Compose Templates", slug: "reference/templates/composition" },
        { label: "Validation and metadata", slug: "reference/templates/validation" },
        { label: "Complete example", slug: "reference/templates/example" },
      ] },
      { label: "Validate and troubleshoot", items: [
        { label: "Validate Templates", slug: "validation" },
        { label: "Fix validation errors", slug: "validation/errors" },
        { label: "Troubleshooting", slug: "troubleshooting" },
      ] },
      { label: "Release notes", slug: "releases" },
      { label: "More guides", items: [
        { label: "Workflows ↗", link: "https://github.com/Simao-Pereira-Gomes/Atomize/blob/main/docs/Workflows.md" },
      ] },
    ],
  })],
  markdown: { processor: unified({ remarkPlugins: [canonicalSections] }) },
  vite: { plugins: [watchCanonicalGuides()] },
});
