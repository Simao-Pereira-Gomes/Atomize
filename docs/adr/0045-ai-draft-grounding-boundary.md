# AI draft grounding uses curated metadata, never credentials

When Atomize Studio generates an AI draft with a selected Work Project Setting, its native backend resolves the Connection Profile's PAT and uses it only to retrieve curated Azure DevOps metadata: work-item types, field names and allowed values, saved-query names, and path names. Atomize sends that metadata and the user's prose to the Copilot-backed AI provider, but never the PAT or a Connection Profile credential; an explicitly ungrounded draft sends neither Azure DevOps metadata nor credentials. This preserves useful project-aware drafting without expanding the AI provider's secret boundary.

## Considered Options

Passing the selected profile or PAT through to the AI provider was rejected because generation needs metadata, not an Azure DevOps credential. Silently omitting unavailable metadata was rejected because it makes a user-selected grounded draft appear more reliable than it is; Studio instead requires an explicit retry or ungrounded choice.
