# Schema Reference styling prototype

Question: which information hierarchy makes the Schema Reference easiest to browse?

Run from the workspace root: `bun run --cwd packages/website prototype`.
The existing `/schema` route renders these variations only in development:

- `?variant=A`: Documentation — field index, reading column, individual field panels.
- `?variant=B`: Inspector — selectable schema outline, focused field, specification pane.
- `?variant=C`: Field guide — numbered entries, editorial typography, continuous reading.

The floating switcher and left/right arrow keys cycle through them. The URL preserves
the variant on reload. Template/Mixin tabs and nested fields use the real schema.
State is in memory; no persistence or external mutations.

Verdict: the user chose A's documentation layout and typography with B's expandable
field navigation, plus stronger text contrast. Keep field details visible together
instead of requiring an inspector selection, and use the sidebar to reach nested
fields. Implement this in the shared viewer. Preserve this full experiment on a
throwaway branch and link the archive and decision from #250; remove the prototype
components and switcher from the feature branch.
