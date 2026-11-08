import { describe, expect, test } from "bun:test";
import {
  RequestThrottle,
  withRequestThrottle,
} from "@sppg2001/atomize-core/platforms/adapters/azure-devops/request-throttle";

/** A fake clock: sleep advances time instantly and records each wait. */
function fakeClock() {
  let now = 0;
  const waits: number[] = [];
  return {
    waits,
    now: () => now,
    sleep: async (ms: number) => {
      waits.push(ms);
      now += ms;
      await Promise.resolve();
    },
  };
}

function httpError(statusCode: number, retryAfterSeconds?: number, retryAfterHeader?: string) {
  const error = new Error(`HTTP ${statusCode}`) as Error & Record<string, unknown>;
  error.statusCode = statusCode;
  if (retryAfterSeconds !== undefined) error.rateLimit = { retryAfter: retryAfterSeconds };
  if (retryAfterHeader !== undefined) error.responseHeaders = { "retry-after": retryAfterHeader };
  return error;
}

describe("RequestThrottle", () => {
  test("retries a 429 after the Retry-After delay and returns the eventual result", async () => {
    const clock = fakeClock();
    const throttle = new RequestThrottle({ sleep: clock.sleep, now: clock.now });
    let calls = 0;

    const result = await throttle.run(async () => {
      calls++;
      if (calls === 1) throw httpError(429, 3);
      return "ok";
    });

    expect(result).toBe("ok");
    expect(calls).toBe(2);
    expect(clock.waits).toEqual([3000]);
  });

  test("retries a 503 too", async () => {
    const clock = fakeClock();
    const throttle = new RequestThrottle({ sleep: clock.sleep, now: clock.now });
    let calls = 0;

    await throttle.run(async () => {
      calls++;
      if (calls === 1) throw httpError(503, 1);
      return "ok";
    });

    expect(calls).toBe(2);
  });

  test("reads Retry-After from the raw response headers when the SDK didn't parse it", async () => {
    const clock = fakeClock();
    const throttle = new RequestThrottle({ sleep: clock.sleep, now: clock.now });
    let calls = 0;

    await throttle.run(async () => {
      calls++;
      if (calls === 1) throw httpError(429, undefined, "7");
      return "ok";
    });

    expect(clock.waits).toEqual([7000]);
  });

  test("backs off exponentially when a throttled response has no Retry-After", async () => {
    const clock = fakeClock();
    const throttle = new RequestThrottle({ sleep: clock.sleep, now: clock.now, baseRetryDelayMs: 1000 });
    let calls = 0;

    await throttle.run(async () => {
      calls++;
      if (calls <= 2) throw httpError(429);
      return "ok";
    });

    expect(clock.waits).toEqual([1000, 2000]);
  });

  test("gives up after maxRetries and rethrows the throttling error", async () => {
    const clock = fakeClock();
    const throttle = new RequestThrottle({ sleep: clock.sleep, now: clock.now, maxRetries: 2 });
    let calls = 0;

    await expect(
      throttle.run(async () => {
        calls++;
        throw httpError(429, 1);
      }),
    ).rejects.toThrow("HTTP 429");
    expect(calls).toBe(3);
  });

  test("does not retry other errors", async () => {
    const clock = fakeClock();
    const throttle = new RequestThrottle({ sleep: clock.sleep, now: clock.now });
    let calls = 0;

    await expect(
      throttle.run(async () => {
        calls++;
        throw httpError(400);
      }),
    ).rejects.toThrow("HTTP 400");
    expect(calls).toBe(1);
    expect(clock.waits).toEqual([]);
  });

  test("a successful response carrying Retry-After delays the next request", async () => {
    const clock = fakeClock();
    const throttle = new RequestThrottle({ sleep: clock.sleep, now: clock.now });

    const first = await throttle.run(async () => ({ id: 1, rateLimit: { retryAfter: 2 } }));
    expect(first.id).toBe(1);
    expect(clock.waits).toEqual([]);

    await throttle.run(async () => ({ id: 2 }));
    expect(clock.waits).toEqual([2000]);
  });

  test("lowers the in-flight limit for the rest of the run once throttled", async () => {
    const clock = fakeClock();
    const throttle = new RequestThrottle({ sleep: clock.sleep, now: clock.now });
    let inFlight = 0;
    let peakAfterThrottle = 0;
    let throttled = false;
    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    const request = (index: number) =>
      throttle.run(async () => {
        inFlight++;
        if (throttled) peakAfterThrottle = Math.max(peakAfterThrottle, inFlight);
        try {
          if (index === 0 && !throttled) {
            throttled = true;
            throw httpError(429, 1);
          }
          await gate;
          return index;
        } finally {
          inFlight--;
        }
      });

    // Eight requests start together (no limit yet); the first is throttled.
    const pending = Array.from({ length: 8 }, (_, i) => request(i));
    await new Promise((resolve) => setTimeout(resolve, 5));
    releaseGate();
    await Promise.all(pending);

    // A second batch after the throttle never exceeds the halved limit.
    let peak = 0;
    inFlight = 0;
    await Promise.all(
      Array.from({ length: 8 }, () =>
        throttle.run(async () => {
          inFlight++;
          peak = Math.max(peak, inFlight);
          await new Promise((resolve) => setTimeout(resolve, 1));
          inFlight--;
        }),
      ),
    );

    expect(throttle.currentLimit).toBe(4);
    expect(peak).toBeLessThanOrEqual(4);
  });

  test("throttle signals inside one pause window lower the limit only once", async () => {
    const clock = fakeClock();
    const throttle = new RequestThrottle({ sleep: clock.sleep, now: clock.now });
    const calls = new Map<number, number>();
    let releaseGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });

    const pending = Array.from({ length: 8 }, (_, i) =>
      throttle.run(async () => {
        const n = (calls.get(i) ?? 0) + 1;
        calls.set(i, n);
        if (n === 1 && i < 3) {
          await gate;
          throw httpError(429, 5);
        }
        await gate;
        return i;
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    releaseGate();
    await Promise.all(pending);

    expect(throttle.currentLimit).toBe(4);
  });
});

describe("withRequestThrottle", () => {
  test("routes every method call through the throttle and keeps `this`", async () => {
    const clock = fakeClock();
    const throttle = new RequestThrottle({ sleep: clock.sleep, now: clock.now });
    let calls = 0;
    const api = {
      prefix: "item",
      async getItem(id: number) {
        calls++;
        if (calls === 1) throw httpError(429, 1);
        return `${this.prefix}-${id}`;
      },
    };

    const wrapped = withRequestThrottle(api, throttle);

    expect(await wrapped.getItem(4)).toBe("item-4");
    expect(calls).toBe(2);
    expect(wrapped.prefix).toBe("item");
  });
});
