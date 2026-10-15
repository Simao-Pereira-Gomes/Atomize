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
    expressiveCode: { themes: ["starlight-dark", "github-light"], useStarlightUiThemeColors: true },
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
      { label: "Template Reference", items: [{ label: "Compose Templates", slug: "reference/templates/composition" }] },
      { label: "Schema Reference", link: "/schema" },
      { label: "More guides", items: [
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
