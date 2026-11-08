import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { logger, silently } from "@sppg2001/atomize-core";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("silently", () => {
  const warn = spyOn(console, "warn").mockImplementation(() => undefined);
  afterEach(() => warn.mockClear());

  test("drops log calls made inside it, including after an await", async () => {
    await silently(async () => {
      logger.warn("before");
      await sleep(5);
      logger.warn("after");
    });
    expect(warn).not.toHaveBeenCalled();
  });

  test("leaves work running alongside it logging", async () => {
    await Promise.all([
      silently(async () => {
        await sleep(10);
        logger.warn("quiet");
      }),
      (async () => {
        await sleep(5);
        logger.warn("loud");
      })(),
    ]);
    expect(warn.mock.calls.map((call) => call[0])).toEqual(["loud"]);
  });

  test("returns what the work returns, and logging resumes afterwards", async () => {
    expect(await silently(async () => 42)).toBe(42);
    logger.warn("back");
    expect(warn.mock.calls.map((call) => call[0])).toEqual(["back"]);
  });
});
