import { settings } from "@clack/prompts";

/** The exit code a shell gives a process ended by SIGINT. */
const SIGINT_EXIT_CODE = 130;

type KeypressSource = {
  on(event: "keypress", listener: (text: string, key?: { ctrl?: boolean; name?: string }) => void): unknown;
  off(event: "keypress", listener: (text: string, key?: { ctrl?: boolean; name?: string }) => void): unknown;
};

/**
 * Runs `run` with a signal that the first Ctrl+C aborts, so the run can stop starting new work and
 * still report what it did. A second Ctrl+C exits at once. Everything is undone when `run` settles,
 * so Ctrl+C outside it keeps its usual meaning.
 *
 * Ctrl+C reaches the process two ways. Without a terminal it is a SIGINT. While Clack's spinner or
 * progress bar is showing, the terminal is in raw mode and Ctrl+C is a keypress, which Clack answers
 * itself with `process.exit(0)`: no report, and an exit code that says the run succeeded. So for the
 * run Clack's cancel keys (Ctrl+C, Escape) are taken away from it and the keypress is handled here.
 */
export async function stopOnInterrupt<T>(
  run: (signal: AbortSignal) => Promise<T>,
  onFirstInterrupt: () => void,
  deps: { input?: KeypressSource } = {},
): Promise<T> {
  const input = deps.input ?? process.stdin;
  const controller = new AbortController();
  const onInterrupt = () => {
    if (controller.signal.aborted) process.exit(SIGINT_EXIT_CODE);
    controller.abort();
    onFirstInterrupt();
  };
  const onKeypress = (_text: string, key?: { ctrl?: boolean; name?: string }) => {
    if (key?.ctrl && key.name === "c") onInterrupt();
  };
  const restoreCancelKeys = suspendClackCancelKeys();
  process.on("SIGINT", onInterrupt);
  input.on("keypress", onKeypress);
  try {
    return await run(controller.signal);
  } finally {
    process.removeListener("SIGINT", onInterrupt);
    input.off("keypress", onKeypress);
    restoreCancelKeys();
  }
}

/** Removes the keys Clack treats as cancel (and exits on mid-spinner), returning a function that puts them back. */
function suspendClackCancelKeys(): () => void {
  const removed = [...settings.aliases].filter(([, action]) => action === "cancel");
  for (const [key] of removed) settings.aliases.delete(key);
  return () => {
    for (const [key, action] of removed) settings.aliases.set(key, action);
  };
}
