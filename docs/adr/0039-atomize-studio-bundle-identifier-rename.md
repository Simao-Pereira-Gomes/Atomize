# Atomize Studio: bundle identifier renamed pre-release

ADR-0033 set the Tauri bundle identifier to `io.github.simao-pereira-gomes.template-builder` under a GitHub-namespace convention, warning that changing it after release breaks OS-level app identity (keychain entries, installer upgrade paths, macOS sandboxing). Atomize Studio (formerly Template Builder) has not shipped a release, so that risk does not apply yet.

**Decision:** as part of the #130 rename, the identifier changes to `io.github.simao-pereira-gomes.atomize-studio` — the same GitHub-namespace convention from ADR-0033, with only the leaf segment swapped. This is not a new namespacing decision; it exists so a reader who finds `io.github.simao-pereira-gomes.atomize-studio` in `tauri.conf.json` and goes looking for ADR-0033 (which names `template-builder`) can confirm the mismatch is intentional and not a missed rename.
