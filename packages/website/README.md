# Atomize documentation website

The Astro + Starlight portal adapts canonical repository guides into focused
pages. The shared Schema Reference remains at `/schema`. Both document `main`,
not a particular CLI, extension, or Studio release. The root still redirects to
`/schema`; the tool chooser and quickstarts are tracked separately in #264–#266.

## Run and check

From the workspace root, install with `bun install`, then:

```sh
bun run --cwd packages/website dev
```

Open `http://localhost:4321/reference/templates/composition/` for the first guide,
or `http://localhost:4321/schema` for the shared field viewer.

```sh
bun run --cwd packages/website typecheck
bun run --cwd packages/website test
bun run --cwd packages/website build
bun run --cwd packages/website check:docs
bun run --cwd packages/website preview
```

The static build in `dist/` includes Starlight's Pagefind documentation index.
Use the preview server to check real search results; dev search does not use a
fresh production index. The shared viewer's field search works independently.
The build wrapper clears ambient `DEV` and `PROD` variables inside its process
so shell directory variables cannot override Astro's boolean mode flags.
`check:docs` checks rendered internal links, anchors (including hydrated schema
field links), assets, and guide/schema/search smoke assertions. Missing required
frontmatter fails content validation during the build. `check:external` also
probes external links and reports failures as advisories so transient remote
errors do not block unrelated work.

## Edit shared content

`docs/README.md` records canonical ownership. Update behaviour and examples in
the owning repository guide, not a website copy. ADR-0074 records this boundary.
Existing repository paths and heading links must remain valid.
Shared explanations and YAML examples must be tool-neutral. Put concrete Studio,
VS Code, and CLI actions in a separate workflow section or their surface guide,
and explain meaningful differences instead of defaulting every reader to CLI
commands. Historical CLI version requirements are not minimum versions for the
independently released desktop app or extension.

A focused website page contains frontmatter, a short introduction, and a named
include marker, for example:

```md
<!-- atomize:include template-composition -->
```

`src/lib/documentation.ts` maps that name to a canonical Markdown file, section
heading slug, published route, and the section's public anchors. The Markdown
plugin includes the section's AST before normal heading, code-highlighting, and
search processing. It stops at the next heading of equal or higher level and
promotes child headings for the focused page. The canonical file itself stays
readable on GitHub. Unknown sections fail the build. Canonical source content
is part of the content-cache digest, and source changes restart dev compilation.

Relative guide links are rebased to their canonical GitHub destinations unless
the target explanation has a published portal route. Schema links use the local
viewer; relative images retain their canonical repository raw-image URL. The
website viewer's composition links return to the focused guide; other explanation
links continue to GitHub until their portal pages are delivered.

## Add a focused page

1. Identify the canonical owner and section boundary. Reorganize canonical
   sections only when useful, preserving old paths and heading links.
2. Register its include name, source section, route, and anchors in
   `src/lib/documentation.ts`. Extend guide-link routing when publishing a new
   explanation; field facts remain owned by the generated schema.
3. Add a Markdown page under `src/content/docs/` with a direct title, description,
   canonical edit link, website framing, and the include marker.
4. Add it to Starlight's sidebar in `astro.config.mjs`; use real destinations for
   related material, including GitHub fallbacks for guides not yet published.
5. Extend rendered smoke checks and check every new internal link and anchor.
   Verify the page, search, keyboard navigation, both themes, and a narrow viewport.
6. Add any newly consumed canonical source and local media paths to both push
   and PR deployment triggers and the relevant CI change filter. Shared branding,
   the workspace manifest, and lockfile are also deployment inputs.

## Publishing

Cloudflare Pages hosts the site at `https://atomize-cd9.pages.dev` (project
`atomize`, ADR-0072). GitHub Actions validates and builds before production
deployments from `main`; relevant PRs get advisory previews. Fork PRs and runs
without Cloudflare secrets skip deployment but still receive normal CI checks.
Publishing uses `CLOUDFLARE_API_TOKEN` (Account → Cloudflare Pages → Edit) and
`CLOUDFLARE_ACCOUNT_ID` repository secrets.

## Design source

The selected layout is the sidebar-led documentation variant A, with direct
headings, readable navigation and body text, exact field links, and a restrained
development notice. The three throwaway variants and verdict are preserved on
[`prototype/263-docs-portal-layouts`](https://github.com/Simao-Pereira-Gomes/Atomize/tree/prototype/263-docs-portal-layouts)
and linked from #263. Prototype components and switching controls are not part
of the production site.
