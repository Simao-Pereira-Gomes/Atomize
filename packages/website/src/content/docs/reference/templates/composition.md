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
defaults, use the [Schema Reference](/schema).

<!-- atomize:include template-composition -->

## Look up composition fields

- [`extends`](/schema#template.extends): the base Template to inherit.
- [`mixins`](/schema#template.mixins): reusable task groups to compose.

Read the [complete Template Reference](https://github.com/Simao-Pereira-Gomes/Atomize/blob/main/docs/Template-Reference.md)
for the behaviours that have not yet moved into focused portal pages.
