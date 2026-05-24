# VS Code extension profile management surface

A dedicated `atomize.manageProfiles` command (`Atomize: Manage Profiles`) owns all Connection Profile operations — add, remove, test, rotate, set default. Management is kept out of the Validation Profile Selection picker (ADR-0011) because coupling a management concern into a selection flow creates a confusing boundary; a dedicated command is a cleaner separation.

**Azure DevOps only.** GitHub Models profiles are excluded because the extension has no surface that exercises them (`template create --ai` is CLI-only). GitHub Models profile management remains CLI-only until a `template create` extension surface exists.

**PATs are passed via stdin, never via shell arguments.** The extension spawns the CLI with `shell: false`, writes the PAT to stdin, and closes it. The extension never constructs a shell command containing a PAT and never logs stdin content.

**`auth list --json` is the only profile discovery API.** The extension does not read Atomize connection files or credential storage directly. The CLI is the source of truth for profile state.
