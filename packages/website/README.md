# Atomize website

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

Cloudflare Pages publishing and PR previews are tracked separately in #251.
