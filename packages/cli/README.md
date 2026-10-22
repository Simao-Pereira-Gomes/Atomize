# Atomize CLI

**Break down stories, build up velocity.**

Atomize turns Stories into consistent child Tasks using reusable YAML Templates. Capture your team's task breakdown once, then validate, preview, and reuse it from your terminal or CI/CD pipeline.

- Try built-in Templates offline with Mock Stories.
- Customize task titles, descriptions, conditions, dependencies, and estimation rules in YAML.
- Reuse Templates and Mixins from built-in, user, and project Catalogs.
- Draft and improve Templates with your GitHub Copilot account.
- Preview real Azure DevOps Stories before confirming task creation.

Connected generation currently supports **Azure DevOps**. Offline Validation and Mock Preview require no platform account or Connection Profile.

[Website and documentation](https://atomize-docs.pages.dev/) · [CLI quickstart](https://atomize-docs.pages.dev/getting-started/cli/) · [Source and issues](https://github.com/Simao-Pereira-Gomes/atomize)

## Install

Requires [Node.js](https://nodejs.org/) **22 or later** and npm.

```bash
npm install -g @sppg2001/atomize
```

Verify the install:

```bash
atomize --version
atomize --help
```

You can also run without installing globally:

```bash
npx @sppg2001/atomize --help
```

## Quick Start

### Try it offline

The `backend-api` Template ships with the CLI. Validate it, then preview a task breakdown using a Mock Story:

```bash
atomize validate template:backend-api
atomize preview template:backend-api \
  --mock-story '{"id":"123","title":"Add password reset","estimation":8}'
```

The preview returns three Tasks: define API behavior, implement the change, and verify it. The example Template converts the Story Estimate of 8 into a 32-hour budget and splits it 20% / 50% / 30%. Change the title or estimate and run it again to see the breakdown change. No Work Items are created.

### Connect Azure DevOps

Add a Connection Profile using an Azure DevOps PAT with **Work Items read/write** access:

```bash
atomize auth add work-ado
atomize auth test work-ado
```

Preview real Stories, then create Tasks after reviewing the plan:

```bash
# Dry run, no tasks created
atomize generate template:backend-api --profile work-ado

# Create tasks after confirmation
atomize generate template:backend-api --profile work-ado --execute
```

Use `--story 123 456` to select specific Stories. See the [Auth Guide](https://atomize-docs.pages.dev/connections/profiles/) for PAT permissions, credential storage, and profile setup.

## Safety Model

`atomize generate` is a dry run by default. It calculates the task plan but does not create tasks.

| Command | Creates tasks |
|---|---:|
| `atomize validate ...` | No |
| `atomize preview ...` | No |
| `atomize generate ...` | No |
| `atomize generate ... --platform mock` | No |
| `atomize generate ... --execute` | Yes, after confirmation |
| `atomize generate ... --execute --auto-approve` | Yes |

Use `--auto-approve` only in non-interactive automation where task creation is intentional.

## Common Commands

```bash
# Validate templates
atomize validate template:backend-api
atomize validate ./templates/backend.atomize.yaml --strict

# Inspect required story fields
atomize preview template:backend-api --inspect

# Preview with mock data
atomize preview template:backend-api \
  --mock-story '{"id":"123","title":"Add password reset","estimation":8}'

# Generate from catalog or file templates
atomize generate template:backend-api
atomize generate ./templates/backend.atomize.yaml --profile work-ado

# Target specific stories
atomize generate template:backend-api --profile work-ado --story 123 456

# Manage profiles
atomize auth list
atomize auth add work-ado
atomize auth test work-ado
atomize auth rotate work-ado

# Manage templates
atomize template list
atomize template create --from backend-api
atomize template create --scratch
atomize template install ./templates/team-template.atomize.yaml --scope project
atomize template resolve template:my-template --validate

# Browse Azure DevOps metadata
atomize fields list --type Task
atomize queries list
```

## AI-Assisted Authoring

Use your signed-in GitHub Copilot account to draft a Template from prose or review a proposed improvement to an existing one:

```bash
atomize template create --ai
atomize template improve template:backend-api

# Draft with your team's written process as reference material
atomize template create --ai --reference docs/how-we-work.md
```

AI authoring uses a separate Copilot Session; it does not require an Azure DevOps Connection Profile. You can explicitly add project context with `--ground --profile work-ado`. See [AI authoring](https://atomize-docs.pages.dev/cli/ai/) for sign-in, Reference Documents, and review workflows.

## CI/CD

Validate first, then run live generation with explicit acknowledgement:

```yaml
- name: Install Atomize
  run: npm install -g @sppg2001/atomize

- name: Validate template
  run: atomize validate template:backend-api --strict --quiet

- name: Configure profile
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

- name: Generate tasks
  run: |
    atomize generate template:backend-api \
      --execute \
      --auto-approve \
      --output report.json
```

## Desktop and Editor Workflows

- **[Atomize Studio](https://github.com/Simao-Pereira-Gomes/atomize/blob/main/docs/Atomize-Studio.md)** is a standalone desktop app for visual Template authoring, Catalog management, and confirmed task generation. Download an installer via [Studio Releases](https://github.com/Simao-Pereira-Gomes/atomize/blob/main/docs/Studio-Releases.md).
- **[VS Code extension](https://atomize-docs.pages.dev/getting-started/vscode/)** provides YAML completions, schema hovers, diagnostics, Mock and Live Preview, and confirmed generation in your editor.

The CLI and Studio share Connection Profile metadata and compatible OS-keyring-backed tokens. VS Code manages its own profiles. See the [Auth Guide](https://atomize-docs.pages.dev/connections/profiles/#shared-between-the-cli-and-atomize-studio) for details.

## Documentation

- [Website and Documentation](https://atomize-docs.pages.dev/)
- [Workflows](https://atomize-docs.pages.dev/workflows/)
- [CLI Reference](https://atomize-docs.pages.dev/cli/reference/)
- [Template Creation](https://atomize-docs.pages.dev/catalog/create/)
- [Schema Reference](https://atomize-docs.pages.dev/reference/templates/schema/)
- [Template Reference](https://atomize-docs.pages.dev/reference/templates/)
- [Auth Guide](https://atomize-docs.pages.dev/connections/profiles/)
- [Platform Guide](https://atomize-docs.pages.dev/connections/)

## License

MIT
