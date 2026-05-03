# Authentication & Connection Profiles

Atomize manages credentials as named profiles. Instead of passing a token on every command, you save a profile once and reference it by name — or rely on the default for your platform.

## Table of Contents

- [Profile Types](#profile-types)
- [Credential Storage](#credential-storage)
- [Quick Setup](#quick-setup)
- [Profile Resolution Order](#profile-resolution-order)
- [Managing Multiple Profiles](#managing-multiple-profiles)
- [CI/CD Setup](#cicd-setup)
- [Rotating Tokens](#rotating-tokens)
- [Troubleshooting](#troubleshooting)

---

## Profile Types

| Type | Used for | Set up with |
|------|----------|-------------|
| **Azure DevOps** | `generate`, `validate`, `fields list`, `queries list` | `atomize auth add` → select Azure DevOps |
| **GitHub Models** | AI-assisted template generation (`template create --ai`) | `atomize auth add` → select GitHub Models |

Each type has its own independent default. You can have a default ADO profile and a default GitHub Models profile at the same time — they do not conflict.

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

## Quick Setup

### Local development

```bash
# Azure DevOps profile
atomize auth add work-ado
# → prompted for org URL, project, team, and PAT
# → set as default when prompted

# Verify it works
atomize auth test work-ado

# GitHub Models profile (only needed for template create --ai)
atomize auth add my-ai
# → prompted for a GitHub PAT with models:read scope
atomize auth test my-ai
```

**Getting a PAT:**
- Azure DevOps: `https://dev.azure.com/{org}/_usersSettings/tokens` — scopes: Work Items (Read, Write)
- GitHub Models: `https://github.com/settings/tokens` — scope: `models:read` (under Models)

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

  my-ai (GitHub Models (AI) · default)
    Token:    [keychain]
    Created:  1/3/2026, 10:05:00 AM
```

---

## Profile Resolution Order

When a command needs credentials, Atomize resolves them in this order:

**For ADO commands** (`generate`, `validate`, `fields list`, `queries list`):

1. `--profile <name>` flag on the command
2. `ATOMIZE_PROFILE` environment variable
3. Default ADO profile (set via `atomize auth use`)
4. `ATOMIZE_PAT` environment variable (legacy, no profile needed)
5. Interactive prompt

**For AI commands** (`template create --ai`):

1. `--ai-profile <name>` flag
2. `ATOMIZE_AI_PROFILE` environment variable
3. Default GitHub Models profile (set via `atomize auth use`)

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

Each platform type has its own default. Changing the ADO default does not affect the GitHub Models default.

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
- The PAT does not have the required scopes (Work Items Read/Write for ADO, `models:read` for GitHub Models)
- The org URL, project, or team name is wrong — remove the profile and re-add it

### "Keychain unavailable"

The OS keychain could not be accessed. Options:
- Re-run with `--insecure-storage` to fall back to an encrypted local file
- Use environment variables (`ATOMIZE_PAT`) and skip persistent storage

### "Profile not found: <name>"

The profile name does not match any saved profile. Run `atomize auth list` to see exact names.

### Token visible in process list

Always use `--pat-stdin` or environment variables in CI — never pass the token as a flag argument.
