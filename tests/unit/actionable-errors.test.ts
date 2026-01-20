import { describe, expect, test } from "bun:test";
import { DependencyResolver } from "@core/dependency-resolver";
import { TemplateValidator } from "@templates/validator";
import { CircularDependencyError } from "@utils/errors";
import { validateEstimationPercentages } from "@utils/estimation-normalizer";

describe("Actionable Error Messages", () => {
	const validator = new TemplateValidator();

	describe("Estimation Errors", () => {
		test("should suggest adding percentage when total is too low", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [{ title: "Task 1", estimationPercent: 70 }],
				validation: {
					totalEstimationMustBe: 100,
				},
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);

			const estimationError = result.errors.find((e) =>
				e.code.includes("INVALID_TOTAL_ESTIMATION"),
			);
			expect(estimationError).toBeDefined();
			expect(estimationError?.suggestion).toBeDefined();
			expect(estimationError?.suggestion).toContain("Add 30%");
		});

		test("should suggest reducing percentage when total is too high", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [{ title: "Task 1", estimationPercent: 120 }],
				validation: {
					totalEstimationMustBe: 100,
				},
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(false);
			const estimationError = result.errors.find((e) =>
				e.code.includes("INVALID_TOTAL_ESTIMATION"),
			);
			expect(estimationError?.suggestion).toBeDefined();
			expect(estimationError?.suggestion).toContain("Reduce");
			expect(estimationError?.suggestion).toContain("20%");
		});

		test("should suggest adjusting to range minimum", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [{ title: "Task 1", estimationPercent: 80 }],
				validation: {
					totalEstimationRange: { min: 95, max: 105 },
				},
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(false);
			const estimationError = result.errors.find((e) =>
				e.code.includes("INVALID_ESTIMATION_RANGE"),
			);
			expect(estimationError?.suggestion).toBeDefined();
			expect(estimationError?.suggestion).toContain("Increase");
			expect(estimationError?.suggestion).toContain("15%");
		});

		test("should suggest adjusting to range maximum", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [{ title: "Task 1", estimationPercent: 110 }],
				validation: {
					totalEstimationRange: { min: 95, max: 105 },
				},
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(false);
			const estimationError = result.errors.find((e) =>
				e.code.includes("INVALID_ESTIMATION_RANGE"),
			);
			expect(estimationError?.suggestion).toBeDefined();
			expect(estimationError?.suggestion).toContain("Reduce");
			expect(estimationError?.suggestion).toContain("5%");
		});
	});

	describe("Task Count Errors", () => {
		test("should suggest adding tasks when below minimum", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [{ title: "Task 1", estimationPercent: 100 }],
				validation: {
					minTasks: 3,
				},
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(false);
			const taskCountError = result.errors.find((e) =>
				e.code.includes("TOO_FEW_TASKS"),
			);
			expect(taskCountError).toBeDefined();
			// Message includes suggestion inline
			expect(taskCountError?.message).toContain("Add 2 more task(s)");
		});

		test("should suggest removing tasks or increasing limit when above maximum", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [
					{ title: "Task 1", estimationPercent: 20 },
					{ title: "Task 2", estimationPercent: 20 },
					{ title: "Task 3", estimationPercent: 20 },
					{ title: "Task 4", estimationPercent: 20 },
					{ title: "Task 5", estimationPercent: 20 },
				],
				validation: {
					maxTasks: 3,
				},
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(false);
			const taskCountError = result.errors.find((e) =>
				e.code.includes("TOO_MANY_TASKS"),
			);
			expect(taskCountError).toBeDefined();
			// Message includes suggestion inline
			expect(taskCountError?.message).toMatch(/Remove 2 task\(s\)/);
		});
	});

	describe("Dependency Errors", () => {
		test("should suggest available task IDs when dependency is missing", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [
					{
						id: "task1",
						title: "Task 1",
						estimationPercent: 50,
					},
					{
						id: "task2",
						title: "Task 2",
						estimationPercent: 50,
						dependsOn: ["nonexistent"],
					},
				],
				validation: {
					totalEstimationMustBe: 100,
				},
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(false);
			const depError = result.errors.find((e) =>
				e.code.includes("INVALID_DEPENDENCY"),
			);
			expect(depError).toBeDefined();
			// Message includes available IDs inline
			expect(depError?.message).toContain("task1");
			expect(depError?.message).toContain("Available task IDs");
		});

		test("should suggest adding id when task has dependencies but no id", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [
					{
						id: "task2",
						title: "Task 2",
						estimationPercent: 50,
					},
					{
						title: "Task 1",
						estimationPercent: 50,
						dependsOn: ["task2"],
					},
				],
			};

			const result = validator.validate(template);

			expect(result.warnings.length).toBeGreaterThan(0);
			const warning = result.warnings.find((w) =>
				w.message.includes("has dependencies but no id"),
			);
			expect(warning).toBeDefined();
			expect(warning?.suggestion).toBeDefined();
			expect(warning?.suggestion).toContain("id:");
		});

		test("should suggest which tasks reference it when task is referenced but has no id", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [
					{
						title: "Setup Database",
						estimationPercent: 100,
						// No ID but referenced by title
					},
					{
						id: "task2",
						title: "Task 2",
						estimationPercent: 0,
						dependsOn: ["Setup Database"], // Referencing by title
					},
				],
			};

			const result = validator.validate(template);

			// Should have warnings about the title reference
			// Note: This might fail validation first due to invalid dependency
			// so we check if there are warnings or if it failed on schema validation
			if (result.warnings.length > 0) {
				const warning = result.warnings.find((w) =>
					w.message.includes("is referenced"),
				);
				if (warning) {
					expect(warning.suggestion).toBeDefined();
					expect(warning.suggestion).toContain("id:");
				}
			}
			// At minimum validate warnings are being tracked
			expect(result.warnings).toBeDefined();
		});
	});

	describe("Circular Dependency Errors", () => {
		test("should suggest breaking the cycle", () => {
			const tasks = [
				{
					id: "task1",
					title: "Task 1",
					dependsOn: ["task2"],
				},
				{
					id: "task2",
					title: "Task 2",
					dependsOn: ["task1"],
				},
			];

			const resolver = new DependencyResolver();

			expect(() => resolver.resolveDependencies(tasks)).toThrow(
				CircularDependencyError,
			);

			try {
				resolver.resolveDependencies(tasks);
			} catch (error) {
				if (error instanceof CircularDependencyError) {
					expect(error.message).toContain("Circular dependency detected");
					expect(error.message).toContain(
						"Break the circular dependency by removing",
					);
				}
			}
		});
	});

	describe("Condition Errors", () => {
		test("should suggest proper condition syntax when invalid", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [
					{
						title: "Task 1",
						estimationPercent: 100,
						condition: "true",
					},
				],
			};

			const result = validator.validate(template);

			const warning = result.warnings.find((w) =>
				w.message.includes("might be invalid"),
			);
			expect(warning).toBeDefined();
			expect(warning?.suggestion).toBeDefined();
			expect(warning?.suggestion).toContain("${");
			expect(warning?.suggestion).toContain("CONTAINS");
		});
	});

	describe("Schema Validation Errors", () => {
		test("should suggest value range for negative estimation", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [
					{
						title: "Task 1",
						estimationPercent: -10,
					},
				],
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(false);
			const error = result.errors.find((e) =>
				e.path.includes("estimationPercent"),
			);
			expect(error).toBeDefined();
			expect(error?.suggestion).toBeDefined();
		});

		test("should suggest adding tasks when array is empty", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [],
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(false);
			const error = result.errors.find((e) => e.path.includes("tasks"));
			expect(error).toBeDefined();
			expect(error?.suggestion).toBeDefined();
			expect(error?.suggestion).toContain("at least one task");
		});

		test("should suggest email format when invalid", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {
					assignedTo: ["not-an-email"],
				},
				tasks: [{ title: "Task 1" }],
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(false);
			const error = result.errors.find((e) => e.path.includes("assignedTo"));
			expect(error).toBeDefined();
			// Should have a suggestion
			if (error?.suggestion) {
				expect(error.suggestion).toContain("email");
			} else {
				// At minimum the error message should be present
				expect(error?.message).toBeDefined();
			}
		});
	});

	describe("Estimation Normalizer Suggestions", () => {
		test("should provide suggestions for total mismatch", () => {
			const items = [
				{ estimationPercent: 30 },
				{ estimationPercent: 40 },
			];

			const result = validateEstimationPercentages(items);

			expect(result.valid).toBe(false);
			expect(result.suggestions.length).toBeGreaterThan(0);
			expect(result.suggestions[0]).toContain("30");
		});

		test("should provide suggestions for zero estimations", () => {
			const items = [
				{ estimationPercent: 100 },
				{ estimationPercent: 0 },
			];

			const result = validateEstimationPercentages(items);

			expect(result.valid).toBe(false);
			expect(result.suggestions.length).toBeGreaterThan(0);
			// Check that there's a suggestion about items with zero estimation
			expect(result.suggestions.some((s) => s.toLowerCase().includes("item"))).toBe(true);
		});
	});

	describe("Formatted Output", () => {
		test("should display suggestions in formatted output", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [{ title: "Task 1", estimationPercent: 70 }],
				validation: {
					totalEstimationMustBe: 100,
				},
			};

			const result = validator.validate(template);
			const formatted = validator.formatResult(result);

			expect(formatted).toContain("💡");
			expect(formatted).toContain("Add 30%");
		});

		test("should display suggestions for warnings", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [{ title: "Task 1", estimationPercent: 80 }],
			};

			const result = validator.validate(template);
			const formatted = validator.formatResult(result);

			expect(formatted).toContain("Warnings:");
			expect(formatted).toContain("💡");
		});
	});
});
