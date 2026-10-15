# Atomize website

## Throwaway portal UI study (#263)

Run `bun run prototype:portal` from the workspace root and open
`http://localhost:4321/schema?variant=A`. Compare A (documentation sidebar),
B (reading room with a field drawer), and C (guide and live schema side by side)
using the floating bottom bar or left/right arrow keys. Each variant adapts the
same composition section from the canonical Template Reference. Search is
limited to the prototype's guide sections; the embedded Schema Reference uses
the real viewer and its field search. Theme and other UI state stay in memory;
the variant is carried in the URL.

The study is dev-only and is not the implementation of Starlight or a completed
issue #263. After a design is selected, preserve the variants on a throwaway
branch and link the question, verdict, and branch from the issue before replacing
the prototype with production code.

## Existing Schema Reference

Run `bun install` at the workspace root, then `bun run --cwd packages/website dev`.
Open `http://localhost:4321/schema` to browse the shared Schema Reference.

`bun run --cwd packages/website build` produces a static site in `dist`.
`bun run --cwd packages/website preview` serves that output locally.
The root redirects to `/schema`. The page labels the development schema with
`main`, the current short commit and the UTC build date; installed applications
will supply their own version labels when their integrations land.

Use the header's light/dark toggle to choose a theme. It starts with the system
preference and remembers explicit choices in this browser. Search covers nested
fields such as `strategy` and `conversion` as well as their descriptions.

## Publishing

The site is live at https://atomize-cd9.pages.dev/schema (Cloudflare Pages
project `atomize`, ADR-0072). `.github/workflows/deploy-website.yml` deploys it
on every push to `main` that touches `atomize-schema`,
`atomize-schema-reference` or this package. It isn't versioned and doesn't wait
for a CLI, extension or Studio release.

PRs touching the same paths get a preview at
`https://pr-<number>.atomize-cd9.pages.dev/schema`, posted as a PR comment. The
preview check is advisory. It is skipped for fork PRs, which have no Cloudflare
secrets. Deploys need the `CLOUDFLARE_API_TOKEN` (Account → Cloudflare Pages →
Edit) and `CLOUDFLARE_ACCOUNT_ID` repository secrets.
