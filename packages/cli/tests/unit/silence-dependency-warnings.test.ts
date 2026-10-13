import { describe, expect, mock, test } from "bun:test";
import { silenceDependencyWarnings } from "@/cli/silence-dependency-warnings";

describe("silenceDependencyWarnings", () => {
	function fakeProcess() {
		const emitted = mock((..._args: unknown[]) => {});
		const target = { emitWarning: emitted as unknown as NodeJS.Process["emitWarning"] };
		silenceDependencyWarnings(target);
		return { target, emitted };
	}

	test("drops the url.parse() deprecation warning however it is emitted", () => {
		const { target, emitted } = fakeProcess();
		target.emitWarning("`url.parse()` behavior is not standardized", "DeprecationWarning", "DEP0169");
		target.emitWarning("`url.parse()` behavior is not standardized", { type: "DeprecationWarning", code: "DEP0169" });
		expect(emitted).not.toHaveBeenCalled();
	});

	test("lets every other warning through unchanged", () => {
		const { target, emitted } = fakeProcess();
		target.emitWarning("Something else", "DeprecationWarning", "DEP0005");
		target.emitWarning("A plain warning");
		expect(emitted.mock.calls).toEqual([["Something else", "DeprecationWarning", "DEP0005"], ["A plain warning"]]);
	});
});
