# Atomize documentation website

The Astro + Starlight portal adapts canonical repository guides into focused
pages. The shared Schema Reference lives at `/reference/templates/schema/`, inside the same website
layout, navigation, search, and theme controls as the guides. Both document `main`,
not a particular CLI, extension, or Studio release. The root helps readers choose
a tool, with quickstarts at `/getting-started/cli/`, `/getting-started/studio/`,
and `/getting-started/vscode/`. Focused Studio and VS Code authoring, inspection,
settings, recovery, and Studio generation guides are under `/studio/` and `/vscode/`.
Connection requirements, Connection Profile setup, CLI automation, and connection
recovery are under `/connections/`.
`/releases/` links to each tool's GitHub Releases without copying release notes.
Its tag filters include the current major release series because GitHub requires
a version number in a tag-prefix search. Update the series when a tool releases
a new major version; the page also links to the complete release history.
Desktop readers can collapse the navigation to an icon rail with the button
beside the brand; labels appear on hover and keyboard focus. The choice persists
across pages. Small screens retain the mobile menu.
The sidebar is the only page navigation; the header holds the brand, search,
theme switch, and navigation toggle.
Schema Reference sits inside the Templates section. Its field navigation and
fields use separate scroll areas, so reading fields does not move navigation.
The old `/schema` URL forwards to the new route with query and field fragments
preserved. Cloudflare uses `public/_redirects`; local static previews use the
compatibility page. Keep both when changing the published route.

## Run and check

From the workspace root, install with `bun install`, then:

```sh
bun run --cwd packages/website dev
```

Open `http://localhost:4321/` for onboarding,
or `http://localhost:4321/reference/templates/schema/` for the shared field viewer.

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

Do not use em dashes in documentation or website copy. Use full stops, commas,
colons, semicolons, or parentheses as appropriate for the sentence.

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

The canonical guide delimits the reused content with matching section markers,
which GitHub does not render:

```md
<!-- atomize:section template-composition -->

...shared explanation...

<!-- /atomize:section -->
```

Headings are not part of the contract, so retitling one in a canonical guide
cannot move or empty a website page. Keep the markers outside the heading they
belong to and before any trailing `---`. `src/lib/documentation.ts` maps the
name to its canonical Markdown file, published route, and public anchors. The
Markdown plugin includes the marked AST before normal heading,
code-highlighting, and search processing, and promotes the shallowest included
heading to level 2. Unknown names, missing or unclosed markers, and duplicate
sections fail the build. Canonical source content is part of the content-cache
digest, and source changes restart dev compilation.

Relative guide links are rebased to their canonical GitHub destinations unless
the target explanation has a published portal route. Schema links use the local
viewer; relative images retain their canonical repository raw-image URL. The
website viewer's composition links return to the focused guide; other explanation
links continue to GitHub until their portal pages are delivered.

The home page reuses the `onboarding-overview` section in the root README; the
CLI quickstart reuses its `cli-quickstart` section. Update shared installation,
commands, and expected results there. Keep the chooser and next-reading framing
in website pages. Changes to the README trigger site checks and deployment, as
does the Template Reference source.

Studio pages reuse the marked sections in `docs/Atomize-Studio.md`. Published
sections link to each other through `canonicalGuideUrl`; explanations that have
not been adapted retain their canonical GitHub links. Screenshots have one owner
under `public/studio/`. The canonical guide links to those files for GitHub
readability, and the section loader rewrites those image links to local assets.

Each screenshot has a light and a dark capture, named `<image>-light.png` and
`<image>-dark.png`. Canonical guides reference both with a `<picture>`, so GitHub
follows the reader's colour scheme:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="../packages/website/public/studio/mock-preview-dark.png">
  <img alt="Useful description of the screenshot." src="../packages/website/public/studio/mock-preview-light.png">
</picture>
```

Keep exactly that shape, without blank lines. The section loader publishes both
images, and CSS shows the one matching the portal's selected theme, which can
differ from the operating system's. Any other `<picture>` fails the build.

Connection pages reuse marked sections in `docs/Auth-Guide.md`, which owns profile
and credential behaviour, and `docs/Platform-Guide.md`, which owns current platform
support and Azure DevOps errors. Describe each tool's own profile surface: the CLI
and Studio share profile records, while VS Code stores its profiles separately.
Keep Copilot sign-in distinct from Connection Profiles, and describe only platforms
Atomize supports today. Changes to both guides trigger site checks and deployment.

## Refresh Studio screenshots

The authoring and Mock Preview images were captured from the current Studio UI
on 2026-10-15 at 1440 × 1000 in light and dark mode. They show the built-in Backend API
Development Template and an offline Mock Story with estimate 8. There are no
Connection Profiles, credentials, or customer data in the authoring and preview
captures. The Connection Profile capture shows the real Manage work projects
dialog with two fictional `contoso` connections returned by the substituted IPC
boundary; no token is involved. The Live Execution Confirmation capture chooses one of
those connections as the Work project, browses three fictional Stories, picks
two, and stops at confirmation. The substituted boundary returns a dry-run
report built from the built-in Template's preview and rejects anything other
than that dry run, so the capture never simulates Task creation.

Start the current Studio frontend from the repository root:

```sh
bun run --cwd packages/atomize-studio vite:dev --host 127.0.0.1 --port 1423
```

In another terminal, start a dedicated Chrome instance with a fresh temporary
profile. On macOS:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --remote-debugging-port=9230 --user-data-dir=/tmp/atomize-docs-chrome about:blank
```

On other systems use the installed Chrome or Chromium executable with the same
flags. Then run:

```sh
bun packages/website/scripts/capture-studio.mjs
```

The script captures every screen once with the light colour scheme and once with
the dark one; Studio takes its initial theme from that setting. It pins the
browser locale to `en-GB`, so number and date formats match the docs on any
machine. If port 9230 is taken, start Chrome on another port and set
`ATOMIZE_STUDIO_DEBUG_PORT`.

The script drives the real Starting Paths, Catalog Clone, Tasks, and Generate
components. It substitutes only the native IPC boundary, using the current
built-in Template and inspection/preview results from `atomize-core`. It asserts
the documented Mock Story inputs and result, and the fictional connection details, before capturing. It does not test
the native installer or companion-process transport. Use a dedicated browser
profile because the capture clears its local storage. Close it after capture.

Review all eight PNGs, update the adjacent canonical instructions and alt text when
labels or behaviour change, and run the website checks. If the built-in Template
changes its six-Task example, update the quickstart and capture assertions together.
Shared Studio Markdown changes and these media files trigger CI and deployment.

## Refresh VS Code screenshots

VS Code pages reuse marked sections in `docs/VS-Code-Extension.md`. The images
under `public/vscode/` were captured on 2026-10-15 from a real Extension
Development Host running this checkout, with the built-in Backend API Development
Template and the documented offline Mock Story. No platform credentials or AI
sign-in are used. The native editor and extension engine are not mocked.

Build the current extension:

```sh
bun run --cwd packages/vscode-extension build
```

Use a dedicated empty workspace, user-data directory, and extensions directory
under a temporary folder, such as `/tmp/atomize-vscode-docs/`. Keep the path short:
macOS rejects VS Code IPC sockets longer than 103 characters. Install or link
`redhat.vscode-yaml` and `Catppuccin.catppuccin-vsc` into that extensions
directory. For example:

```sh
mkdir -p /tmp/atomize-vscode-docs/workspace /tmp/atomize-vscode-docs/user/User
code --user-data-dir=/tmp/atomize-vscode-docs/user --extensions-dir=/tmp/atomize-vscode-docs/extensions --install-extension redhat.vscode-yaml --install-extension Catppuccin.catppuccin-vsc
```

In that profile's `User/settings.json`, use Catppuccin Latte, which matches the
website's light code blocks and keeps YAML keys and strings distinct. Use font
size 16, hide the activity bar, command center, and minimap, disable workspace
trust prompts and tips, and start without a welcome editor. Disable updates, extension auto-updates, telemetry, and SchemaStore
network requests for the offline capture:

```json
{
  "workbench.colorTheme": "Catppuccin Latte",
  "editor.fontSize": 16,
  "editor.minimap.enabled": false,
  "workbench.activityBar.location": "hidden",
  "window.commandCenter": false,
  "workbench.editor.enablePreview": false,
  "workbench.tips.enabled": false,
  "workbench.startupEditor": "none",
  "security.workspace.trust.enabled": false,
  "update.mode": "none",
  "extensions.autoUpdate": "off",
  "extensions.autoCheckUpdates": false,
  "telemetry.telemetryLevel": "off",
  "yaml.schemaStore.enable": false
}
```

Close that isolated instance after extension installation. Launch its development
host with port 9234, using the Electron executable directly if the `code` wrapper
does not expose the debugger. On macOS, from the repository root:

```sh
"/Applications/Visual Studio Code.app/Contents/MacOS/Code" --user-data-dir=/tmp/atomize-vscode-docs/user --extensions-dir=/tmp/atomize-vscode-docs/extensions --extensionDevelopmentPath="$PWD/packages/vscode-extension" --remote-debugging-port=9234 --skip-welcome --skip-release-notes /tmp/atomize-vscode-docs/workspace
```

Use your installed Code executable on other platforms, then run:

```sh
bun packages/website/scripts/capture-vscode.mjs
```

The script switches the host to Catppuccin Latte and then Catppuccin Mocha
through Preferences: Color Theme, capturing each screen in both. If port 9234 is
taken, launch the host on another port and set `ATOMIZE_VSCODE_DEBUG_PORT`.

The script closes editors in this dedicated host, opens the real built-in Template
through Browse Catalog's backing-file button, captures CodeLens and YAML, and
runs Mock Preview with estimate 8. It drives the separate webview process to
submit the actual form. It then adds two fictional `contoso` profiles through
the real **Atomize: Manage Profiles** inputs, with a placeholder token that is
never tested or sent anywhere, and captures one profile's actions cropped to the
Quick Pick. It skips profiles that already exist in the isolated host. The captures omit the host title bar and status bar;
their content is otherwise the unmodified editor UI. Review all six images, alt
text, and adjacent instructions after changes to the Catalog, authoring,
preview, or profile management UI. Changes to the canonical VS Code guide and these media files trigger
website checks and deployment. Close the isolated host after capturing.

## Add a focused page

1. Identify the canonical owner and section boundary, and wrap it in section
   markers. Reorganize canonical sections only when useful, preserving old
   paths and heading links.
2. Register its include name, source file, route, and anchors in
   `src/lib/documentation.ts`. Extend guide-link routing when publishing a new
   explanation; field facts remain owned by the generated schema.
3. Add a Markdown page under `src/content/docs/` with a direct title, description,
   `editUrl: false`, website framing, and the include marker. The public portal
   has no editing control; documentation changes use repository review.
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
