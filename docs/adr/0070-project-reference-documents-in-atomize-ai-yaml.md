# Project Reference Documents live in `.atomize/ai.yaml`, pre-selected but always confirmed

A team's process documentation, such as an Azure DevOps wiki page on how they size and break down work or a `docs/how-we-work.md` in the repo, rarely changes. Making every user find it again on every AI draft or improvement would be tedious. The decision: a team records its **Project Reference Documents** in `.atomize/ai.yaml` under the Workspace Root, committed with the repo, and the CLI, Atomize Studio and the VS Code extension all read the same file. Each entry is either `wiki:<wiki>/<page path>` or `file:<path relative to the Workspace Root>`.

Every AI run shows the saved documents **ticked but visible**, and the user can untick them or add others for that run. Nothing reaches a Copilot Session without being shown first. A saved wiki page is offered only when the run's Connection Profile reaches that wiki's project. Otherwise it is listed as unavailable and the run does not fail. A `file:` entry must resolve to a `.md` or `.txt` file inside the Workspace Root, so a committed `ai.yaml` can never point a teammate's run at files outside the repo, such as `~/.ssh`. Users can add entries from any surface with an "Also save for this project" option, or edit the file by hand. The file has a JSON Schema, so the VS Code extension gives completion and validation for it. On the CLI, `--no-project-references` leaves the saved list out of a run.

## Considered Options

- **Picking documents every run.** Rejected as tedious for documents that rarely change, and the team's shared knowledge of where its process lives would never be recorded.
- **A per-user "last used documents" preference.** Rejected. It is hidden personal state that doesn't help teammates, and it differs from machine to machine.
- **Sending saved documents automatically, without showing them.** Rejected: a committed file must never silently widen what leaves a user's machine. Here the saved item is a pointer that is always shown before use.

## Consequences

- `.atomize/` holds its first project configuration besides the project Catalog. Future project-level AI settings belong in `ai.yaml` rather than in a new file.
- `ai.yaml` is a format users commit, so later changes to it must stay backward compatible or be migrated.
