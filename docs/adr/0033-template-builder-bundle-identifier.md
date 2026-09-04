# Template Builder: Tauri bundle identifier as GitHub namespace

Tauri requires a `identifier` in `tauri.conf.json` — the macOS bundle ID and Windows AppUserModelID. This value is set once; changing it after release breaks OS-level app identity (keychain entries, installer upgrade paths, macOS app sandboxing).

Two namespacing approaches were considered:

**Brand namespace** (`io.atomize.template-builder`): aligns with the product name but claims a domain (`atomize.io`) that is not owned or registered.

**Chosen approach: GitHub namespace** (`io.github.simao-pereira-gomes.template-builder`).

Tied to the actual GitHub identity of the repository owner. Avoids claiming a brand domain that does not exist, consistent with the convention for solo open-source projects, and unambiguous if the project is ever transferred or forked.
