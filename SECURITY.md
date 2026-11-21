# Security Policy

## Supported versions

Atomize is maintained by a single maintainer, so security fixes go into the **latest release** of each surface only. Please upgrade before reporting.

| Surface | Distributed as | Supported |
|---|---|---|
| CLI | `@sppg2001/atomize` on npm | Latest release |
| VS Code extension | `atomize` on the VS Code Marketplace | Latest release |
| Atomize Studio | Desktop installers on GitHub Releases | Latest release |

## Reporting a vulnerability

**Please do not open a public issue, discussion, or pull request for a security problem.**

Report it privately through GitHub instead:

1. Go to the repository's [**Security** tab](https://github.com/Simao-Pereira-Gomes/Atomize/security).
2. Click **Report a vulnerability**.
3. Describe the issue, the affected surface and version, and steps to reproduce. A proof of concept helps, but is not required.

Only the maintainer can see the report.

## What to expect

- **Acknowledgement** within 7 days.
- **Initial assessment** (confirmed or not, and how severe) within 14 days.
- **Fix and disclosure:** confirmed issues are fixed in a new release, then disclosed in a GitHub Security Advisory. You will be credited unless you would rather not be.

This is a best-effort, volunteer project, so these are targets rather than guarantees. If a report goes unanswered past these windows, a follow-up on the same report is welcome.

## Scope

Examples of what is in scope:

- Exposure of Azure DevOps Personal Access Tokens or other credentials, such as tokens leaking into logs, telemetry, Copilot Grounding, or files outside the OS credential manager.
- Telemetry sending data beyond what the [telemetry documentation](https://atomize-docs.pages.dev/telemetry) describes, or sending anything without consent.
- Code execution, path traversal, or unsafe file writes triggered by a malicious Template or connections file.
- Vulnerabilities in the IPC between Atomize Studio and its sidecar, or in the VS Code extension's webviews.

Out of scope:

- Vulnerabilities in Azure DevOps, GitHub Copilot, or other third-party services themselves. Please report those to their vendors.
- Issues that need an already-compromised machine or user account.
- Credentials a user stores on purpose with the insecure keyfile fallback, which is documented as insecure.
- Vulnerable dependencies with no demonstrated way to exploit them in Atomize. Dependabot already tracks these.
