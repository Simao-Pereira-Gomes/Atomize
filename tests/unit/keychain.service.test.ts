import { describe, expect, mock, test } from "bun:test";
import { normalizeKeytarModule, probeKeychainAccess } from "@/config/keychain.service";

describe("normalizeKeytarModule", () => {
  test("uses the default export when keytar is wrapped in a module namespace", () => {
    const keytarModule = {
      setPassword: mock(async () => {}),
      getPassword: mock(async () => null),
      deletePassword: mock(async () => true),
    };

    expect(normalizeKeytarModule({ default: keytarModule })).toBe(keytarModule);
  });

  test("uses the imported value directly when keytar is already the module", () => {
    const keytarModule = {
      setPassword: mock(async () => {}),
      getPassword: mock(async () => null),
      deletePassword: mock(async () => true),
    };

    expect(normalizeKeytarModule(keytarModule)).toBe(keytarModule);
  });
});

describe("probeKeychainAccess", () => {
  test("returns true when keytar can round-trip a probe secret", async () => {
    let storedSecret: string | null = null;
    const keytarModule = {
      setPassword: mock(async (_service: string, _account: string, secret: string) => {
        storedSecret = secret;
      }),
      getPassword: mock(async () => storedSecret),
      deletePassword: mock(async () => true),
    };

    await expect(probeKeychainAccess(keytarModule, "probe-1")).resolves.toBe(true);
  });

  test("returns false when keytar write fails", async () => {
    const keytarModule = {
      setPassword: mock(async () => {
        throw new Error("write failed");
      }),
      getPassword: mock(async () => null),
      deletePassword: mock(async () => false),
    };

    await expect(probeKeychainAccess(keytarModule, "probe-2")).resolves.toBe(false);
  });

  test("returns false when keytar readback does not match", async () => {
    const keytarModule = {
      setPassword: mock(async () => {}),
      getPassword: mock(async () => "different-secret"),
      deletePassword: mock(async () => true),
    };

    await expect(probeKeychainAccess(keytarModule, "probe-3")).resolves.toBe(false);
  });
});
