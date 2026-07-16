import { readFileSync, readSync } from "node:fs";

type StdinReader = (fd: number, encoding: BufferEncoding) => string | Buffer;

export function readPatFromStdin(readStdin: StdinReader = readFileSync): string | undefined {
  if (readStdin !== readFileSync) {
    try {
      return String(readStdin(0, "utf-8")).trim() || undefined;
    } catch {
      return undefined;
    }
  }
  try {
    // Read one line so GUI subprocesses can write a PAT without having to close stdin.
    const bytes: number[] = [];
    const buffer = Buffer.alloc(1);
    while (readSync(0, buffer, 0, 1, null) > 0) {
      const byte = buffer[0];
      if (byte === undefined || byte === 10 || byte === 13) break;
      bytes.push(byte);
    }
    return Buffer.from(bytes).toString("utf-8").trim() || undefined;
  } catch {
    return undefined;
  }
}
