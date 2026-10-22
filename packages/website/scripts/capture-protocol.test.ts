import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { codeLiteral, resolveResponse } from "./capture-protocol.mjs";

test("CDP replies resolve only numeric pending requests, once", () => {
  const replies: unknown[] = [];
  const pending = new Map([[1, (message: unknown) => replies.push(message)]]);
  for (const id of ["1", "get", "constructor", {}, null, -1, 1.5, 2]) {
    resolveResponse(pending, { id });
  }
  expect(replies).toHaveLength(0);
  expect(pending.has(1)).toBe(true);
  const reply = { id: 1, result: { value: "ready" } };
  resolveResponse(pending, reply);
  resolveResponse(pending, reply);
  expect(replies).toEqual([reply]);
  expect(pending.size).toBe(0);
});

test("malformed CDP replies and non-callable callbacks are ignored", () => {
  const pending = new Map([[1, "not a callback"]]);
  for (const reply of [null, true, [], "response", {}, { id: 1 }]) {
    expect(() => resolveResponse(pending, reply)).not.toThrow();
  }
});

test("capture labels stay data in generated JavaScript, including script terminators and separators", () => {
  for (const label of ["contoso-web", "'\"); throw Error('injected'); //", "</script><script>throw Error('injected')</script>", "line\u2028paragraph\u2029<&>"]) {
    const literal = codeLiteral(label);
    expect(literal).not.toMatch(/[<>&\u2028\u2029]/);
    const result = runInNewContext(`[{ label: ${literal} }].find(row => row.label === ${literal}).label`);
    expect(result).toBe(label);
  }
});
