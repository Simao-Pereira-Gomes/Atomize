# Authentication & Connection Profiles

Atomize manages credentials as named profiles. Instead of passing a token on every command, you save a profile once and reference it by name — or rely on the default for your platform.

## Table of Contents

- [Profile Types](#profile-types)
- [Credential Storage](#credential-storage)
- [Shared Between the CLI and Atomize Studio](#shared-between-the-cli-and-atomize-studio)
- [Quick Setup](#quick-setup)
- [AI Drafting: Copilot Session](#ai-drafting-copilot-session)
- [GitHub Models Retirement](#github-models-retirement)
- [Profile Resolution Order](#profile-resolution-order)
- [Managing Multiple Profiles](#managing-multiple-profiles)
- [CI/CD Setup](#cicd-setup)
- [Rotating Tokens](#rotating-tokens)
- [Troubleshooting](#troubleshooting)

---

## Profile Types

| Type | Used for | Set up with |
|------|----------|-------------|
| **Azure DevOps** | `generate`, `validate`, `fields list`, `queries list` | `atomize auth add` |

Azure DevOps is currently the only Connection Profile type `atomize auth add` creates. AI-assisted template drafting does not use a Connection Profile at all — see [AI Drafting: Copilot Session](#ai-drafting-copilot-session).

---

## Credential Storage

Atomize stores tokens in the most secure available location, trying each tier in order:

| Tier | Storage | When used |
|------|---------|-----------|
| 1 | **OS keychain** — macOS Keychain, Windows Credential Manager, Linux secret service (libsecret) | Default when keychain is available |
| 2 | **Encrypted local file** — AES-256-GCM, stored at `~/.atomize/`, opt-in only | When keychain is unavailable and `--insecure-storage` is passed |
| 3 | **Refuse to persist** | When neither is available and `--insecure-storage` was not passed |

`auth list` shows which tier is in use for each profile: `[keychain]` or `[file]`.

### When the keychain is unavailable

Some environments do not have a working keychain — headless servers, Docker containers, and the Atomize standalone binary (`bun build --compile` cannot load native keychain bindings). In these cases:

- Interactive runs display a warning and ask whether you want to use the local file fallback.
- Non-interactive runs (CI/CD) require `--insecure-storage` to be passed explicitly to `auth add`.

```bash
echo "$AZURE_DEVOPS_PAT" | atomize auth add ci \
  --org-url https://dev.azure.com/myorg \
  --project MyProject \
  --team MyTeam \
  --default \
  --pat-stdin \
  --insecure-storage
```

In CI, prefer injecting the token from your secrets store and creating the profile inside the job workspace — see [CI/CD Setup](#cicd-setup).

---

## Shared Between the CLI and Atomize Studio

Connection Profiles are shared state: the CLI and Atomize Studio both read and write the same `~/.atomize/connections.json` for profile metadata and per-platform defaults, and each resolves the profile's token through its own native OS credential API against the same keychain service/account convention — there is no shared keychain implementation between the two, just a compatible convention.

Atomize Studio supports only **OS-keyring-backed** tokens (storage tier 1 above). A profile created by the CLI using the encrypted-local-file fallback (tier 2, `--insecure-storage`) is not usable from Studio until it is rotated. Rotating a profile — from either the CLI (`atomize auth rotate`) or Studio's own Connection Profile management — always stores the new token in the keyring, so a single rotation converts it to Studio-compatible storage.

The first Azure DevOps profile you create becomes the default; later default changes are explicit. Legacy GitHub Models profile records are visible from both surfaces only for cleanup — see [GitHub Models Retirement](#github-models-retirement) — they are never usable as a Connection Profile from either the CLI or Studio.

---

## Quick Setup

### Local development

```bash
# Azure DevOps profile
atomize auth add work-ado
# → prompted for org URL, project, team, and PAT
# → set as default when prompted

# Verify it works
atomize auth test work-ado

# AI drafting starts the bundled Copilot sign-in flow when needed
atomize template create --ai
```

**Getting a PAT:**
- Azure DevOps: `https://dev.azure.com/{org}/_usersSettings/tokens` — scopes: Work Items (Read, Write)
- GitHub Copilot: an active Copilot subscription; Atomize uses its bundled Copilot runtime and your local sign-in.

### Verify your profiles

```bash
atomize auth list
```

```
  work-ado (Azure DevOps · default)
    URL:      https://dev.azure.com/myorg
    Project:  MyProject
    Team:     MyTeam
    Token:    [keychain]
    Created:  1/3/2026, 10:00:00 AM
```

AI drafting has no profile to list — it authenticates through a Copilot Session instead, described next. A retired `github-models` record, if you still have one, appears in this list only so you can remove it; see [GitHub Models Retirement](#github-models-retirement).

---

## AI Drafting: Copilot Session

`atomize template create --ai` and Atomize Studio's AI draft Starting Path both draft a Template using an ephemeral, tool-free **Copilot Session** — a GitHub Copilot SDK session running with your locally signed-in Copilot account.

- Atomize stores neither a Copilot token nor a Copilot Connection Profile. There is nothing to add, list, rotate, or remove with `atomize auth`.
- Sign-in is interactive: Atomize initiates it when needed for an interactive run. A non-interactive run (a script, a CI job) requires Copilot to already be signed in on that machine — Atomize cannot complete an interactive sign-in there.
- Each session uses automatic model selection and is discarded after the draft completes; nothing persists between drafts.
- An active GitHub Copilot subscription is required.

A Copilot Session is not a Connection Profile: it never appears in `atomize auth list`, has no default, and is unrelated to the Azure DevOps profile resolution below.

---

## GitHub Models Retirement

GitHub fully retired GitHub Models — including its inference API and BYOK endpoints — on 30 July 2026. Atomize no longer treats GitHub Models as an AI Connection Profile:

- `atomize auth add` no longer offers a GitHub Models platform choice — only Azure DevOps profiles can be created.
- `atomize auth rotate` refuses a `github-models` profile and points you to remove it instead.
- Existing `github-models` records remain visible in `atomize auth list` only so you can clean them up with `atomize auth remove <name>`. They cannot be used for anything.

AI template drafting now authenticates through a [Copilot Session](#ai-drafting-copilot-session) instead.

---

## Profile Resolution Order

When an Azure DevOps command needs credentials, Atomize resolves them in this order:

1. `--profile <name>` flag on the command
2. `ATOMIZE_PROFILE` environment variable
3. Default ADO profile (set via `atomize auth use`)
4. `ATOMIZE_PAT` environment variable (legacy, no profile needed)
5. Interactive prompt

This order applies to `generate`, `validate`, `fields list`, and `queries list`. AI drafting does not use profile resolution — see [AI Drafting: Copilot Session](#ai-drafting-copilot-session).

If resolution fails and the session is interactive, Atomize prompts for credentials and offers to save a new profile.

---

## Managing Multiple Profiles

You can have as many profiles as you need — one per organization, project, or environment.

```bash
# Two ADO profiles — personal and work
atomize auth add personal --org-url https://dev.azure.com/personal-org ...
atomize auth add work     --org-url https://dev.azure.com/work-org ...

# Switch between them per-run
atomize generate template:backend-api --profile personal
atomize generate template:backend-api --profile work

# Or change the default
atomize auth use work
```

### Switching the default

```bash
atomize auth use              # pick interactively
atomize auth use work-ado     # set by name
```

Azure DevOps is currently the only profile type with a default to set.

### Removing a profile

```bash
atomize auth remove old-profile
atomize auth rm old-profile   # alias
```

If the removed profile was the default for its platform, Atomize prompts you to assign a new default.

---

## CI/CD Setup

For automated environments, inject the PAT via stdin and create a short-lived profile in the job workspace.

```yaml
- name: Generate Tasks
  env:
    AZURE_DEVOPS_PAT: ${{ secrets.AZURE_DEVOPS_PAT }}
  run: |
    echo "$AZURE_DEVOPS_PAT" | atomize auth add ci \
      --org-url "${{ secrets.AZURE_DEVOPS_ORG_URL }}" \
      --project "${{ secrets.AZURE_DEVOPS_PROJECT }}" \
      --team "${{ secrets.AZURE_DEVOPS_TEAM }}" \
      --default \
      --pat-stdin \
      --insecure-storage

    atomize generate template:backend-api \
      --execute \
      --auto-approve \
      --continue-on-error
```

**Why `--pat-stdin`?** Passing the token as a flag (`--pat abc123`) risks it appearing in process listings (`ps aux`) or shell history. Reading from stdin keeps it out of both.

If your runner has a working OS keychain, you can omit `--insecure-storage`. On headless runners, the flag explicitly opts into Atomize's local encrypted file fallback for that job.

You can also provide the PAT through `ATOMIZE_PAT` while still creating a profile:

```yaml
- name: Generate Tasks
  env:
    ATOMIZE_PAT: ${{ secrets.AZURE_DEVOPS_PAT }}
  run: |
    atomize auth add ci \
      --org-url "${{ secrets.AZURE_DEVOPS_ORG_URL }}" \
      --project "${{ secrets.AZURE_DEVOPS_PROJECT }}" \
      --team "${{ secrets.AZURE_DEVOPS_TEAM }}" \
      --default \
      --insecure-storage

    atomize generate template:backend-api --execute --auto-approve
```

---

## Rotating Tokens

When a PAT expires, update it in place without removing the profile:

```bash
atomize auth rotate work-ado
# → prompted for the new token
# → replaces the stored token; all other profile settings are preserved
```

For non-interactive callers, pipe the new PAT through stdin:

```bash
echo "$NEW_PAT" | atomize auth rotate work-ado --pat-stdin
```

After rotating, verify the connection:

```bash
atomize auth test work-ado
```

---

## Troubleshooting

### "No default profile found"

You have not set a default profile for this platform. Either pass `--profile <name>` explicitly or run:

```bash
atomize auth use
```

### "Authentication failed: 401 Unauthorized"

- The PAT has expired — rotate it: `atomize auth rotate <name>`
- The PAT does not have the required scopes (Work Items Read/Write)
- The org URL, project, or team name is wrong — remove the profile and re-add it

### "Keychain unavailable"

The OS keychain could not be accessed. Options:
- Re-run with `--insecure-storage` to fall back to an encrypted local file
- Use environment variables (`ATOMIZE_PAT`) and skip persistent storage

### "Profile not found: <name>"

The profile name does not match any saved profile. Run `atomize auth list` to see exact names.

### Token visible in process list

Always use `--pat-stdin` or environment variables in CI — never pass the token as a flag argument.

### "AI drafting requires Copilot sign-in" / a non-interactive AI draft fails

Non-interactive runs (scripts, CI) need GitHub Copilot already signed in on that machine — Atomize cannot complete an interactive sign-in flow there. Sign in once interactively (e.g. `atomize template create --ai`), then re-run. See [AI Drafting: Copilot Session](#ai-drafting-copilot-session).

### `atomize auth rotate` refuses my GitHub Models profile

GitHub Models is retired and the profile is inert — it can no longer be used for anything. Remove it with `atomize auth remove <name>`. AI drafting no longer uses Connection Profiles; see [GitHub Models Retirement](#github-models-retirement).
