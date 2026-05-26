# VS Code extension capability-oriented source layout

The VS Code extension source should be organized by extension capability and user workflow rather than by technical file kind. Preview, Generate, Validation, Profile Management, Catalog Browser, platform metadata browsing, CLI support, and authoring support each get ownership-oriented areas, while `extension.ts` remains the activation composition root for the initial restructuring.

This favors the domain language already used by the extension over generic folders such as `commands`, `panels`, and `providers`. Mock Preview and Live Preview stay together as non-mutating preview flows, Generate remains separate because it can create Tasks, and Catalog Browser remains separate from Field Browser and Query Browser because they browse different domains. Imports stay explicit and relative, and tests remain centralized for the first pass to keep the change focused on source ownership rather than test layout or module-resolution policy.
