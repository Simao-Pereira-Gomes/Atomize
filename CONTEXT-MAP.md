# Atomize context map

Atomize has one shared domain and two product-surface contexts. Read the shared context first, then the context that owns the code being changed.

| Context | Documentation | Owns |
| --- | --- | --- |
| Shared Atomize domain | [CONTEXT.md](CONTEXT.md) | Templates, Catalogs, Work Items, Connection Profiles, validation modes, and generation semantics. |
| VS Code extension | [packages/vscode-extension/CONTEXT.md](packages/vscode-extension/CONTEXT.md) | Editor-facing authoring, validation, profile-management, and browser surfaces. |
| Atomize Studio | [packages/atomize-studio/CONTEXT.md](packages/atomize-studio/CONTEXT.md) | Desktop app covering Template authoring, Starting Paths, task generation, Catalog management, Connection Profile management, and companion process recovery. |

Cross-cutting architectural decisions remain in `docs/adr/`. Add a context-local ADR directory only when that context accumulates decisions that do not affect the shared domain or another surface.
