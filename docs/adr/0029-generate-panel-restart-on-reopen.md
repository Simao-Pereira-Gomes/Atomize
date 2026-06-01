# Generate Panel restarts on re-open

The Generate Panel is a singleton, but re-triggering `Atomize: Generate` while the panel is idle always discards the current state and restarts from the profile and story ID prompt — rather than focusing the existing panel.

Most VS Code panels (including the Live Preview Panel) focus when re-triggered. Restarting is the exception. The reason is the story ID input added to the open flow: if re-opening only focused the panel, a previously entered story filter would remain silently active across subsequent Generate runs. In the mid-sprint use case this feature targets (generate for a specific subset of stories), a sticky filter that the user cannot see or clear without closing the panel is a silent footgun. Restarting on re-open keeps the active filter visible and intentional.

If the panel is mid-execution (dry run or live), re-opening focuses without restarting — only idle panels restart.
