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

export function writeStdout(message: string): void {
  process.stdout.write(normalizeMessage(message));
}

export function writeStderr(message: string): void {
  process.stderr.write(normalizeMessage(message));
}

export function writeTerminalTransport(
  stream: OutputStream,
  message: string,
): void {
  if (stream === "stderr") {
    writeStderr(message);
    return;
  }

  writeStdout(message);
}

function writeToStream(stream: OutputStream, message: string): void {
  writeTerminalTransport(stream, message);
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
