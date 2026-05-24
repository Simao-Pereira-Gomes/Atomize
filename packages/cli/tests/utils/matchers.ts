import { expect } from "bun:test";

type Throwable = string | RegExp | Error | (new (...args: never[]) => Error);

/**
 * Typed wrapper around expect(promise).rejects.toThrow().
 *
 */
export function expectToReject(promise: Promise<unknown>, expected?: Throwable): Promise<void> {
  return expect(promise).rejects.toThrow(expected as never) as unknown as Promise<void>;
}
