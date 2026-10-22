---
title: Choose Stories with filters
description: Target the Stories a Template applies to with structured filter criteria, macros, area and iteration paths, or an Azure DevOps saved query.
editUrl: false
---

<!-- atomize:include template-filter -->

## Look up fields

- [`filter`](/reference/templates/schema/#template.filter): every criterion, with its shape and allowed values.
- [`filter.savedQuery`](/reference/templates/schema/#template.filter.savedQuery): a saved query by ID or path.
- [`filter.excludeIfHasTasks`](/reference/templates/schema/#template.filter.excludeIfHasTasks): skip Stories that already have Tasks.

Browse real query paths and field names with [`atomize queries list`](/cli/reference/fields-queries/#queries-list) or the [VS Code browsers](/vscode/project-data/).
