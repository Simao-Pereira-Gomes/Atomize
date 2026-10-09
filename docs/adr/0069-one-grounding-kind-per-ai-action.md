# Each AI action has one kind of Grounding: Project Grounding for drafting, Story Grounding for improving

Before this decision, "grounded draft" meant different things on different surfaces. Atomize Studio grounded drafts in project metadata, following ADR-0045. The CLI's `template create --ai --ground` instead ran the Story Learner over about ten recent Stories, picked without regard to what the user was drafting, and if that failed it quietly continued ungrounded. The decision is that **drafting always uses Project Grounding and Template Improvement always uses Story Grounding**, on every surface. The CLI's draft moves to Project Grounding, and Story Grounding moves to `template improve --from-stories`.

Each kind of data does a different job. When drafting, the AI's typical mistakes are field names it invented, allowed values that don't exist and saved query paths that can't be found, and Project Grounding fixes exactly those. Story patterns taken from unrelated recent Stories add noise, and deriving a Template from Stories is already the Story Learner's job (`template create --from-stories`). When improving, Stories the Template was actually applied to are the strongest signal there is, because they show the Tasks the Template generated next to how people then edited them. To compare like with like, the improvement is judged against the Resolved Template.

Grounding is always the user's explicit choice and never disappears silently. Interactive runs that fail to retrieve Grounding offer Retry, Continue ungrounded or Cancel. Non-interactive runs exit with an error. Leaving out a grounding flag in a non-interactive run counts as choosing an Ungrounded Draft. Story Grounding excludes Sensitive AI Context unless the user opts in for that run, and that opt-in is never saved as a preference.

## Considered Options

- **Keep Story Grounding for CLI drafts and accept the difference between surfaces.** Rejected. The AI release reworks the CLI's AI flow anyway, and shipping two meanings of "grounded draft" would contradict the shared glossary.
- **Offer both kinds of Grounding for both actions.** Rejected as unnecessary choice. Neither combination solves a problem the matching kind doesn't already solve better.
- **Make Sensitive AI Context a persisted setting.** Rejected. A workspace setting can be committed and silently widen what leaves the machine for every teammate.

## Consequences

- This is a user-facing change in behaviour for `template create --ai --ground` and is recorded in the Changelog. The flag keeps its name. The prompt for Story IDs moves from the draft flow to the improve flow.
- `GroundingService`'s silent `null` returns must become errors the caller can see, so each surface can offer the explicit retry or ungrounded choice.
- Story Grounding's Story list uses the Template's own filter with `excludeIfHasTasks` turned off and keeps only Stories that already have Tasks, because the Stories worth learning from are the ones the Template has already been applied to.
