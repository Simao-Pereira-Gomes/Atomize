---
title: Estimate Tasks
description: Turn a Story Estimate into Task Estimates with conversion, distribution, rounding, unresolvable-estimate policies, and Estimation Field Mapping.
editUrl: false
---

<!-- atomize:include template-estimation -->

<!-- atomize:include platform-task-creation -->

## Look up fields

- [`estimation`](/reference/templates/schema/#template.estimation): every estimation option, with defaults.
- [`estimation.source`](/reference/templates/schema/#template.estimation.source), [`estimation.conversion`](/reference/templates/schema/#template.estimation.conversion), [`estimation.ifParentHasNoEstimation`](/reference/templates/schema/#template.estimation.ifParentHasNoEstimation), [`estimation.targetFields`](/reference/templates/schema/#template.estimation.targetFields), and [`taskType`](/reference/templates/schema/#template.taskType).
- [`tasks[].estimationPercent`](/reference/templates/schema/#template.tasks[].estimationPercent) and [`tasks[].estimationFixed`](/reference/templates/schema/#template.tasks[].estimationFixed).

To change a task's percentage for some Stories, use [conditional estimation](/reference/templates/conditions/#conditional-estimation).
