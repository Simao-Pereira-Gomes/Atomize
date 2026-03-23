import { spinner } from "@clack/prompts";

type OutputStream = "stdout" | "stderr";

interface BufferedLine {
  stream: OutputStream;
  message: string;
}

export interface SpinnerController {
  start(message: string): void;
  message(message: string): void;
  stop(message: string): void;
}

let promptOutputDepth = 0;
const bufferedLines: BufferedLine[] = [];

function normalizeMessage(message: string): string {
  return message.endsWith("\n") ? message : `${message}\n`;
}

function writeToStream(stream: OutputStream, message: string): void {
  const normalized = normalizeMessage(message);
  if (stream === "stderr") {
    process.stderr.write(normalized);
    return;
  }
  process.stdout.write(normalized);
}

export function beginPromptOutput(): void {
  promptOutputDepth += 1;
}

export function endPromptOutput(): void {
  if (promptOutputDepth === 0) {
    return;
  }

  promptOutputDepth -= 1;

  if (promptOutputDepth === 0) {
    flushBufferedOutput();
  }
}

export function writeManagedOutput(stream: OutputStream, message: string): void {
  if (promptOutputDepth > 0) {
    bufferedLines.push({ stream, message });
    return;
  }

  writeToStream(stream, message);
}

export function flushBufferedOutput(): void {
  while (bufferedLines.length > 0) {
    const next = bufferedLines.shift();
    if (!next) {
      return;
    }
    writeToStream(next.stream, next.message);
  }
}

export function createManagedSpinner(
  factory: () => SpinnerController = spinner,
): SpinnerController {
  const baseSpinner = factory();
  let active = false;

  function ensureActive(): void {
    if (active) {
      return;
    }
    beginPromptOutput();
    active = true;
  }

  return {
    start(message: string): void {
      ensureActive();
      baseSpinner.start(message);
    },
    message(message: string): void {
      ensureActive();
      baseSpinner.message(message);
    },
    stop(message: string): void {
      try {
        baseSpinner.stop(message);
      } finally {
        if (active) {
          active = false;
          endPromptOutput();
        }
      }
    },
  };
}

export function resetTerminalOutputForTests(): void {
  promptOutputDepth = 0;
  bufferedLines.length = 0;
}
