# Atomize CLI

Atomize CLI turns stories into consistent child tasks using reusable YAML templates. It supports template validation, safe previews, confirmed task generation, connection profile management, template catalog operations, and CI/CD automation.

Atomize is designed around platform adapters. Today, connected generation supports Azure DevOps. Mock is available for offline testing.

## Install

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

Try Atomize without credentials:

```bash
atomize validate template:backend-api
atomize generate template:backend-api --platform mock
```

Connect Azure DevOps:

```bash
atomize auth add work-ado
atomize auth test work-ado
```

Preview and then create tasks:

```bash
# Dry run, no tasks created
atomize generate template:backend-api --profile work-ado

# Create tasks after confirmation
atomize generate template:backend-api --profile work-ado --execute
```

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

## VS Code Extension

Prefer an editor workflow? Atomize also has a VS Code extension for YAML authoring, validation, mock/live preview, profile management, catalog browsing, and confirmed generation.

See the [VS Code Extension Guide](https://github.com/Simao-Pereira-Gomes/atomize/blob/main/docs/VS-Code-Extension.md).

## Documentation

- [Product README](https://github.com/Simao-Pereira-Gomes/atomize#readme) - VS Code-first onboarding and product overview
- [Documentation Index](https://github.com/Simao-Pereira-Gomes/atomize/blob/main/docs/README.md)
- [Workflows](https://github.com/Simao-Pereira-Gomes/atomize/blob/main/docs/Workflows.md)
- [CLI Reference](https://github.com/Simao-Pereira-Gomes/atomize/blob/main/docs/Cli-Reference.md)
- [Template Creation](https://github.com/Simao-Pereira-Gomes/atomize/blob/main/docs/Template-Creation.md)
- [Template Reference](https://github.com/Simao-Pereira-Gomes/atomize/blob/main/docs/Template-Reference.md)
- [Auth Guide](https://github.com/Simao-Pereira-Gomes/atomize/blob/main/docs/Auth-Guide.md)
- [Platform Guide](https://github.com/Simao-Pereira-Gomes/atomize/blob/main/docs/Platform-Guide.md)

## License

MIT
