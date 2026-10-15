import { unified } from "@astrojs/markdown-remark";
import solid from "@astrojs/solid-js";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import canonicalSections, { watchCanonicalGuides } from "./src/lib/canonical-sections.ts";

export default defineConfig({
  site: "https://atomize-cd9.pages.dev",
  integrations: [solid(), starlight({
    title: "atomize",
    logo: { src: "../vscode-extension/icons/atomize-product.svg" },
    social: [{ icon: "github", label: "GitHub", href: "https://github.com/Simao-Pereira-Gomes/Atomize" }],
    customCss: ["./src/styles/portal.css"],
    components: {
      PageTitle: "./src/components/DocumentationTitle.astro",
      Sidebar: "./src/components/DocumentationSidebar.astro",
      PageSidebar: "./src/components/DocumentationContents.astro",
      ThemeProvider: "./src/components/WebsiteThemeProvider.astro",
      ThemeSelect: "./src/components/WebsiteThemeSelect.astro",
    },
    sidebar: [
      { label: "Template Reference", items: [{ label: "Compose Templates", slug: "reference/templates/composition" }] },
      { label: "Schema Reference", link: "/schema" },
      { label: "Existing guides on GitHub", items: [
        { label: "Getting started ↗", link: "https://github.com/Simao-Pereira-Gomes/Atomize/blob/main/README.md" },
        { label: "Workflows ↗", link: "https://github.com/Simao-Pereira-Gomes/Atomize/blob/main/docs/Workflows.md" },
        { label: "Atomize Studio ↗", link: "https://github.com/Simao-Pereira-Gomes/Atomize/blob/main/docs/Atomize-Studio.md" },
        { label: "VS Code extension ↗", link: "https://github.com/Simao-Pereira-Gomes/Atomize/blob/main/docs/VS-Code-Extension.md" },
        { label: "CLI ↗", link: "https://github.com/Simao-Pereira-Gomes/Atomize/blob/main/docs/Cli-Reference.md" },
      ] },
    ],
  })],
  markdown: { processor: unified({ remarkPlugins: [canonicalSections] }) },
  vite: { plugins: [watchCanonicalGuides()] },
});
