---
title: Use profiles in scripts and CI
description: Choose a CLI Connection Profile per command, manage several profiles, and create short-lived profiles in CI without exposing tokens.
editUrl: false
---

These steps apply to the CLI. Studio and VS Code ask you to choose a profile in their own interface; see [Set up Connection Profiles](/connections/profiles/).

## Profile resolution order

<!-- atomize:include auth-resolution -->

## Managing multiple profiles

<!-- atomize:include auth-multiple -->

## CI/CD setup

<!-- atomize:include auth-ci -->

## Next steps

Rotate expired tokens with the [rotation steps](/connections/profiles/#rotating-tokens). For connected commands and their options, see [connected generation](https://github.com/Simao-Pereira-Gomes/Atomize/blob/main/docs/Workflows.md#automate-with-the-cli) and the [CLI Reference](https://github.com/Simao-Pereira-Gomes/Atomize/blob/main/docs/Cli-Reference.md).
