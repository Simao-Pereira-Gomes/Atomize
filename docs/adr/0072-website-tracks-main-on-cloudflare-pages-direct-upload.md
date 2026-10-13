# The website tracks `main` on Cloudflare Pages via Direct Upload

The Schema Reference needs a public, linkable URL before the full website exists. The decision: start the Astro site now as a minimal app in `packages/website`, with one route, `/schema`, that mounts the shared viewer (ADR-0071). It is hosted on Cloudflare Pages at `*.pages.dev` and deployed by GitHub Actions with `wrangler pages deploy`.
- **Production** deploys on every push to `main` that touches `packages/atomize-schema/**`, `packages/atomize-schema-reference/**` or `packages/website/**`.
- **Previews** deploy for PRs that touch the same paths. The preview check is advisory and never required, because fork PRs have no Cloudflare secrets.

The page documents `main` and is labelled with the commit and date rather than a version. It notes that the Schema Reference inside Studio and the VS Code extension matches the user's installed version.

## Considered Options

- **GitHub Pages.** Rejected by the maintainer. The `gh-pages` branch already serves benchmark charts.
- **Netlify.** Rejected. The free tier's credit model allows roughly 20 production deploys a month, and the site pauses when credits run out.
- **Vercel Hobby.** Rejected because its non-commercial-use clause is a risk for the project.
- **Cloudflare's Git integration.** Rejected. It builds on every push, outside the path filters and the repo's workflow topology. The repo's pattern is checks on PRs and publishing on `main`.
- **Documenting only the latest CLI release.** Rejected. `atomize-schema` ships inside three independently versioned surfaces, so "released" is ambiguous. The page could lag behind the extension or Studio, and keeping the content pinned to a tag while the viewer ships freely needed extra build machinery. The in-app viewers already give version-exact answers.
- **Versioned pages or a separate schema version.** Rejected as out of proportion for a single page. It would also complicate the permalinks.

## Consequences

- The public page can show fields that a reader's installed CLI, extension or Studio doesn't accept yet. The label and the pointer to the in-app viewer cover this.
- The repo needs the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.
- Moving to a custom domain later means repointing the permalinks in the markdown docs.
