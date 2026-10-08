# Atomize shared domain

Atomize turns work items into task breakdowns using reusable Templates and Platform Adapters.

For surface-specific language, see [CONTEXT-MAP.md](CONTEXT-MAP.md).

## Glossary

**Work Item**:
A platform-tracked planning item that Atomize can read, create, or link.

**Story**:
A Work Item selected as the parent for generated Tasks.

**Task**:
A child Work Item produced from a Template task definition. A definition usually produces one Task, but a repeating definition produces several identical Tasks, each titled with its position.

**Template**:
A YAML-defined task breakdown recipe for matching Stories.

**Story Estimate**:
The size recorded on a Story, in the Story's own unit — points, a t-shirt size, hours, or any other scale the platform process uses.
_Avoid_: "story points" when referring to the Story Estimate generically; points are only one possible unit.

**Task Estimate**:
The effort assigned to a generated Task, in the Task's own unit (typically hours). Derived by converting the Story Estimate and distributing it across Tasks by percentage.

**Estimation Conversion**:
The rule that translates a Story Estimate into the Task's unit before distribution. Either a factor (a numeric multiplier, e.g. 1 point = 4 hours) or a table (a value-by-value mapping, e.g. L = 5 hours, also used for non-linear numeric scales). With no Estimation Conversion the Story Estimate is used one-to-one. A table may opt into multiplier values, where a number in front of a table value scales it (0.3XL = 0.3 × XL). A Story Estimate a table does not cover, exactly or as such a multiple, is never guessed.

**Unresolvable Story Estimate**:
A Story Estimate that is missing or that the Estimation Conversion cannot translate. By default the Story's Tasks are still generated with their Task Estimates left blank (never zero) and a warning is reported; a Template may instead opt to skip the Story entirely or fall back to a default Story Estimate.

**Estimation Field Mapping**:
Which Story field supplies the Story Estimate, which child Work Item type the Tasks are created as, and which Task fields receive the Task Estimate. Each Platform Adapter supplies a default for its platform; a Template may override it using that platform's own field names.

**Template Notes**:
Optional free-form context attached to a Template for its authors and maintainers. Template Notes are distinct from estimation guidelines and from a Task's description.
_Avoid_: using "notes" to refer to Task details.

**Mixin**:
A reusable partial Template that contributes Tasks during composition.

**Template Library**:
The module that owns Template discovery, composition, validation entry points, and persistence across built-in, user, project, file, and remote sources.
_Avoid_: template catalog when referring to the whole library; Catalog is only the named-template inventory.

**Catalog**:
The named inventory of Templates and Mixins available from built-in, user, and project scopes.

**Workspace Root**:
The directory Atomize treats as the boundary for project-scoped state. A Workspace Root may be marked explicitly by an `.atomize` directory or inferred from the surrounding repository when no explicit Atomize marker exists.
_Avoid_: current working directory when referring to project scope.

**Catalog Override**:
A name-collision between two Catalog items of the same kind and stem name. The higher-priority source wins; the losing item is the overridden entry. Shown as `⚠ overrides:` in `atomize template list`.

**Template Lineage**:
A declared provenance relationship between a Template or Mixin and the Catalog item it was derived from, recorded in the `origin` field (`template:<name>` or `mixin:<name>`). Lineage is informational only — it does not affect how refs are resolved and does not shadow the origin item. Shown as `↖ based on:` in `atomize template list`.
_Avoid_: using "override" for lineage; lineage is derivation, not replacement.

**Atomize YAML File**:
Any YAML file authored for Atomize, either a Template or a Mixin.

**Platform Adapter**:
A concrete adapter that lets Atomize read, create, and link Work Items on a work-tracking platform.

**Story Learner**:
The module that derives a reusable Template from existing Stories and their child Tasks.

**Mock Story**:
A user-supplied JSON object of Story field values (using Work Item property names) used to simulate Task generation without a platform connection. Required fields (`id`, `title`, `type`, `state`) are silently defaulted if omitted.

**Mock Preview**:
Offline Task generation evaluated against a Mock Story. Produces a resolved Task list — including skipped conditional Tasks and estimation breakdowns — without querying or creating Work Items on any platform.

**Live Preview**:
Task generation dry-run evaluated against a real Story fetched from a Platform Adapter. Produces a resolved Task list without creating Work Items on any platform.
_Avoid_: "live run" — Live Preview never creates Tasks.

**Connection Profile**:
A named Azure DevOps connection record, with its non-secret fields and default stored in the shared Atomize connections file. The CLI and Atomize Studio both read and write that file and resolve the profile's token through compatible OS credential-manager entries, using their own native credential APIs rather than a shared keychain implementation. Studio supports only OS-keyring-backed tokens: a CLI profile using the optional insecure keyfile fallback must be rotated in Studio before Studio can use it, which converts its token marker to the shared keyring strategy. The first Azure DevOps profile becomes the default, and later default changes are explicit. Legacy GitHub Models records are retained only for explicit user cleanup; they cannot be used as Connection Profiles.
_Avoid_: "auth profile" or "credentials" when referring to a saved named connection; do not use Connection Profile for Copilot sign-in.

**Copilot Session**:
An ephemeral, tool-free GitHub Copilot SDK session Atomize uses to draft a Template with the user's locally signed-in Copilot account. Atomize initiates sign-in interactively when needed but stores neither a Copilot token nor a Copilot Connection Profile. Copilot Sessions use automatic model selection and are discarded after each draft.
_Avoid_: calling this a Connection Profile or a GitHub Models profile.

**Offline Validation**:
Template validation that checks structure only, without connecting to any platform. Runs without credentials and produces results immediately.
_Avoid_: "local validation" or "structural validation" when referring to this mode.

**Online Validation**:
Template validation that connects to Azure DevOps via a named Connection Profile to verify custom field existence, condition field references, and saved query existence — checks that Offline Validation cannot perform.
_Avoid_: "connected validation" or "ADO validation" when referring to this mode.

**Resolved Template**:
The fully composed form of a Template after applying `extends` inheritance and Mixin injections.
_Avoid_: "merged template" or "expanded template".

**Editor Handoff**:
An opt-in CLI action that opens a saved Atomize YAML File in the user's editor after successful creation or installation, while the CLI remains responsible for Template creation, installation, validation, persistence, and Catalog lifecycle.
