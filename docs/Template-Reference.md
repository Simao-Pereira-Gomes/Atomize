# Platform Guide

Setup and configuration guide for different work item management platforms.

## Table of Contents

- [Overview](#overview)
- [Azure DevOps](#azure-devops)
- [Mock Platform](#mock-platform)
- [Adding New Platforms](#adding-new-platforms)

---

## Overview

Atomize supports multiple work item management platforms through a unified adapter interface. Currently supported:

| Platform | Status | Features |
|----------|--------|----------|
| Azure DevOps | ✅ Production | Full support with WIQL queries |
| Mock | ✅ Production | Testing and development |
| Jira | 🚧 Planned | Coming soon |
| GitHub Issues | 🚧 Planned | Coming soon |

---

## Azure DevOps

Complete setup guide for Azure DevOps Services.

### Prerequisites

- Azure DevOps organization and project
- Personal Access Token (PAT) with Work Items permissions
- Node.js 18+ or Bun runtime

### Quick Start

1. **Get your organization URL and project name**

   Your Azure DevOps URL looks like:
   ```
   https://dev.azure.com/{organization}
   ```
   
   Example: `https://dev.azure.com/contoso`

2. **Create a Personal Access Token (PAT)**

   - Go to `https://dev.azure.com/{organization}/_usersSettings/tokens`
   - Click "New Token"
   - Set scopes: **Work Items (Read, Write)**
   - Copy the token (you won't see it again!)

3. **Configure environment variables**

   ```bash
   # Create .env file
   cat > .env << EOF
   AZURE_DEVOPS_ORG_URL=https://dev.azure.com/yourorg
   AZURE_DEVOPS_PROJECT=YourProject
   AZURE_DEVOPS_PAT=your-token-here
   AZURE_DEVOPS_TEAM=YourTeam  # Optional
   EOF
   ```

4. **Test connection**

   ```bash
   atomize generate templates/backend-api.yaml --dry-run
   ```

### Configuration Options

#### Option 1: Environment Variables (Recommended)

```bash
# Required
export AZURE_DEVOPS_ORG_URL="https://dev.azure.com/myorg"
export AZURE_DEVOPS_PROJECT="MyProject"
export AZURE_DEVOPS_PAT="your-pat-token"

# Optional
export AZURE_DEVOPS_TEAM="MyTeam"
export AZURE_DEVOPS_API_VERSION="7.0"
```

#### Option 2: .env File

```bash
# .env
AZURE_DEVOPS_ORG_URL=https://dev.azure.com/myorg
AZURE_DEVOPS_PROJECT=MyProject
AZURE_DEVOPS_PAT=your-pat-token
AZURE_DEVOPS_TEAM=MyTeam
```

#### Option 3: Interactive Prompts

```bash
atomize generate templates/backend-api.yaml

# You'll be prompted:
# ✔ Load Azure DevOps configuration from environment variables? (Y/n)
# If you select "no", you'll enter configuration manually
```

### PAT Permissions

Your Personal Access Token needs these scopes:

| Scope | Access Level | Required |
|-------|--------------|----------|
| Work Items | Read | ✅ Yes |
| Work Items | Write | ✅ Yes |
| Project and Team | Read | ⚪ Optional |

**Minimum permissions:**
- Read work items
- Write work items
- Create work item links

### Azure DevOps Concepts

#### Work Item Types

Default Azure DevOps work item types:

```yaml
filter:
  workItemTypes:
    - "User Story"           # Scrum
    - "Product Backlog Item" # Agile
    - "Bug"
    - "Task"
    - "Epic"
    - "Feature"
```

#### States

Common work item states:

```yaml
filter:
  states:
    - "New"        # Just created
    - "Active"     # In progress
    - "Resolved"   # Completed, awaiting verification
    - "Closed"     # Verified and done
    - "Removed"    # Cancelled
```

#### Area Paths

Organize work items by product area:

```yaml
filter:
  areaPaths:
    - "MyProject\\Backend"
    - "MyProject\\Frontend"
    - "MyProject\\Infrastructure"
```

#### Iteration Paths

Organize work items by sprint/iteration:

```yaml
filter:
  iterations:
    - "MyProject\\Sprint 23"
    - "MyProject\\Sprint 24"
```

### WIQL Queries

Azure DevOps uses Work Item Query Language (WIQL) for filtering.

**Basic query structure:**
```sql
SELECT [System.Id] 
FROM WorkItems 
WHERE [System.TeamProject] = 'MyProject'
  AND [System.WorkItemType] = 'User Story'
  AND [System.State] = 'New'
```

**Template filter to WIQL:**

Template:
```yaml
filter:
  workItemTypes: ["User Story"]
  states: ["New", "Active"]
  tags:
    include: ["backend"]
```

Generated WIQL:
```sql
SELECT [System.Id] 
FROM WorkItems 
WHERE [System.TeamProject] = 'MyProject'
  AND [System.WorkItemType] IN ('User Story')
  AND [System.State] IN ('New', 'Active')
  AND [System.Tags] CONTAINS 'backend'
```

**Custom WIQL queries:**

```yaml
filter:
  customQuery: |
    SELECT [System.Id] 
    FROM WorkItems 
    WHERE [System.TeamProject] = 'MyProject'
      AND [System.WorkItemType] = 'User Story'
      AND [System.State] IN ('New', 'Active')
      AND [Custom.Team] = 'Platform Engineering'
      AND [Microsoft.VSTS.Common.Priority] <= 2
      AND [System.Tags] CONTAINS 'backend'
```

### Custom Fields

Azure DevOps supports custom fields for work items.

**Common custom fields:**

```yaml
filter:
  customFields:
    - field: "Custom.Team"
      operator: "equals"
      value: "Platform Engineering"
    
    - field: "Custom.Complexity"
      operator: "greaterThan"
      value: 3
    
    - field: "Microsoft.VSTS.Common.Priority"
      operator: "lessThan"
      value: 3
```

**Field reference format:**
- System fields: `System.FieldName` (e.g., `System.State`)
- Microsoft fields: `Microsoft.VSTS.*.FieldName`
- Custom fields: `Custom.FieldName`

**Common system fields:**
- `System.Id` - Work item ID
- `System.Title` - Title
- `System.State` - Current state
- `System.WorkItemType` - Type
- `System.AssignedTo` - Assigned user
- `System.Tags` - Tags (semicolon-separated)
- `System.AreaPath` - Area path
- `System.IterationPath` - Iteration path
- `System.CreatedDate` - Creation date
- `System.ChangedDate` - Last modified date

**Common Microsoft fields:**
- `Microsoft.VSTS.Scheduling.StoryPoints` - Story points
- `Microsoft.VSTS.Scheduling.RemainingWork` - Remaining work (hours)
- `Microsoft.VSTS.Common.Priority` - Priority (1-5)
- `Microsoft.VSTS.Common.Activity` - Activity type
- `Microsoft.VSTS.Common.BacklogPriority` - Backlog priority

### Task Creation

When creating tasks, Atomize sets these fields:

```yaml
# Task definition
tasks:
  - title: "Implement API"
    description: "Implementation details"
    estimationPercent: 40
    tags: ["backend", "api"]
    activity: "Development"
    assignTo: "john@company.com"
    priority: 2
    remainingWork: 16
```

Maps to Azure DevOps fields:
- `System.Title` ← title
- `System.Description` ← description
- `Microsoft.VSTS.Scheduling.RemainingWork` ← estimationPercent * story points
- `System.Tags` ← tags (joined with "; ")
- `Microsoft.VSTS.Common.Activity` ← activity
- `System.AssignedTo` ← assignTo
- `Microsoft.VSTS.Common.Priority` ← priority

### Troubleshooting

#### Authentication Failures

**Problem:** `Authentication failed: 401 Unauthorized`

**Solutions:**
1. Verify PAT hasn't expired
2. Check PAT has correct scopes (Work Items Read/Write)
3. Verify organization URL format: `https://dev.azure.com/org`
4. Don't include project in organization URL

#### No Work Items Found

**Problem:** `Found 0 stories matching filter criteria`

**Solutions:**
1. Check work item types match your project's process template
2. Verify states exist in your project
3. Check area/iteration paths are correct (case-sensitive)
4. Test with mock platform first:
   ```bash
   atomize generate templates/backend-api.yaml --platform mock --dry-run
   ```

#### Permission Errors

**Problem:** `Failed to create task: Access Denied`

**Solutions:**
1. Verify PAT has Write permissions
2. Check project permissions (Project Contributor role)
3. Verify you can create work items manually in the web UI

#### Connection Timeouts

**Problem:** `Request timeout` or `ECONNRESET`

**Solutions:**
1. Check network connectivity
2. Verify organization URL is accessible
3. Check if behind corporate proxy (configure proxy settings)
4. Try with increased timeout

---

## Mock Platform

The mock platform provides sample data for testing and development.

### Usage

```bash
atomize generate templates/backend-api.yaml \
  --platform mock \
  --dry-run
```

### Features

- No configuration required
- Sample user stories with various states and tags
- Simulated network delays
- 
### Sample Data

The mock platform includes 7 sample stories:

```
STORY-001: Implement user authentication API
  State: New, Tags: backend, api, security
  Estimation: 8 points

STORY-002: Create user profile dashboard
  State: Active, Tags: frontend, react, ui
  Estimation: 5 points

STORY-003: Implement payment processing
  State: New, Tags: backend, api, payment
  Estimation: 13 points

STORY-004: Add search functionality
  State: Approved, Tags: fullstack, search, api, frontend
  Estimation: 8 points

STORY-005: Optimize database queries
  State: New, Tags: backend, database, performance
  Estimation: 3 points

STORY-006: Mobile responsive design
  State: New, Tags: frontend, mobile, css
  Estimation: 5 points

STORY-007: Implement data export feature
  State: Active, Tags: backend, api, export
  Estimation: 8 points (has 1 existing task)
```

### Testing Workflows

**1. Template Development:**
```bash
# Create template
atomize template create --scratch -o test-template.yaml

# Test with mock data
atomize generate test-template.yaml --platform mock --dry-run

# Iterate until satisfied
```

**2. Filter Testing:**
```bash
# Test different filters
atomize generate test-template.yaml --platform mock --dry-run

# Check which stories match
# Adjust filter criteria
# Repeat
```

**3. CI/CD Testing:**
```yaml
# .github/workflows/test.yml
- name: Test Templates
  run: |
    for template in templates/*.yaml; do
      atomize validate "$template"
      atomize generate "$template" --platform mock --dry-run
    done
```

---


### Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines on submitting new platform adapters.

---

## Platform Comparison

| Feature | Azure DevOps | Mock | Jira | GitHub |
|---------|--------------|------|------|--------|
| Authentication | PAT | None | API Token | PAT |
| Work Items | ✅ | ✅ | 🚧 | 🚧 |
| Custom Fields | ✅ | ✅ | 🚧 | 🚧 |
| Bulk Creation | ✅ | ✅ | 🚧 | 🚧 |
| Work Item Links | ✅ | ✅ | 🚧 | 🚧 |
| Query Language | WIQL | Simple | JQL | - |
| Real-time | ✅ | ✅ | 🚧 | 🚧 |

---

## See Also

- [CLI Reference](./Cli-Reference.md) - Command-line usage
- [Template Reference](./Template-Reference.md) - Template schema
- [Examples](../templates/) - Real-world examples