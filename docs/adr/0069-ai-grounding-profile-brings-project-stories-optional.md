# AI Grounding: a Connection Profile brings Project Grounding for both AI actions, and Stories are optional evidence for improving only

Before this decision, "grounded draft" meant different things on different surfaces. Atomize Studio grounded drafts in project metadata, following ADR-0045. The CLI's `template create --ai --ground` instead ran the Story Learner over about ten recent Stories, picked without regard to what the user was drafting, and if that failed it quietly continued ungrounded.

The decision is **one Project Grounding rule for both AI actions, with Story Grounding reserved for improving**:

- **Choosing a Connection Profile always brings Project Grounding.** Real Work Item types, field names and allowed values, saved query paths, and area and iteration paths stop the AI from inventing names. This applies whether the AI is writing a draft or proposing conditions, custom fields and queries in an improvement.
- **Story Grounding is optional evidence on top of an improvement, and the user always selects the Stories.** They are Stories the Template was actually applied to, offered from a list built from the Template's own filter (with `excludeIfHasTasks` turned off, and only Stories that already have Tasks). Atomize never picks Stories on its own. Drafts take no Story Grounding: a team's conventions reach a draft through Reference Documents instead.
- **"No grounding" means neither kind.** An Ungrounded Draft remains a deliberate choice. It suits users without a Connection Profile, and Templates meant to be shared across projects, which shouldn't carry one project's names.

On the CLI, `--ground` gives Project Grounding on `template create --ai` and `template improve`. On `template improve`, `--from-stories <ids>` adds Story Grounding and implies `--ground`. Leaving out the grounding flags in a non-interactive run means an Ungrounded Draft.

Grounding the user asked for never disappears silently. Interactive runs that fail to retrieve either kind of Grounding offer Retry, Continue ungrounded or Cancel. Non-interactive runs exit with an error. Story Grounding excludes Sensitive AI Context unless the user opts in for that run, and that opt-in is never saved as a preference.

**Document Grounding** is the third kind. The user selects Reference Documents (Azure DevOps wiki pages read through the chosen Connection Profile, or local Markdown or text files inside the Workspace Root), and their text is sent as reference material, never as instructions, for either AI action. Local files need no Connection Profile, so a run without a profile can still be grounded in documents. Document Grounding has a fixed total size limit of about 24,000 characters on every surface. It is split evenly across documents, and space a short document doesn't use goes to the others. Truncation is never silent: interactive runs show it before sending and let the user continue, deselect documents or cancel. Non-interactive runs print a warning and record it in the report. Only the selected page is read, with no sub-pages and no followed links, and images and attachments are skipped. A wiki needs the optional Wiki (Read) token scope. When the scope is missing, the user is told to rotate the token, and local files keep working. Project Reference Documents are covered by ADR-0070.

## Considered Options

- **Automatically picked recent Stories for drafts (the CLI's old behaviour).** Rejected. Stories chosen without regard to what is being drafted add noise, and a draft has no Template filter to make a list of candidates relevant.
- **One kind of Grounding per action (Project Grounding for drafting, Story Grounding for improving).** This was the first version of this ADR. Rejected because improvements then had no project metadata and could invent fields.
- **User-picked example Stories for drafts.** Shipped first, then removed (2026-10). Example Stories only help teams that already break Stories into Tasks consistently, who need Atomize least; teams with messy or missing Tasks would teach the draft their mess. A draft has no Template filter to make the candidate list relevant, so users searched blind, and the conventions examples carry (Task naming, estimate splits, review steps) are better stated once in a Reference Document. Improving keeps Story Grounding because there it is the only evidence of how a Template's Tasks fared after it ran.
- **The Story Learner, a deterministic non-AI derivation of a Template from Stories.** Removed alongside draft examples (2026-10). It was a second "learn from Stories" path with the same cold-start weakness and a large pattern-detection surface to maintain; AI drafting with Project and Document Grounding covers creating a Template, and Story Grounding covers refining one.
- **A persisted Sensitive AI Context setting.** Rejected. A workspace setting can be committed and silently widen what leaves the machine for every teammate.

## Consequences

- `template create` no longer accepts `--from-stories`, `--estimation-source`, `--include-sensitive-ai-context` or `--platform`; `--ground` brings project metadata only, and automatic Story selection is gone.
- `GroundingService`'s silent `null` returns become errors the caller can see, so each surface can offer the explicit retry or ungrounded choice.
- Stories for an improvement are always selected through the shared Story Browser. It opens on the Stories matching the Template's filter, and can switch to Search.
