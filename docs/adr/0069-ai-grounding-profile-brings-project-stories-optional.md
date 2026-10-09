# AI Grounding: a Connection Profile brings Project Grounding, and Stories are optional evidence, for drafting and improving alike

Before this decision, "grounded draft" meant different things on different surfaces. Atomize Studio grounded drafts in project metadata, following ADR-0045. The CLI's `template create --ai --ground` instead ran the Story Learner over about ten recent Stories, picked without regard to what the user was drafting, and if that failed it quietly continued ungrounded.

The decision is **one Grounding rule for both AI actions**:

- **Choosing a Connection Profile always brings Project Grounding.** Real Work Item types, field names and allowed values, saved query paths, and area and iteration paths stop the AI from inventing names. This applies whether the AI is writing a draft or proposing conditions, custom fields and queries in an improvement.
- **Story Grounding is optional evidence on top, and the user always selects the Stories.** For drafting, the Stories are examples of the team's conventions that the user picks by hand. For improving, they are Stories the Template was actually applied to, offered from a list built from the Template's own filter (with `excludeIfHasTasks` turned off, and only Stories that already have Tasks). Atomize never picks Stories on its own.
- **"No grounding" means neither kind.** An Ungrounded Draft remains a deliberate choice. It suits users without a Connection Profile, and Templates meant to be shared across projects, which shouldn't carry one project's names.

On the CLI, `--ground` gives Project Grounding alone, and `--from-stories <ids>` adds Story Grounding and implies `--ground`. This works the same way on `template create --ai` and `template improve`. Leaving out both flags in a non-interactive run means an Ungrounded Draft.

Grounding the user asked for never disappears silently. Interactive runs that fail to retrieve either kind of Grounding offer Retry, Continue ungrounded or Cancel. Non-interactive runs exit with an error. Story Grounding excludes Sensitive AI Context unless the user opts in for that run, and that opt-in is never saved as a preference.

## Considered Options

- **Automatically picked recent Stories for drafts (the CLI's old behaviour).** Rejected. Stories chosen without regard to what is being drafted add noise, and a draft has no Template filter to make a list of candidates relevant.
- **One kind of Grounding per action (Project Grounding for drafting, Story Grounding for improving).** This was the first version of this ADR. Rejected because improvements then had no project metadata and could invent fields, and because user-chosen example Stories carry team conventions (Task naming, estimate splits, habitual review steps) that a draft can't get from anywhere else.
- **The Story Learner followed by AI refinement, instead of Story Grounding for drafts.** Rejected. It takes two steps for one intention, it anchors the result to whatever the Story Learner produced, and it sends the same information (Story patterns plus prose) less directly. The Story Learner remains the deterministic way to derive a Template from Stories without AI.
- **A persisted Sensitive AI Context setting.** Rejected. A workspace setting can be committed and silently widen what leaves the machine for every teammate.

## Consequences

- The meaning of `template create --ai --ground` changes for users and is recorded in the Changelog. The flag keeps its name. Story Grounding for drafts moves behind `--from-stories`, and automatic Story selection is removed.
- `GroundingService`'s silent `null` returns become errors the caller can see, so each surface can offer the explicit retry or ungrounded choice.
- Selecting Stories differs by surface only in the UI used. For drafting, the user enters IDs (titles are confirmed before the run). For improving, the list built from the Template's filter is offered, and IDs can be entered as well.
