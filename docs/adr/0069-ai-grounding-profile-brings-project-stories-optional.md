# AI Grounding: a Connection Profile brings Project Grounding for both AI actions, and Stories are never sent

Before this decision, "grounded draft" meant different things on different surfaces. Atomize Studio grounded drafts in project metadata, following ADR-0045. The CLI's `template create --ai --ground` instead ran the Story Learner over about ten recent Stories, picked without regard to what the user was drafting, and if that failed it quietly continued ungrounded.

The decision is **one Grounding rule for both AI actions**, drafting and improving alike:

- **Choosing a Connection Profile brings Project Grounding.** Real Work Item types, field names and allowed values, saved query paths, and area and iteration paths stop the AI from inventing names. This applies whether the AI is writing a draft or proposing conditions, custom fields and queries in an improvement.
- **Stories are never sent to the AI.** A team's conventions reach it through Reference Documents and the user's own words instead.
- **"No grounding" means no project metadata.** An Ungrounded Draft remains a deliberate choice. It suits users without a Connection Profile, and Templates meant to be shared across projects, which shouldn't carry one project's names.

On the CLI, `--ground` gives Project Grounding on `template create --ai` and `template improve`. Leaving it out in a non-interactive run means an Ungrounded Draft.

Grounding the user asked for never disappears silently. Interactive runs that fail to retrieve it offer Retry, Continue ungrounded or Cancel. Non-interactive runs exit with an error.

**Document Grounding** is the second kind. The user selects Reference Documents (Azure DevOps wiki pages read through the chosen Connection Profile, or local Markdown or text files inside the Workspace Root), and their text is sent as reference material, never as instructions, for either AI action. Local files need no Connection Profile, so a run without a profile can still be grounded in documents. Document Grounding has a fixed total size limit of about 24,000 characters on every surface. It is split evenly across documents, and space a short document doesn't use goes to the others. Truncation is never silent: interactive runs show it before sending and let the user continue, deselect documents or cancel. Non-interactive runs print a warning and record it in the report. Only the selected page is read, with no sub-pages and no followed links, and images and attachments are skipped. A wiki needs the optional Wiki (Read) token scope. When the scope is missing, the user is told to rotate the token, and local files keep working. Project Reference Documents are covered by ADR-0070.

## Considered Options

- **Automatically picked recent Stories for drafts (the CLI's old behaviour).** Rejected. Stories chosen without regard to what is being drafted add noise.
- **User-picked example Stories for drafts.** Shipped, then removed (2026-10). Example Stories only help teams that already break Stories into Tasks consistently, who need Atomize least; teams with messy or missing Tasks would teach the draft their mess. A draft has no Template filter to make the candidate list relevant, so users searched blind, and the conventions examples carry (Task naming, estimate splits, review steps) are better stated once in a Reference Document.
- **Stories a Template was applied to, as evidence for an improvement.** Shipped, then removed (2026-10). Generated Tasks carry no marker, so the AI saw a flat Task list and had to guess which Tasks the Template made and which people added; deleted Tasks, the strongest signal, never appeared. A Story's current state and sprint describe where it is now, not when the Template ran, yet invited changes to the Template's filter. Doing this properly needs generated Tasks to be marked and core to compute the drift itself, a different feature. Users who know where a Template doesn't fit can say so in the improvement's guidance.
- **The Story Learner, a deterministic non-AI derivation of a Template from Stories.** Removed (2026-10). It was a second "learn from Stories" path with the same cold-start weakness and a large pattern-detection surface to maintain; AI drafting with Project and Document Grounding covers creating a Template.

## Consequences

- `template create` no longer accepts `--from-stories`, `--estimation-source`, `--include-sensitive-ai-context` or `--platform`, and `template improve` no longer accepts `--from-stories` or `--include-sensitive-ai-context`. The `template improve --output` report drops `groundingStoryIds` and `sensitiveContextIncluded`.
- `GroundingService`'s silent `null` returns become errors the caller can see, so each surface can offer the explicit retry or ungrounded choice.
- The Story Browser serves generation only.
