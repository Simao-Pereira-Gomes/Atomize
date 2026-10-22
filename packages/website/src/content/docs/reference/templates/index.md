---
title: Template structure
description: What an Atomize Template contains, how Format Version and Revision identify a file, and how to name files so your editor recognises them.
editUrl: false
---

A Template is a YAML recipe for breaking a Story into Tasks. A Mixin is a reusable group of tasks that Templates can include. This page explains how a file is organised and identified. Use the guides beside it for each part's behaviour, and the [Schema Reference](/reference/templates/schema/) for every field's type, default, and constraints.

<!-- atomize:include template-overview -->

<!-- atomize:include template-file-naming -->

## Continue

- [Choose Stories with filters](/reference/templates/filter/) to target the right work items.
- [Define Tasks](/reference/templates/tasks/), then [add conditions](/reference/templates/conditions/) and [estimate Tasks](/reference/templates/estimation/).
- [Compose Templates](/reference/templates/composition/) from a base Template and Mixins.
- See everything together in the [complete example](/reference/templates/example/).

## Look up fields

- [`formatVersion`](/reference/templates/schema/#template.formatVersion) and [`version`](/reference/templates/schema/#template.version): Format Version and Revision.
- [`name`](/reference/templates/schema/#template.name) and the other Template identity fields, or the [Mixin fields](/reference/templates/schema/#mixin.name).
