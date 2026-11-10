/** The exit code a shell gives a process ended by SIGINT. */
const SIGINT_EXIT_CODE = 130;

/**
 * Runs `run` with a signal that the first Ctrl+C (SIGINT) aborts, so the run can stop starting new
 * work and still report what it did. A second Ctrl+C exits at once. The handler is removed when
 * `run` settles, so Ctrl+C outside it keeps its usual meaning.
 */
export async function stopOnInterrupt<T>(
  run: (signal: AbortSignal) => Promise<T>,
  onFirstInterrupt: () => void,
): Promise<T> {
  const controller = new AbortController();
  const onInterrupt = () => {
    if (controller.signal.aborted) process.exit(SIGINT_EXIT_CODE);
    controller.abort();
    onFirstInterrupt();
  };
  process.on("SIGINT", onInterrupt);
  try {
    return await run(controller.signal);
  } finally {
    process.removeListener("SIGINT", onInterrupt);
  }
}
