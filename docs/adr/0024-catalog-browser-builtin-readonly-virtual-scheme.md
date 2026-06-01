# Catalog Browser: virtual scheme for built-in Catalog item files

The `atomize.browseCatalog` command opens built-in Catalog item files as virtual read-only documents via a `TextDocumentContentProvider` registered under the `atomize-catalog:` URI scheme, rather than opening the real file path with `vscode.Uri.file(item.path)`.

Built-in Catalog items live inside the installed CLI package; surfacing them as editable files would let users accidentally modify them, with no meaningful save target and no warning. A virtual document is structurally read-only — VS Code refuses to save it — and shows the lock icon in the tab title at no extra cost. The pattern is identical to ADR-0023 (`atomize-resolved:` for Resolved Templates); the `atomize-catalog:` scheme is a parallel provider in the same file as the Catalog Browser command.

User and project Catalog items are opened via `vscode.Uri.file(item.path)` as normal editable documents, because those files are user-owned and intentionally writable.

**Considered:** opening all Catalog item files via `vscode.Uri.file(item.path)` with `preview: true` — rejected because `preview: true` only controls tab-pinning behaviour, not editability; built-in files would remain fully editable and saveable to their on-disk path inside the CLI package.
