import { describe, expect, test } from "bun:test";
import { resolveUpdateNotifierMode } from "@/cli/update-notifier";

describe("resolveUpdateNotifierMode", () => {
	test("uses immediate mode for local dev runs", () => {
		expect(resolveUpdateNotifierMode({ ATOMIZE_DEV: "true" })).toBe("immediate");
	});

	test("uses background mode outside local dev runs", () => {
		expect(resolveUpdateNotifierMode({})).toBe("background");
	});
});
