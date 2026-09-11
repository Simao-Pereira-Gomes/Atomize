
## Agent skills

### Issue tracker

Issues live in GitHub Issues (`github.com/Simao-Pereira-Gomes/Atomize`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

A shared `CONTEXT.md` + `docs/adr/` at the repo root, plus a `CONTEXT.md` per product-surface package (`packages/vscode-extension/`, `packages/atomize-studio/`). See `docs/agents/domain.md`.

### Release notes

Squash-merged PR titles become release-note lines across every surface whose dependency closure the change touches. Commit/version-bump/trailer rules: `docs/agents/release-notes.md` (mechanism in `docs/Releasing.md`).
