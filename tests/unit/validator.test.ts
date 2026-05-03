import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { TemplateLoader } from "@templates/loader";
import { TemplateValidator } from "@templates/validator";
import { TemplateValidationError } from "@utils/errors";

describe("TemplateValidator", () => {
	const validator = new TemplateValidator();
	const loader = new TemplateLoader();
	const fixturesPath = resolve(__dirname, "../fixtures/templates");

	describe("validate", () => {
		test("should validate a correct template", async () => {
			const template = await loader.load(
				resolve(fixturesPath, "valid-template.yaml"),
			);
			const result = validator.validate(template);

			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		test("should return validation result with errors and warnings", async () => {
			const template = await loader.load(
				resolve(fixturesPath, "valid-template.yaml"),
			);
			const result = validator.validate(template);

			expect(result).toHaveProperty("valid");
			expect(result).toHaveProperty("errors");
			expect(result).toHaveProperty("warnings");
			expect(Array.isArray(result.errors)).toBe(true);
			expect(Array.isArray(result.warnings)).toBe(true);
		});

		test("should detect invalid estimation total", async () => {
			const template = await loader.load(
				resolve(fixturesPath, "invalid-estimation.yaml"),
			);
			const result = validator.validate(template);

			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);

			const estimationError = result.errors.find(
				(e) => e.code === "INVALID_TOTAL_ESTIMATION",
			);
			expect(estimationError).toBeDefined();
			expect(estimationError?.message).toContain("70%");
			expect(estimationError?.message).toContain("100%");
		});

		test("should detect invalid dependencies", async () => {
			const template = await loader.load(
				resolve(fixturesPath, "invalid-dependency.yaml"),
			);
			const result = validator.validate(template);

			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);

			const depError = result.errors.find(
				(e) => e.code === "INVALID_DEPENDENCY",
			);
			expect(depError).toBeDefined();
			expect(depError?.message).toContain("nonexistent-task");
		});

		test("should validate required fields", () => {
			const invalidTemplate = {
				version: "1.0",
				// Missing 'name'
				filter: {},
				tasks: [],
			};

			const result = validator.validate(invalidTemplate);

			expect(result.valid).toBe(false);
			expect(result.errors.length).toBeGreaterThan(0);
		});

		test("should validate task title is required", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: { workItemTypes: ["User Story"] },
				tasks: [
					{
						// Missing title
						estimationPercent: 100,
					},
				],
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(false);
			const titleError = result.errors.find((e) => e.path.includes("title"));
			expect(titleError).toBeDefined();
		});

		test("should validate estimation range", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [
					{
						title: "Task",
						estimationPercent: 150, // Invalid: > 100
					},
				],
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(false);
		});

		test("should validate task count limits", async () => {
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
			const taskCountError = result.errors.find(
				(e) => e.code === "TOO_FEW_TASKS",
			);
			expect(taskCountError).toBeDefined();
		});

		test("should warn when total estimation exceeds 100% without validation config", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [
					{ title: "Task 1", estimationPercent: 60 },
					{ title: "Task 2", estimationPercent: 60 },
				],
				// No validation config
			};

			const result = validator.validate(template);

			// Should be valid but with warnings
			expect(result.valid).toBe(true);
			expect(result.warnings.length).toBeGreaterThan(0);

			const estimationWarning = result.warnings.find((w) =>
				w.message.includes("120%"),
			);
			expect(estimationWarning).toBeDefined();
		});

		test("should accept estimation within range", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [{ title: "Task 1", estimationPercent: 95 }],
				validation: {
					totalEstimationRange: {
						min: 90,
						max: 110,
					},
				},
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(true);
		});

		test("should reject estimation outside range", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [{ title: "Task 1", estimationPercent: 80 }],
				validation: {
					totalEstimationRange: {
						min: 95,
						max: 105,
					},
				},
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(false);
			const rangeError = result.errors.find(
				(e) => e.code === "INVALID_ESTIMATION_RANGE",
			);
			expect(rangeError).toBeDefined();
		});
	});

	describe("validateOrThrow", () => {
		test("should return template if valid", async () => {
			const template = await loader.load(
				resolve(fixturesPath, "valid-template.yaml"),
			);
			const validated = validator.validateOrThrow(template);

			expect(validated).toBeDefined();
			expect(validated.name).toBe("Test Template");
		});

		test("should throw TemplateValidationError if invalid", async () => {
			const template = await loader.load(
				resolve(fixturesPath, "invalid-estimation.yaml"),
			);

			expect(() => validator.validateOrThrow(template)).toThrow(
				TemplateValidationError,
			);
		});

		test("should include error details in exception", async () => {
			const template = await loader.load(
				resolve(fixturesPath, "invalid-estimation.yaml"),
			);

			try {
				validator.validateOrThrow(template);
				expect(true).toBe(false); // Should not reach here
			} catch (error) {
				expect(error).toBeInstanceOf(TemplateValidationError);
				if (error instanceof TemplateValidationError) {
					expect(error.errors.length).toBeGreaterThan(0);
				}
			}
		});
	});

	describe("formatResult", () => {
		test("should format valid result", async () => {
			const template = await loader.load(
				resolve(fixturesPath, "valid-template.yaml"),
			);
			const result = validator.validate(template);
			const formatted = validator.formatResult(result);

			expect(formatted).toContain("valid");
		});

		test("should format invalid result with errors", async () => {
			const template = await loader.load(
				resolve(fixturesPath, "invalid-estimation.yaml"),
			);
			const result = validator.validate(template);
			const formatted = validator.formatResult(result);

			expect(formatted).toContain("Errors:");
		});

		test("should format warnings", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [
					{ title: "Task 1", estimationPercent: 60 },
					{ title: "Task 2", estimationPercent: 60 },
				],
			};

			const result = validator.validate(template);
			const formatted = validator.formatResult(result);

			expect(formatted).toContain("Warnings:");
		});
	});

	describe("business rules validation", () => {
		test("should validate dependencies exist", () => {
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
						dependsOn: ["task1"], // Valid dependency
					},
				],
				validation: {
					totalEstimationMustBe: 100,
				},
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		test("should ignore conditional tasks in estimation", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [
					{
						title: "Always Task",
						estimationPercent: 100,
					},
					{
						title: "Conditional Task",
						estimationPercent: 20,
						condition: { field: "tags", operator: "contains", value: "some-tag" },
					},
				],
				validation: {
					totalEstimationMustBe: 100,
				},
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(true);
		});

		test("should warn when condition references custom fields (needs online verification)", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [
					{
						title: "Task",
						estimationPercent: 100,
						condition: { customField: "Custom.ClientTier", operator: "equals", value: "Enterprise" },
					},
				],
			};

			const result = validator.validate(template);

			// Should warn that custom field needs online verification
			expect(result.warnings.some((w) => w.path.includes("condition"))).toBe(true);
		});

		test("should validate max tasks limit", () => {
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
					maxTasks: 3, // Too many tasks
				},
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(false);
			const maxTasksError = result.errors.find(
				(e) => e.code === "TOO_MANY_TASKS",
			);
			expect(maxTasksError).toBeDefined();
		});
	});

	describe("validation modes (strict vs lenient)", () => {
		describe("lenient mode (default)", () => {
			test("should use lenient mode by default", () => {
				const template = {
					version: "1.0",
					name: "Test",
					filter: {},
					tasks: [{ title: "Task 1", estimationPercent: 80 }],
				};

				const result = validator.validate(template);

				expect(result.mode).toBe("lenient");
			});

			test("should return warnings without failing in lenient mode", () => {
				const template = {
					version: "1.0",
					name: "Test",
					filter: {},
					tasks: [{ title: "Task 1", estimationPercent: 60 }, { title: "Task 2", estimationPercent: 60 }],
				};

				const result = validator.validate(template);

				expect(result.valid).toBe(true);
				expect(result.warnings.length).toBeGreaterThan(0);
				expect(result.errors).toHaveLength(0);
			});

			test("should respect lenient mode from template config", () => {
				const template = {
					version: "1.0",
					name: "Test",
					filter: {},
					tasks: [{ title: "Task 1", estimationPercent: 60 }, { title: "Task 2", estimationPercent: 60 }],
					validation: {
						mode: "lenient",
					},
				};

				const result = validator.validate(template);

				expect(result.mode).toBe("lenient");
				expect(result.valid).toBe(true);
				expect(result.warnings.length).toBeGreaterThan(0);
			});
		});

		describe("strict mode", () => {
			test("should promote warnings to errors in strict mode", () => {
				// A task with dependsOn but no id generates a warning → error in strict mode
				const template = {
					version: "1.0",
					name: "Test",
					filter: {},
					tasks: [
						{ id: "t1", title: "Task 1", estimationPercent: 50 },
						{ title: "Task 2 (no id)", estimationPercent: 50, dependsOn: ["t1"] },
					],
					validation: {
						mode: "strict",
					},
				};

				const result = validator.validate(template);

				expect(result.mode).toBe("strict");
				expect(result.valid).toBe(false);
				expect(result.warnings).toHaveLength(0);
				expect(result.errors.length).toBeGreaterThan(0);

				const promotedError = result.errors.find(
					(e) => e.code === "STRICT_MODE_WARNING",
				);
				expect(promotedError).toBeDefined();
			});

			test("should use strict mode from template config", () => {
				const template = {
					version: "1.0",
					name: "Test",
					filter: {},
					tasks: [{ title: "Task 1", estimationPercent: 100 }],
					validation: {
						mode: "strict",
					},
				};

				const result = validator.validate(template);

				expect(result.mode).toBe("strict");
			});

			test("should promote custom field condition warning to error in strict mode", () => {
				const template = {
					version: "1.0",
					name: "Test",
					filter: {},
					tasks: [
						{
							title: "Task",
							estimationPercent: 100,
							condition: { customField: "Custom.ClientTier", operator: "equals", value: "Enterprise" },
						},
					],
					validation: {
						mode: "strict",
					},
				};

				const result = validator.validate(template);

				expect(result.valid).toBe(false);
				expect(result.errors.some((e) => e.path.includes("condition"))).toBe(
					true,
				);
			});

			test("should fail on missing task IDs for dependencies in strict mode", () => {
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
							// Missing id but has dependsOn
							title: "Task 2",
							estimationPercent: 50,
							dependsOn: ["task1"],
						},
					],
					validation: {
						mode: "strict",
						totalEstimationMustBe: 100,
					},
				};

				const result = validator.validate(template);

				expect(result.valid).toBe(false);
				expect(result.errors.some((e) => e.message.includes("no id field"))).toBe(
					true,
				);
			});
		});

		describe("CLI option override", () => {
			test("should override lenient template config with strict CLI option", () => {
				const template = {
					version: "1.0",
					name: "Test",
					filter: {},
					tasks: [{ title: "Task 1", estimationPercent: 100, condition: "true" }],
					validation: {
						mode: "lenient",
					},
				};

				const result = validator.validate(template, { mode: "strict" });

				expect(result.mode).toBe("strict");
				expect(result.valid).toBe(false);
				expect(result.errors.length).toBeGreaterThan(0);
			});

			test("should override strict template config with lenient CLI option", () => {
				const template = {
					version: "1.0",
					name: "Test",
					filter: {},
					tasks: [{ title: "Task 1", estimationPercent: 60 }, { title: "Task 2", estimationPercent: 60 }],
					validation: {
						mode: "strict",
					},
				};

				const result = validator.validate(template, { mode: "lenient" });

				expect(result.mode).toBe("lenient");
				expect(result.valid).toBe(true);
				expect(result.warnings.length).toBeGreaterThan(0);
			});

			test("should use CLI option when template has no mode specified", () => {
				// Task with dependsOn but no id → warning in lenient, error in strict
				const template = {
					version: "1.0",
					name: "Test",
					filter: {},
					tasks: [
						{ id: "t1", title: "Task 1", estimationPercent: 50 },
						{ title: "Task 2 (no id)", estimationPercent: 50, dependsOn: ["t1"] },
					],
				};

				const strictResult = validator.validate(template, { mode: "strict" });
				const lenientResult = validator.validate(template, { mode: "lenient" });

				expect(strictResult.mode).toBe("strict");
				expect(strictResult.valid).toBe(false);

				expect(lenientResult.mode).toBe("lenient");
				expect(lenientResult.valid).toBe(true);
			});
		});

		describe("validateOrThrow with modes", () => {
			test("should throw in strict mode when warnings exist", () => {
				// Task with dependsOn but no id → warning in lenient, error in strict
				const template = {
					version: "1.0",
					name: "Test",
					filter: {},
					tasks: [
						{ id: "t1", title: "Task 1", estimationPercent: 50 },
						{ title: "Task 2 (no id)", estimationPercent: 50, dependsOn: ["t1"] },
					],
				};

				// Lenient mode should not throw
				expect(() => validator.validateOrThrow(template)).not.toThrow();

				// Strict mode should throw
				expect(() =>
					validator.validateOrThrow(template, { mode: "strict" }),
				).toThrow(TemplateValidationError);
			});

			test("should pass in strict mode when no warnings exist", () => {
				const template = {
					version: "1.0",
					name: "Test",
					filter: {},
					tasks: [{ title: "Task 1", estimationPercent: 100 }],
				};

				const validated = validator.validateOrThrow(template, { mode: "strict" });
				expect(validated.name).toBe("Test");
			});
		});

		describe("formatResult with modes", () => {
			test("should include mode label in formatted output for strict mode", () => {
				const template = {
					version: "1.0",
					name: "Test",
					filter: {},
					tasks: [{ title: "Task 1", estimationPercent: 100 }],
				};

				const result = validator.validate(template, { mode: "strict" });
				const formatted = validator.formatResult(result);

				expect(formatted).toContain("[Strict Mode]");
			});

			test("should include mode label in formatted output for lenient mode", () => {
				const template = {
					version: "1.0",
					name: "Test",
					filter: {},
					tasks: [{ title: "Task 1", estimationPercent: 100 }],
				};

				const result = validator.validate(template, { mode: "lenient" });
				const formatted = validator.formatResult(result);

				expect(formatted).toContain("[Lenient Mode]");
			});
		});

		describe("edge cases", () => {
			test("should handle template with no validation config in strict mode via option", () => {
				const template = {
					version: "1.0",
					name: "Test",
					filter: {},
					tasks: [{ title: "Task 1", estimationPercent: 100 }],
					// No validation config at all
				};

				const result = validator.validate(template, { mode: "strict" });

				expect(result.mode).toBe("strict");
				expect(result.valid).toBe(true);
			});

			test("should still fail on schema errors regardless of mode", () => {
				const invalidTemplate = {
					version: "1.0",
					// Missing name
					filter: {},
					tasks: [],
				};

				const lenientResult = validator.validate(invalidTemplate, {
					mode: "lenient",
				});
				const strictResult = validator.validate(invalidTemplate, {
					mode: "strict",
				});

				expect(lenientResult.valid).toBe(false);
				expect(strictResult.valid).toBe(false);
			});

			test("should preserve suggestion in promoted errors", () => {
				// Dependency-related warning has a suggestion that should be preserved
				const template = {
					version: "1.0",
					name: "Test",
					filter: {},
					tasks: [
						{ id: "t1", title: "Task 1", estimationPercent: 50 },
						{ title: "Task 2 (no id)", estimationPercent: 50, dependsOn: ["t1"] },
					],
				};

				const result = validator.validate(template, { mode: "strict" });
				const promotedError = result.errors.find(
					(e) => e.code === "STRICT_MODE_WARNING",
				);

				expect(promotedError?.suggestion).toBeDefined();
			});
		});
	});

	describe("required tasks validation", () => {
		test("should pass when all required tasks are present by title", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [
					{ title: "Setup", estimationPercent: 30 },
					{ title: "Implementation", estimationPercent: 50 },
					{ title: "Testing", estimationPercent: 20 },
				],
				validation: {
					totalEstimationMustBe: 100,
					requiredTasks: [{ title: "Setup" }, { title: "Testing" }],
				},
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		test("should fail when required task is missing", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [
					{ title: "Setup", estimationPercent: 50 },
					{ title: "Implementation", estimationPercent: 50 },
				],
				validation: {
					totalEstimationMustBe: 100,
					requiredTasks: [
						{ title: "Setup" },
						{ title: "Testing" }, // Missing!
					],
				},
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(false);
			const missingError = result.errors.find(
				(e) => e.code === "MISSING_REQUIRED_TASK",
			);
			expect(missingError).toBeDefined();
			expect(missingError?.message).toContain("Testing");
		});

		test("should match required task by id", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [
					{ id: "setup-task", title: "Project Setup", estimationPercent: 50 },
					{ id: "test-task", title: "Run Tests", estimationPercent: 50 },
				],
				validation: {
					totalEstimationMustBe: 100,
					requiredTasks: [
						{ id: "setup-task", title: "Setup" },
						{ id: "test-task", title: "Testing" },
					],
				},
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(true);
		});

		test("should be case-insensitive for title matching", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [
					{ title: "SETUP", estimationPercent: 50 },
					{ title: "testing", estimationPercent: 50 },
				],
				validation: {
					totalEstimationMustBe: 100,
					requiredTasks: [{ title: "Setup" }, { title: "TESTING" }],
				},
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(true);
		});

		test("should provide actionable suggestion for missing required task", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [{ title: "Setup", estimationPercent: 100 }],
				validation: {
					requiredTasks: [{ title: "Code Review" }],
				},
			};

			const result = validator.validate(template);
			const error = result.errors.find(
				(e) => e.code === "MISSING_REQUIRED_TASK",
			);

			expect(error?.suggestion).toBeDefined();
			expect(error?.suggestion).toContain("Code Review");
		});
	});

	describe("circular dependency detection", () => {
		test("should detect simple cycle (A → B → A)", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [
					{
						id: "task-a",
						title: "Task A",
						estimationPercent: 50,
						dependsOn: ["task-b"],
					},
					{
						id: "task-b",
						title: "Task B",
						estimationPercent: 50,
						dependsOn: ["task-a"],
					},
				],
				validation: {
					totalEstimationMustBe: 100,
				},
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(false);
			const cycleError = result.errors.find(
				(e) => e.code === "CIRCULAR_DEPENDENCY",
			);
			expect(cycleError).toBeDefined();
			expect(cycleError?.message).toContain("task-a");
			expect(cycleError?.message).toContain("task-b");
		});

		test("should detect complex cycle (A → B → C → A)", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [
					{
						id: "task-a",
						title: "Task A",
						estimationPercent: 34,
						dependsOn: ["task-b"],
					},
					{
						id: "task-b",
						title: "Task B",
						estimationPercent: 33,
						dependsOn: ["task-c"],
					},
					{
						id: "task-c",
						title: "Task C",
						estimationPercent: 33,
						dependsOn: ["task-a"],
					},
				],
				validation: {
					totalEstimationMustBe: 100,
				},
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(false);
			const cycleError = result.errors.find(
				(e) => e.code === "CIRCULAR_DEPENDENCY",
			);
			expect(cycleError).toBeDefined();
			expect(cycleError?.message).toContain("Circular dependency detected");
			expect(cycleError?.message).toContain("→");
		});

		test("should detect self-referential dependency (A → A)", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [
					{
						id: "task-a",
						title: "Task A",
						estimationPercent: 100,
						dependsOn: ["task-a"],
					},
				],
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(false);
			const cycleError = result.errors.find(
				(e) => e.code === "CIRCULAR_DEPENDENCY",
			);
			expect(cycleError).toBeDefined();
			expect(cycleError?.message).toContain("task-a");
		});

		test("should allow valid diamond dependencies (no cycle)", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [
					{
						id: "task-a",
						title: "Task A",
						estimationPercent: 25,
					},
					{
						id: "task-b",
						title: "Task B",
						estimationPercent: 25,
						dependsOn: ["task-a"],
					},
					{
						id: "task-c",
						title: "Task C",
						estimationPercent: 25,
						dependsOn: ["task-a"],
					},
					{
						id: "task-d",
						title: "Task D",
						estimationPercent: 25,
						dependsOn: ["task-b", "task-c"],
					},
				],
				validation: {
					totalEstimationMustBe: 100,
				},
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(true);
			expect(
				result.errors.filter((e) => e.code === "CIRCULAR_DEPENDENCY"),
			).toHaveLength(0);
		});

		test("should allow valid linear chain (no cycle)", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [
					{
						id: "task-a",
						title: "Task A",
						estimationPercent: 25,
					},
					{
						id: "task-b",
						title: "Task B",
						estimationPercent: 25,
						dependsOn: ["task-a"],
					},
					{
						id: "task-c",
						title: "Task C",
						estimationPercent: 25,
						dependsOn: ["task-b"],
					},
					{
						id: "task-d",
						title: "Task D",
						estimationPercent: 25,
						dependsOn: ["task-c"],
					},
				],
				validation: {
					totalEstimationMustBe: 100,
				},
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(true);
		});

		test("should detect multiple separate cycles", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [
					{
						id: "task-a",
						title: "Task A",
						estimationPercent: 25,
						dependsOn: ["task-b"],
					},
					{
						id: "task-b",
						title: "Task B",
						estimationPercent: 25,
						dependsOn: ["task-a"],
					},
					{
						id: "task-c",
						title: "Task C",
						estimationPercent: 25,
						dependsOn: ["task-d"],
					},
					{
						id: "task-d",
						title: "Task D",
						estimationPercent: 25,
						dependsOn: ["task-c"],
					},
				],
				validation: {
					totalEstimationMustBe: 100,
				},
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(false);
			const cycleErrors = result.errors.filter(
				(e) => e.code === "CIRCULAR_DEPENDENCY",
			);
			expect(cycleErrors.length).toBeGreaterThanOrEqual(2);
		});

		test("should provide actionable suggestion for circular dependency", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [
					{
						id: "task-a",
						title: "Task A",
						estimationPercent: 50,
						dependsOn: ["task-b"],
					},
					{
						id: "task-b",
						title: "Task B",
						estimationPercent: 50,
						dependsOn: ["task-a"],
					},
				],
				validation: {
					totalEstimationMustBe: 100,
				},
			};

			const result = validator.validate(template);
			const cycleError = result.errors.find(
				(e) => e.code === "CIRCULAR_DEPENDENCY",
			);

			expect(cycleError?.suggestion).toBeDefined();
			expect(cycleError?.suggestion).toContain("Remove one of the dependencies");
		});

		test("should handle tasks without IDs (no circular check needed)", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [
					{
						title: "Task A",
						estimationPercent: 50,
					},
					{
						title: "Task B",
						estimationPercent: 50,
					},
				],
				validation: {
					totalEstimationMustBe: 100,
				},
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(true);
			expect(
				result.errors.filter((e) => e.code === "CIRCULAR_DEPENDENCY"),
			).toHaveLength(0);
		});

		test("should detect cycle in longer chain (A → B → C → D → B)", () => {
			const template = {
				version: "1.0",
				name: "Test",
				filter: {},
				tasks: [
					{
						id: "task-a",
						title: "Task A",
						estimationPercent: 25,
						dependsOn: ["task-b"],
					},
					{
						id: "task-b",
						title: "Task B",
						estimationPercent: 25,
						dependsOn: ["task-c"],
					},
					{
						id: "task-c",
						title: "Task C",
						estimationPercent: 25,
						dependsOn: ["task-d"],
					},
					{
						id: "task-d",
						title: "Task D",
						estimationPercent: 25,
						dependsOn: ["task-b"],
					},
				],
				validation: {
					totalEstimationMustBe: 100,
				},
			};

			const result = validator.validate(template);

			expect(result.valid).toBe(false);
			const cycleError = result.errors.find(
				(e) => e.code === "CIRCULAR_DEPENDENCY",
			);
			expect(cycleError).toBeDefined();
			// The cycle should include b → c → d → b
			expect(cycleError?.message).toContain("task-b");
		});
	});
});
