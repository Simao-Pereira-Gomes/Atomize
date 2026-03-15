# Story Learner

The Story Learner analyzes existing work items with their tasks and generates a reusable Atomize template. This is the fastest way to capture your team's proven task breakdown patterns.

## Table of Contents

- [Overview](#overview)
- [Learn from Multiple Stories](#learn-from-multiple-stories)
- [How Pattern Detection Works](#how-pattern-detection-works)
- [Normalization](#normalization)
- [Output Template](#output-template)
- [Examples](#examples)
- [Tips and Best Practices](#tips-and-best-practices)
- [Troubleshooting](#troubleshooting)

---

## Overview

Instead of building a template from scratch, the Story Learner:

1. Fetches one or more work items that already have child tasks
2. Analyzes task titles, estimations, activities, and tags
3. Detects common patterns across stories (when using multiple stories)
4. Generates a YAML template you can use immediately

This is ideal when your team has a well-established workflow and you want to replicate it consistently.

---

## Learn from Multiple Stories

Use `--from-stories` to analyze multiple stories at once. This produces higher-quality templates because it detects patterns, filters out outliers, and generates confidence scores.

```bash
atomize template create --from-stories STORY-1,STORY-2,STORY-3
```

**With options:**

```bash
atomize template create \
  --from-stories STORY-123,STORY-456,STORY-789 \
  --platform azure-devops \
  --output learned-templates/backend-pattern.yaml
```

### Options

| Option | Description |
|--------|-------------|
| `--from-stories <ids>` | Comma-separated list of story IDs |
| `--platform <name>` | Platform to fetch from |
| `--no-normalize` | Keep original estimation percentages (default normalizes to 100%) |
| `-o, --output <path>` | Where to save the generated template |

### Minimum Requirements

- At least **2 stories** required (3+ recommended for best results)
- Each story must have **at least 1 child task**
- Stories should be similar in type and complexity

---

## How Pattern Detection Works

When analyzing multiple stories, Atomize performs several steps:

### 1. Task Similarity Analysis

Tasks across stories are grouped by similarity. Task titles are compared to identify tasks that represent the same kind of work (e.g., "Design API", "API Design Phase", "Design REST endpoints" are all grouped as "design" tasks).

### 2. Confidence Scoring

Each pattern receives a confidence score based on how consistently it appears across stories:

| Confidence | Meaning | Threshold |
|------------|---------|-----------|
| **High** | Task appears in most stories with consistent estimation | ≥ 70% of stories |
| **Medium** | Task appears in some stories | 40-69% of stories |
| **Low** | Task appears in few stories | < 40% of stories |

Only high and medium confidence patterns are included in the generated template by default.

### 3. Outlier Detection

Stories that are significantly different from the others (e.g., have many more or fewer tasks, or very different estimation ratios) are flagged as outliers. You'll see a report of which stories were considered outliers and why.

### 4. Estimation Averaging

For tasks that appear in multiple stories, the estimation percentage is averaged across all instances (excluding outliers).

### 5. Condition Pattern Detection

If certain tasks only appear when stories have specific tags or properties, Atomize may suggest conditional task logic:

```yaml
tasks:
  - title: "Security Review"
    estimationPercent: 10
    condition: '${story.tags} CONTAINS "security"'  # Suggested based on pattern
```

### 6. Tag Pattern Analysis

Tags that consistently appear on matching stories are incorporated into the template's filter criteria.

---

## Normalization

By default, task percentages are adjusted to sum to exactly 100%. Pass `--no-normalize` to keep the original percentages.

**Without normalization (`--no-normalize`):**
- Original percentages are preserved
- The template may have a total estimation ≠ 100%
- Validation will flag this unless `totalEstimationRange` is configured

**With normalization (default):**
- Percentages are scaled proportionally to sum to 100%
- Remainder is added to the largest task
- Result always validates against `totalEstimationMustBe: 100`

**Example:**

Original tasks: Design 18%, Implementation 45%, Testing 20%, Review 8% = 91%

After normalization:
- Design: 20% (18/91 × 100)
- Implementation: 49% (45/91 × 100)
- Testing: 22% (20/91 × 100)
- Review: 9% (8/91 × 100)

---

## Output Template

The generated template includes:

- **Basic info** — Name and description derived from the analyzed stories
- **Filter criteria** — Based on story types, states, and detected tags
- **Tasks** — One task per detected pattern, with averaged estimation
- **Estimation settings** — Percentage strategy with nearest rounding
- **Metadata** — Notes about the learning process, confidence scores

**Example output:**

```yaml
version: "1.0"
name: "Learned: Backend API Pattern"
description: "Generated from 3 stories (STORY-123, STORY-456, STORY-789)"
author: "Atomize Story Learner"
tags: ["backend", "api", "learned"]

filter:
  workItemTypes: ["User Story"]
  states: ["New", "Active"]
  tags:
    include: ["backend"]
  excludeIfHasTasks: true

tasks:
  - title: "Design API"
    estimationPercent: 18
    activity: "Design"
    # Confidence: high (3/3 stories)

  - title: "Implementation"
    estimationPercent: 47
    activity: "Development"
    # Confidence: high (3/3 stories)

  - title: "Unit Tests"
    estimationPercent: 20
    activity: "Testing"
    # Confidence: high (3/3 stories)

  - title: "Integration Tests"
    estimationPercent: 10
    activity: "Testing"
    # Confidence: medium (2/3 stories)

  - title: "Code Review"
    estimationPercent: 5
    activity: "Documentation"
    # Confidence: high (3/3 stories)

estimation:
  strategy: "percentage"
  rounding: "nearest"
  minimumTaskPoints: 0.5

metadata:
  category: "Learned"
  estimationGuidelines: "Learned from stories with avg estimation of 9.3 points"
```

---

## Examples

### Learn from Multiple Stories

```bash
# Gather your best-structured stories
atomize template create \
  --from-stories STORY-100,STORY-115,STORY-132,STORY-148 \
  --platform azure-devops \
  --output team-templates/backend-standard.yaml

# Validate the result
atomize validate team-templates/backend-standard.yaml --strict --verbose

# Apply to new stories
atomize generate team-templates/backend-standard.yaml
```

---

## Tips and Best Practices

### Choosing Good Source Stories

- Pick stories that were broken down **after sprint planning**, not ad-hoc
- Use stories where the task breakdown was considered **high quality** by your team
- Choose stories of **similar complexity** (similar story point range)
- Use **at least 5 stories** for the most reliable patterns

### Reviewing the Output

After generating, always:

1. **Validate the template:**
   ```bash
   atomize validate my-learned-template.yaml --verbose
   ```

2. **Review the YAML** — the learner may suggest conditions or patterns you want to refine

3. **Test with mock data:**
   ```bash
   atomize generate my-learned-template.yaml --platform mock
   ```

4. **Preview against real data before executing:**
   ```bash
   atomize generate my-learned-template.yaml
   ```

### Improving Generated Templates

After generation, consider:
- Renaming generic task titles to be more specific
- Adding `condition` fields for tasks that don't always apply
- Adding `dependsOn` to enforce task ordering
- Adding `assignTo` patterns appropriate for your team
- Adding `${story.title}` variable interpolation to task titles
- Adjusting the `filter` section to be more or less restrictive

---

## Troubleshooting

### "Story not found"

```
Error: Work item STORY-123 not found
```

- Verify the story ID exists in your project
- Check your platform credentials are configured correctly
- Ensure the story is accessible with your PAT permissions

### "Story has no child tasks"

```
Warning: STORY-123 has no child tasks — cannot learn from it
```

- The selected story must already have child task work items
- Add tasks to the story manually first, then run the learner

### "Not enough stories with tasks"

```
Error: Only 1 of 3 provided stories had child tasks
```

- Check that all provided story IDs have child tasks
- The learner needs stories that already have a task breakdown

### "Low confidence patterns only"

If all detected patterns have low confidence:
- Try providing more stories (5+ recommended)
- Ensure the stories have similar structures
- Check that stories are of the same work item type

### "Generated template has estimation ≠ 100%"

- Use `--no-normalize` to keep original percentages, or let the default normalize them
- Or manually edit the generated YAML to balance estimations

---

## See Also

- [CLI Reference](./Cli-Reference.md) - Full `template create` options
- [Template Reference](./Template-Reference.md) - Template schema for refining output
- [Validation Modes](./Validation-Modes.md) - Validate generated templates
- [Platform Guide](./Platform-Guide.md) - Setting up Azure DevOps credentials
