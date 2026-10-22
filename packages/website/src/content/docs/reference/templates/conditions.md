---
title: Add conditions
description: Create a task only for matching Stories, or change its estimation percentage, with simple and compound conditions evaluated against each Story.
editUrl: false
---

Conditions are checked against each Story when you preview or generate. They decide whether a task is created and which percentage it receives. They never change the Story.

<!-- atomize:include template-conditional-tasks -->

<!-- atomize:include template-conditional-estimation -->

## Look up fields

- [`tasks[].condition`](/reference/templates/schema/#template.tasks[].condition): simple and compound clauses and their operators.
- [`tasks[].estimationPercentCondition`](/reference/templates/schema/#template.tasks[].estimationPercentCondition): ordered percentage overrides.

Conditions on `estimation` compare the raw Story Estimate. See [Estimate Tasks](/reference/templates/estimation/#estimation-terms) for how it differs from the Task Estimate.
