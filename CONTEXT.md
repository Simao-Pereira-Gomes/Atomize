# Atomize shared domain

Atomize turns work items into task breakdowns using reusable Templates and Platform Adapters.

For surface-specific language, see [CONTEXT-MAP.md](CONTEXT-MAP.md).

## Glossary

**Work Item**:
A platform-tracked planning item that Atomize can read, create, or link.

**Story**:
A Work Item selected as the parent for generated Tasks.

**Task**:
A child Work Item produced from a Template task definition.

**Template**:
A YAML-defined task breakdown recipe for matching Stories.

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
A named platform connection record (Azure DevOps or GitHub Models), with its non-secret fields and per-platform default stored in the shared Atomize connections file. The CLI and Atomize Studio both read and write that file and resolve the profile's token through compatible OS credential-manager entries, using their own native credential APIs rather than a shared keychain implementation. Studio supports only OS-keyring-backed tokens: a CLI profile using the optional insecure keyfile fallback must be rotated in Studio before Studio can use it, which converts its token marker to the shared keyring strategy. Each platform type has its own independent default profile; the first profile for a platform becomes its default, and later default changes are explicit.
_Avoid_: "auth profile" or "credentials" when referring to a saved named connection.

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
