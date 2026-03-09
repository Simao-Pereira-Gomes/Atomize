import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test";

const mockIsTTY = mock(() => true);
const mockIsCI = mock(() => false);
const mockIsCancel = mock(() => false);
const mockCancel = mock();
const mockConfirm = mock();
const mockSelect = mock();
const mockText = mock();

mock.module("@clack/prompts", () => ({
  isTTY: mockIsTTY,
  isCI: mockIsCI,
  isCancel: mockIsCancel,
  cancel: mockCancel,
  confirm: mockConfirm,
  select: mockSelect,
  text: mockText,
}));

import {
  assertNotCancelled,
  isInteractiveTerminal,
  promptConditionalSelect,
  promptMultipleItems,
  promptOptionalFeature,
  Validators,
} from "@/cli/utilities/prompt-utilities";

describe("isInteractiveTerminal", () => {
  afterEach(() => {
    mockIsTTY.mockReset();
    mockIsCI.mockReset();
  });

  test("returns true when stdout is a TTY and not a CI environment", () => {
    mockIsTTY.mockReturnValue(true);
    mockIsCI.mockReturnValue(false);
    expect(isInteractiveTerminal()).toBe(true);
  });

  test("returns false when stdout is not a TTY (piped/redirected output)", () => {
    mockIsTTY.mockReturnValue(false);
    mockIsCI.mockReturnValue(false);
    expect(isInteractiveTerminal()).toBe(false);
  });

  test("returns false when running in a CI environment even with a TTY", () => {
    mockIsTTY.mockReturnValue(true);
    mockIsCI.mockReturnValue(true);
    expect(isInteractiveTerminal()).toBe(false);
  });

  test("returns false when both non-TTY and CI", () => {
    mockIsTTY.mockReturnValue(false);
    mockIsCI.mockReturnValue(true);
    expect(isInteractiveTerminal()).toBe(false);
  });
});

describe("assertNotCancelled", () => {
  let exitSpy: ReturnType<typeof spyOn<typeof process, "exit">>;

  beforeEach(() => {
    exitSpy = spyOn(process, "exit").mockImplementation((() => {}) as never);
    mockIsCancel.mockReset();
    mockCancel.mockReset();
  });

  afterEach(() => {
    exitSpy.mockRestore();
  });

  test("returns the value unchanged when not cancelled", () => {
    mockIsCancel.mockReturnValue(false);
    expect(assertNotCancelled("hello")).toBe("hello");
    expect(mockCancel).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  test("passes through non-string values (number, boolean, null) unchanged", () => {
    mockIsCancel.mockReturnValue(false);
    expect(assertNotCancelled(42)).toBe(42);
    expect(assertNotCancelled(true)).toBe(true);
    expect(assertNotCancelled(null)).toBe(null);
  });

  test("calls cancel('Operation cancelled.') when the value is a cancel symbol", () => {
    mockIsCancel.mockReturnValue(true);
    assertNotCancelled(Symbol.for("clack:cancel"));
    expect(mockCancel).toHaveBeenCalledWith("Operation cancelled.");
  });

  test("calls process.exit(0) when the value is a cancel symbol", () => {
    mockIsCancel.mockReturnValue(true);
    assertNotCancelled(Symbol.for("clack:cancel"));
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  test("does not exit for non-cancel values regardless of their type", () => {
    mockIsCancel.mockReturnValue(false);
    assertNotCancelled(Symbol("not-cancel"));
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

describe("promptOptionalFeature", () => {
  beforeEach(() => {
    mockIsCancel.mockReturnValue(false);
    mockConfirm.mockReset();
    mockCancel.mockReset();
  });

  test("returns { enabled: false } and skips followUp when user declines", async () => {
    mockConfirm.mockResolvedValue(false);
    const followUp = mock(async () => ({ value: "data" }));

    const result = await promptOptionalFeature("Enable feature", followUp);

    expect(result).toEqual({ enabled: false });
    expect(followUp).not.toHaveBeenCalled();
  });

  test("returns { enabled: true } with no data when user accepts but no followUp is given", async () => {
    mockConfirm.mockResolvedValue(true);

    const result = await promptOptionalFeature("Enable feature");

    expect(result).toEqual({ enabled: true });
  });

  test("calls followUp and returns its data when user accepts", async () => {
    mockConfirm.mockResolvedValue(true);
    const followUp = mock(async () => ({ customValue: "yes" }));

    const result = await promptOptionalFeature("Enable feature", followUp);

    expect(followUp).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ enabled: true, data: { customValue: "yes" } });
  });

  test("defaults initialValue to false (safe/opt-in behaviour)", async () => {
    mockConfirm.mockResolvedValue(false);

    await promptOptionalFeature("Enable feature");

    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ initialValue: false }),
    );
  });

  test("passes defaultEnabled = true as initialValue when specified", async () => {
    mockConfirm.mockResolvedValue(true);

    await promptOptionalFeature("Enable feature", undefined, true);

    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ initialValue: true }),
    );
  });
});
describe("promptMultipleItems", () => {
  beforeEach(() => {
    mockIsCancel.mockReturnValue(false);
    mockConfirm.mockReset();
  });

  test("collects a single item when user immediately says no more", async () => {
    mockConfirm.mockResolvedValue(false);
    const promptFn = mock(async (index: number) => `item-${index}`);

    const result = await promptMultipleItems("thing", promptFn);

    expect(result).toEqual(["item-1"]);
    expect(promptFn).toHaveBeenCalledTimes(1);
  });

  test("collects multiple items while user continues, stops when user says no", async () => {
    mockConfirm
      .mockResolvedValueOnce(true) // after item 1: add more
      .mockResolvedValueOnce(true) // after item 2: add more
      .mockResolvedValueOnce(false); // after item 3: stop
    const promptFn = mock(async (index: number) => `item-${index}`);

    const result = await promptMultipleItems("thing", promptFn);

    expect(result).toEqual(["item-1", "item-2", "item-3"]);
  });

  test("defaults add-more to true while below continueThreshold", async () => {
    mockConfirm.mockResolvedValue(false); // stop after first item
    const promptFn = mock(async () => "item");

    await promptMultipleItems("thing", promptFn, 3);
    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ initialValue: true }),
    );
  });

  test("defaults add-more to false when at or above continueThreshold", async () => {
    mockConfirm
      .mockResolvedValueOnce(true) // after item 1: count=1 < 2 → initialValue=true
      .mockResolvedValueOnce(false); // after item 2: count=2 >= 2 → initialValue=false
    const promptFn = mock(async (index: number) => `item-${index}`);

    await promptMultipleItems("thing", promptFn, 2);

    expect(mockConfirm).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ initialValue: false }),
    );
  });

  test("prompts with the correct item name in the message", async () => {
    mockConfirm.mockResolvedValue(false);

    await promptMultipleItems(
      "criterion",
      mock(async () => "x"),
    );

    expect(mockConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Add another criterion?" }),
    );
  });
});

describe("promptConditionalSelect", () => {
  beforeEach(() => {
    mockIsCancel.mockReturnValue(false);
    mockSelect.mockReset();
    mockText.mockReset();
  });

  test("returns just the select value when a non-trigger option is chosen", async () => {
    mockSelect.mockResolvedValue("option-a");

    const result = await promptConditionalSelect({
      selectPrompt: {
        name: "type",
        message: "Choose:",
        choices: [
          { label: "Option A", value: "option-a" },
          { label: "Custom", value: "custom" },
        ],
      },
      conditionalPrompt: {
        name: "customValue",
        message: "Enter custom:",
        triggerValue: "custom",
      },
    });

    expect(result).toEqual({ value: "option-a", customValue: undefined });
    expect(mockText).not.toHaveBeenCalled();
  });

  test("shows text prompt and returns customValue when trigger option is chosen", async () => {
    mockSelect.mockResolvedValue("custom");
    mockText.mockResolvedValue("my custom text");

    const result = await promptConditionalSelect({
      selectPrompt: {
        name: "type",
        message: "Choose:",
        choices: [
          { label: "Option A", value: "option-a" },
          { label: "Custom", value: "custom" },
        ],
      },
      conditionalPrompt: {
        name: "customValue",
        message: "Enter custom:",
        triggerValue: "custom",
      },
    });

    expect(result).toEqual({ value: "custom", customValue: "my custom text" });
    expect(mockText).toHaveBeenCalledTimes(1);
  });

  test("works without a conditionalPrompt (no text prompt ever shown)", async () => {
    mockSelect.mockResolvedValue("option-a");

    const result = await promptConditionalSelect({
      selectPrompt: {
        name: "type",
        message: "Choose:",
        choices: [{ label: "Option A", value: "option-a" }],
      },
    });

    expect(result).toEqual({ value: "option-a", customValue: undefined });
    expect(mockText).not.toHaveBeenCalled();
  });

  test("passes initialValue from defaultValue to the select prompt", async () => {
    mockSelect.mockResolvedValue("option-b");

    await promptConditionalSelect({
      selectPrompt: {
        name: "type",
        message: "Choose:",
        choices: [
          { label: "Option A", value: "option-a" },
          { label: "Option B", value: "option-b" },
        ],
        defaultValue: "option-b",
      },
    });

    expect(mockSelect).toHaveBeenCalledWith(
      expect.objectContaining({ initialValue: "option-b" }),
    );
  });
});

describe("Validators.greaterThan", () => {
  const validator = Validators.greaterThan("Items", 0);

  test("allows empty input (optional field)", () => {
    expect(validator("")).toBeUndefined();
    expect(validator("   ")).toBeUndefined();
    expect(validator(undefined)).toBeUndefined();
  });

  test("returns error for non-numeric input", () => {
    expect(validator("abc")).toBe("Items must be a valid number");
  });

  test("returns error when value equals the boundary (not strictly greater)", () => {
    expect(validator("0")).toBe("Items must be greater than 0");
  });

  test("returns error when value is below the boundary", () => {
    expect(validator("-1")).toBe("Items must be greater than 0");
  });

  test("returns undefined for valid values strictly above the boundary", () => {
    expect(validator("1")).toBeUndefined();
    expect(validator("0.001")).toBeUndefined();
    expect(validator("100")).toBeUndefined();
  });

  test("uses the supplied field name in error messages", () => {
    const v = Validators.greaterThan("MaxTasks", 5);
    expect(v("abc")).toBe("MaxTasks must be a valid number");
    expect(v("5")).toBe("MaxTasks must be greater than 5");
  });
});

describe("Validators.numericRange", () => {
  const validator = Validators.numericRange("Score", 1, 10);

  test("allows empty input (optional field)", () => {
    expect(validator("")).toBeUndefined();
    expect(validator("   ")).toBeUndefined();
    expect(validator(undefined)).toBeUndefined();
  });

  test("returns error for non-numeric input", () => {
    expect(validator("abc")).toBe("Score must be between 1 and 10");
  });

  test("returns error when value is below the minimum", () => {
    expect(validator("0")).toBe("Score must be between 1 and 10");
    expect(validator("-5")).toBe("Score must be between 1 and 10");
  });

  test("returns error when value is above the maximum", () => {
    expect(validator("11")).toBe("Score must be between 1 and 10");
    expect(validator("100")).toBe("Score must be between 1 and 10");
  });

  test("returns undefined for boundary values (inclusive)", () => {
    expect(validator("1")).toBeUndefined();
    expect(validator("10")).toBeUndefined();
  });

  test("returns undefined for values within the range", () => {
    expect(validator("5")).toBeUndefined();
    expect(validator("7.5")).toBeUndefined();
  });

  test("uses the supplied field name and bounds in the error message", () => {
    const v = Validators.numericRange("Priority", 1, 4);
    expect(v("0")).toBe("Priority must be between 1 and 4");
    expect(v("5")).toBe("Priority must be between 1 and 4");
  });
});
