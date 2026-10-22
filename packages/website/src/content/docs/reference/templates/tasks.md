---
title: Define Tasks
description: Write the Tasks a Template creates, with Story data in titles, assignment patterns, custom fields, dependencies, and repeated tasks.
editUrl: false
---

<!-- atomize:include template-tasks -->

<!-- atomize:include template-dependencies -->

## Look up fields

- [`tasks`](/reference/templates/schema/#template.tasks): every task field, with types and constraints.
- [`tasks[].assignTo`](/reference/templates/schema/#template.tasks[].assignTo), [`tasks[].customFields`](/reference/templates/schema/#template.tasks[].customFields), [`tasks[].dependsOn`](/reference/templates/schema/#template.tasks[].dependsOn), and [`tasks[].repeat`](/reference/templates/schema/#template.tasks[].repeat).

To create a task only for some Stories, [add a condition](/reference/templates/conditions/). To size each task, see [Estimate Tasks](/reference/templates/estimation/).
