---
title: Compose Templates
description: Inherit a base Template, add reusable Mixin tasks, and inspect the Resolved Template before generating Tasks.
editUrl: false
tableOfContents:
  minHeadingLevel: 2
  maxHeadingLevel: 2
---

Keep your team's shared task breakdowns in one place. Start with a base Template,
add the task groups you need, and inspect the result before generating Tasks.

This guide explains composition behaviour. For field types, requirements, and
defaults, use the [Schema Reference](/reference/templates/schema/).

<!-- atomize:include template-composition -->

## Look up composition fields

- [`extends`](/reference/templates/schema/#template.extends): the base Template to inherit.
- [`mixins`](/reference/templates/schema/#template.mixins): reusable task groups to compose.

A file's own fields are explained in [Template structure](/reference/templates/), [filters](/reference/templates/filter/), [tasks](/reference/templates/tasks/), and [estimation](/reference/templates/estimation/).
