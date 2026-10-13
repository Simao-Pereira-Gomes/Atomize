import { describe, expect, it } from "vitest";
import { rememberedInstallScope, rememberInstallScope } from "../install-scope";

const memoryStorage = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) };
};

describe("Install scope memory", () => {
  it("starts on Personal until a scope has been installed to", () => {
    expect(rememberedInstallScope(memoryStorage())).toBe("user");
    expect(rememberedInstallScope(undefined)).toBe("user");
  });

  it("starts on the scope last installed to", () => {
    const storage = memoryStorage();
    rememberInstallScope("project", storage);
    expect(rememberedInstallScope(storage)).toBe("project");
    rememberInstallScope("user", storage);
    expect(rememberedInstallScope(storage)).toBe("user");
  });

  it("falls back to Personal when storage refuses access or holds something unexpected", () => {
    const refusing = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(() => rememberInstallScope("project", refusing)).not.toThrow();
    expect(rememberedInstallScope(refusing)).toBe("user");
    expect(rememberedInstallScope({ getItem: () => "builtin", setItem: () => {} })).toBe("user");
  });
});
