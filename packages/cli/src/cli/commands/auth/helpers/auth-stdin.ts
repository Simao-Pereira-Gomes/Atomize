import { readFileSync } from "node:fs";

type StdinReader = (fd: number, encoding: BufferEncoding) => string | Buffer;

export function readPatFromStdin(readStdin: StdinReader = readFileSync): string | undefined {
  try {
    return String(readStdin(0, "utf-8")).trim() || undefined;
  } catch {
    return undefined;
  }
}
