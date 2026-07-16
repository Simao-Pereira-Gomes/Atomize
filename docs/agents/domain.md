# Domain Docs

How engineering skills should consume this repository's domain documentation.

## Before exploring

Read these in order:

1. **`CONTEXT-MAP.md`** at the repository root.
2. The shared **`CONTEXT.md`** and the context document that owns the area being changed.
3. **`docs/adr/`** entries that touch the area.

If a referenced document does not exist, proceed silently. The producer skill (`/grill-with-docs`) creates glossary and decision documents only when a term or decision is resolved.

## File structure

This repository has a shared domain and product-surface contexts:

```
/
├── CONTEXT-MAP.md
├── CONTEXT.md
├── docs/
│   └── adr/
│       ├── 0001-*.md
│       └── ...
└── packages/
    ├── vscode-extension/
    │   └── CONTEXT.md
    └── template-builder/
        └── CONTEXT.md
```

## Use the glossary's vocabulary

When output names a domain concept (in an issue title, refactor proposal, hypothesis, or test name), use the term defined in the shared or owning context glossary. Do not drift to synonyms the glossary explicitly avoids.

If a needed concept is not in either glossary, reconsider whether it belongs to an existing term or note the gap for `/grill-with-docs`.

## Flag ADR conflicts

If output contradicts an existing ADR, surface it explicitly rather than silently overriding it:

> _Contradicts ADR-0007 — but worth reopening because…_
