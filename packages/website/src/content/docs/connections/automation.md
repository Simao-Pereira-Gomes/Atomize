---
title: Use profiles in scripts and CI
description: Choose a CLI Connection Profile per command, manage several profiles, and create short-lived profiles in CI without exposing tokens.
editUrl: false
---

These steps apply to the CLI. <!-- atomize:feature studio -->Studio and VS Code ask you to choose a profile in their own interface<!-- /atomize:feature --><!-- atomize:feature !studio -->VS Code asks you to choose a profile in its own interface<!-- /atomize:feature -->; see [Set up Connection Profiles](/connections/profiles/).

## Profile resolution order

<!-- atomize:include auth-resolution -->

## Managing multiple profiles

<!-- atomize:include auth-multiple -->

## CI/CD setup

<!-- atomize:include auth-ci -->

## Next steps

Rotate expired tokens with the [rotation steps](/connections/profiles/#rotating-tokens). For machine-readable output, exit codes, and failure handling, see [Automate the CLI](/cli/automation/); every command is in the [CLI reference](/cli/reference/).
