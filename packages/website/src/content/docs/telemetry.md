---
title: Telemetry and privacy
description: What anonymous usage data Atomize can send, what it never sends, and how to turn it on, off, or delete it.
editUrl: false
---

Atomize can send anonymous usage data to help the maintainer see which actions people use, how they end, and which versions are still in use. It is **off until you turn it on**. Installing or updating Atomize never starts it, and nothing is sent until you make a choice.

You make that choice once, and it applies to the Atomize CLI, the VS Code extension<!-- atomize:feature studio --> and Atomize Studio<!-- /atomize:feature -->. Each tool shows one short, non-blocking invitation after your first successful action. You can also decide at any time with the commands below.

## What is collected

Every event is made only of fixed choices, true or false values, and counts. No field can hold free text.

| Event | When it is sent | Extra properties |
| --- | --- | --- |
| `command_finished` | Once when an action finishes. | The action's own properties, listed below. |
| `session_started` | When the VS Code extension starts<!-- atomize:feature studio --> or Studio launches<!-- /atomize:feature -->. The CLI never sends it. | None |
| `telemetry_enabled` | When you turn telemetry on. | `source` (`command`, `vscode-notification`, `studio`) |
| `telemetry_deletion_requested` | When you request deletion of your data. | None |

Every event also carries these fields, so the data can be grouped by version and tool:

| Field | What it is |
| --- | --- |
| `surface` | Which tool sent it: `cli`, `studio`, or `vscode`. |
| `atomizeVersion` | The version of that tool. |
| `runtimeVersion` | The Node or Bun version it runs on. |
| `os` | Your operating system, as `darwin`, `linux`, `win32`, or `other`. |
| `anonymousId` | The random ID described in [One choice for every tool](#one-choice-for-every-tool). |
| `timestamp` | When the event happened. |

A `command_finished` event adds how the action ended:

| Field | What it is |
| --- | --- |
| `action` | Which action ran, from the list below. |
| `outcome` | How it ended: `success`, `failure`, or `cancelled`. |
| `errorCategory` | On a failure, a coarse category: `auth`, `config`, `platform`, `template`, `ai`, `reference-docs`, `timeout`, or `unknown`. It comes from the kind of error, never from its message. |
| `durationMs` | How long the action took, in milliseconds. |

These are the actions Atomize reports. A Template that fails validation is a successful `validate`, not a failure.

| Action | What it covers | Extra properties |
| --- | --- | --- |
| `generate` | Generating Tasks, as a dry run or live. | `mode` (`dry-run`, `execute`); `output` (`human`, `json`, `json-stream`); `continueOnError` (boolean); `storyCount` (count); `taskCount` (count); `failedStoryCount` (count) |
| `generate.resume` | Finishing Partly Created Stories. | `mode` (`dry-run`, `execute`); `output` (`human`, `json`, `json-stream`); `continueOnError` (boolean); `storyCount` (count); `taskCount` (count); `failedStoryCount` (count) |
| `preview` | Previewing a Template. | `variant` (`render`, `inspect`, `mock-story`, `live`, `resolved`) |
| `validate` | Validating a Template. | `mode` (`offline`, `online`); `valid` (boolean); `issueCount` (count) |
| `template.create` | Creating a Template. | `mode` (`scratch`, `from-existing`, `ai`); `grounded` (boolean); `referenceDocCount` (count) |
| `template.improve` | Asking AI to improve a Template. | `grounded` (boolean); `referenceDocCount` (count) |
| `template.improve.review` | Accepting, saving, or rejecting an improvement. | `decision` (`accepted`, `saved-as-new`, `rejected`) |
| `catalog.list` | Browsing the Catalog. | None |
| `catalog.install` | Installing a Template or Mixin to the Catalog. | `scope` (`user`, `project`) |
| `catalog.remove` | Removing a Template or Mixin from the Catalog. | `scope` (`user`, `project`) |
| `template.resolve` | Showing a Template with its inheritance applied. | None |
| `template.migrate` | Migrating a legacy Catalog. | None |
| `template.metadata` | Reading project metadata for a Template. | None |
| `auth.add` | Adding a Connection Profile. | None |
| `auth.remove` | Removing a Connection Profile. | None |
| `auth.rotate` | Rotating a Connection Profile's token. | None |
| `auth.test` | Testing a Connection Profile. | None |
| `auth.use` | Setting the default Connection Profile. | None |
| `auth.list` | Listing Connection Profiles. | None |
| `fields.list` | Browsing Azure DevOps fields. | None |
| `queries.list` | Browsing saved Azure DevOps queries. | None |
| `schemaReference.open` | Opening the Schema Reference. | None |
| `telemetry.status` | Looking at your telemetry settings. | None |

The `auth` actions record only that you added, removed, rotated, tested, or switched a profile. They never include its name, URL, or token. Turning telemetry off sends nothing.

## What is never collected

- Organization URLs, project or team names, tokens, or any credential.
- Story or Task content, titles, IDs, or field values.
- Template names, file paths, or the contents of Reference Documents.
- Error messages, command arguments, or any other free text.
- Your name, email address, machine name, or IP address.

## Where the data goes

Events are sent to [PostHog](https://posthog.com), in its EU region, which stores and processes them for Atomize. Atomize sends each event directly, without PostHog's browser or app SDKs, so there are no cookies, no local tracking storage, and no autocapture. Your IP address is discarded and not used to look up your location, and events are sent without a person profile.

## One choice for every tool

Your choice and a random **Anonymous ID** live in one file, `~/.atomize/telemetry.json`, that every tool reads. Turning telemetry on in one tool turns it on in all of them, and turning it off in one turns it off everywhere, with no restart.

The Anonymous ID is created when you first turn telemetry on. It is never derived from your machine or account. It is kept when you turn telemetry off, because it is the only way to ask for your data to be deleted. To start over with a new identity, delete the file.

## Turn it on or off

| Tool | Turn it on | Turn it off |
| --- | --- | --- |
| CLI | `atomize telemetry enable` | `atomize telemetry disable` |
| VS Code | **Atomize: Enable Telemetry**, or *Enable* in the one-time notification | **Atomize: Disable Telemetry** |
| <!-- atomize:feature studio -->Studio | **Global Settings › Usage data**, or *Enable* in the one-time banner | **Global Settings › Usage data** |

`atomize telemetry status` and **Atomize: Show Telemetry Status** show your current choice, any environment override, and your Anonymous ID. You can also edit `~/.atomize/telemetry.json` directly.

The VS Code extension also follows VS Code's own telemetry setting. It sends nothing unless VS Code's telemetry level is `all`, so turning VS Code's telemetry down or off always wins, and the extension does not show its invitation while it is off.

## Force it off with an environment variable

Set either variable to force telemetry off, whatever your saved choice. Organizations can use this on every machine and CI agent.

| Variable | Value that turns telemetry off |
| --- | --- |
| `ATOMIZE_TELEMETRY` | `0`, `false`, or `off` |
| `DO_NOT_TRACK` | `1` |

Variables can only turn telemetry off. None of them can turn it on, and they also stop the invitations from appearing.

Apps started from the Dock, Finder, or the Start menu do not inherit variables you set in a shell profile, so a variable in `~/.zshrc` does not reach VS Code<!-- atomize:feature studio --> or Studio<!-- /atomize:feature --> launched that way. Start the app from a terminal, set the variable for your whole session, or turn telemetry off in the app instead.

## How long data is kept

Usage data is kept for up to 12 months. Requests to delete your data are completed within 30 days.

## Request deletion

Deleting needs your Anonymous ID, which any tool can show you.

- **CLI:** `atomize telemetry delete`
- **VS Code:** **Atomize: Request Deletion of Telemetry Data**
- **Studio:** **Global Settings › Usage data › Request deletion** <!-- atomize:feature studio -->
- **By email:** if you have uninstalled Atomize, write to [atomize.project@proton.me](mailto:atomize.project@proton.me) and quote your Anonymous ID.

A deletion request sends one event carrying only your Anonymous ID, then turns telemetry off. It is sent even if telemetry was already off.
