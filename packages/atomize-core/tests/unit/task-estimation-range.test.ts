import { describe, expect, test } from "bun:test";
import { EstimationCalculator } from "@sppg2001/atomize-core/core/estimation-calculator";
import { StoryProcessor } from "@sppg2001/atomize-core/core/story-processor";
import {
	MixinTemplateSchema,
	TaskTemplateSchema,
	ValidationConfigSchema,
} from "@sppg2001/atomize-core/templates/schema";
import {
	parseMockStory,
	runPreview,
} from "@sppg2001/atomize-core/templates/template-inspector";
import { verifyTemplate } from "@sppg2001/atomize-core/templates/template-verification";
import { TemplateValidator } from "@sppg2001/atomize-core/templates/validator";

const condition = { field: "priority", operator: "equals", value: 1 };
const template = (
	tasks: unknown[],
	validation: unknown = { taskEstimationRange: { min: 10, max: 30 } },
) => ({
	name: "Task range",
	filter: {},
	tasks,
	validation,
	estimation: { normalize: "never" },
});
const issues = (tasks: unknown[], validation?: unknown) => {
	const result = TaskTemplateSchema.safeParse(template(tasks, validation));
	return result.success ? [] : result.error.issues;
};

describe("taskEstimationRange", () => {
	test("rejects a supplied task percentage below or above its configured range", () => {
		const errors = issues([
			{ title: "Too small", estimationPercent: 5 },
			{ title: "Too large", estimationPercent: 50 },
		]);
		expect(errors.map((error) => error.path)).toEqual([
			["tasks", 0, "estimationPercent"],
			["tasks", 1, "estimationPercent"],
		]);
		expect(
			errors.every(
				(error) =>
					error.code === "custom" &&
					error.params?.code === "TASK_ESTIMATION_OUT_OF_RANGE",
			),
		).toBe(true);
	});

	test("accepts inclusive bounds, fractional percentages, zero and 100", () => {
		expect(
			issues([
				{ title: "Minimum", estimationPercent: 10 },
				{ title: "Maximum", estimationPercent: 30 },
				{ title: "Fraction", estimationPercent: 10.5 },
			]),
		).toEqual([]);
		expect(
			issues(
				[
					{ title: "Zero", estimationPercent: 0 },
					{ title: "Full", estimationPercent: 100 },
				],
				{ taskEstimationRange: { min: 0, max: 100 } },
			),
		).toEqual([]);
		expect(
			issues([{ title: "Exact", estimationPercent: 20 }], {
				taskEstimationRange: { min: 20, max: 20 },
			}),
		).toEqual([]);
	});

	test("defers conditional overrides until the active allocation is known", () => {
		const errors = issues([
			{
				title: "Variable",
				estimationPercent: 20,
				estimationPercentCondition: [
					{ condition, percent: 40 },
					{ condition, percent: 5 },
				],
			},
		]);
		expect(errors).toEqual([]);
	});

	test("does not reject a fallback that may not be used", () => {
		const errors = issues([
			{
				title: "Conditional",
				condition,
				estimationPercent: 5,
				estimationPercentCondition: [{ condition, percent: 20 }],
			},
		]);
		expect(errors).toEqual([]);
	});

	test("does not invent percentages for unestimated or fixed-estimate tasks", () => {
		expect(
			issues([
				{ title: "Unestimated" },
				{ title: "Fixed", estimationFixed: 1000 },
				{
					title: "Overrides only",
					estimationPercentCondition: [{ condition, percent: 20 }],
				},
			]),
		).toEqual([]);
	});

	test("applies bounds to each repeated copy rather than multiplying its percentage", () => {
		expect(
			issues([{ title: "Copies", estimationPercent: 20, repeat: 3 }]),
		).toEqual([]);
		expect(
			issues([{ title: "Copies", estimationPercent: 50, repeat: 3 }]).map(
				(error) => error.path,
			),
		).toEqual([["tasks", 0, "estimationPercent"]]);
	});

	test("remains opt-in and leaves Mixin checks to the composing Template", () => {
		expect(issues([{ title: "Large", estimationPercent: 50 }], {})).toEqual([]);
		expect(
			MixinTemplateSchema.safeParse({
				name: "Mixin",
				tasks: [{ title: "Large", estimationPercent: 50 }],
			}).success,
		).toBe(true);
	});

	test("rejects a written 20% normalized to 100% and accepts four 50% tasks normalized to 25%", () => {
		const invalid = {
			...template([{ title: "In range", estimationPercent: 20 }]),
			estimation: { normalize: "always" },
		};
		const valid = {
			...template(
				Array.from({ length: 4 }, (_, i) => ({
					title: `Task ${i}`,
					estimationPercent: 50,
				})),
			),
			estimation: { normalize: "always" },
		};
		expect(TaskTemplateSchema.safeParse(valid).success).toBe(true);
		expect(TaskTemplateSchema.safeParse(invalid).success).toBe(false);
		expect(
			(valid.tasks as Array<{ estimationPercent: number }>).every(
				(task) => task.estimationPercent === 50,
			),
		).toBe(true);
	});

	test("checks the percentage rounding remainder for every repeated copy", () => {
		const result = TaskTemplateSchema.safeParse({
			...template([{ title: "Copies", estimationPercent: 20, repeat: 3 }], {
				taskEstimationRange: { min: 33, max: 33 },
			}),
			estimation: { normalize: "always" },
		});
		expect(result.success).toBe(false); // 33, 33, 34, not three identical unrounded shares
	});

	test("Offline and Online Validation both check final allocations", async () => {
		const input = TaskTemplateSchema.parse(
			template([{ title: "Task", estimationPercent: 20 }]),
		);
		input.estimation = {
			strategy: "percentage",
			rounding: "none",
			normalize: "always",
		};
		for (const mode of ["offline", "online"] as const) {
			const result = await verifyTemplate(input, { project: { mode } });
			expect(result.valid).toBe(false);
			expect(
				result.errors.some(
					(error) => error.code === "TASK_ESTIMATION_OUT_OF_RANGE",
				),
			).toBe(true);
		}
	});

	test("preview checks the matching override after normalization and ignores skipped tasks", () => {
		const input = TaskTemplateSchema.parse(
			template([
				{
					title: "Active",
					estimationPercent: 5,
					estimationPercentCondition: [{ condition, percent: 20 }],
				},
				{
					title: "Skipped",
					condition: { ...condition, value: 2 },
					estimationPercent: 90,
				},
			]),
		);
		expect(() =>
			runPreview(input, '{"priority":1,"estimation":10}'),
		).not.toThrow();
		input.estimation = {
			strategy: "percentage",
			rounding: "none",
			normalize: "always",
		};
		expect(() => runPreview(input, '{"priority":1,"estimation":10}')).toThrow(
			"Task allocation violates",
		);
		const validator = new TemplateValidator().validate(input, {
			mode: "strict",
		});
		expect(validator.valid).toBe(true);
		expect(
			validator.warnings.some(
				(warning) =>
					warning.nonBlocking &&
					warning.path === "validation.taskEstimationRange",
			),
		).toBe(true);
	});

	test("runtime applies the caller's normalization choice before checking bounds", () => {
		const calc = new EstimationCalculator();
		const tasks = Array.from({ length: 4 }, (_, i) => ({
			title: `Task ${i}`,
			estimationPercent: 50,
		}));
		const calculate = (forceNormalize: boolean) =>
			calc.calculateTasksWithSkipped(
				parseMockStory('{"estimation":10}'),
				"",
				tasks,
				{ strategy: "percentage", rounding: "none", normalize: "auto" },
				forceNormalize,
				undefined,
				{ min: 10, max: 30 },
			);
		expect(() => calculate(false)).toThrow("Task allocation violates");
		expect(
			calculate(true).calculatedTasks.map((task) => task.estimationPercent),
		).toEqual([25, 25, 25, 25]);
	});

	test("generation rejects an invalid conditional allocation before materializing any Tasks", async () => {
		let materializations = 0;
		const processor = new StoryProcessor(
			{} as never,
			new EstimationCalculator(),
			{
				materialize: async () => {
					materializations++;
					return [];
				},
			} as never,
		);
		const input = TaskTemplateSchema.parse(
			template([
				{
					title: "Conditional",
					estimationPercentCondition: [{ condition, percent: 50 }],
				},
			]),
		);
		await expect(
			processor.process(
				parseMockStory('{"priority":1,"estimation":10}'),
				input.tasks,
				input,
				"",
				{},
				[],
			),
		).rejects.toThrow("Task allocation violates");
		expect(materializations).toBe(0);
	});

	test("authoring validation and preview use the same dependency order for percentage rounding", () => {
		const input = template(
			[
				{ title: "Without ID", estimationPercent: 1 },
				{ id: "b", title: "B", dependsOn: ["a"], estimationPercent: 1 },
				{ id: "a", title: "A", estimationPercent: 1 },
			],
			{ taskEstimationRange: { min: 33, max: 33 } },
		);
		const result = TaskTemplateSchema.safeParse({
			...input,
			estimation: { normalize: "always" },
		});
		expect(result.success).toBe(false);
		if (!result.success)
			expect(result.error.issues[0]?.path).toEqual([
				"tasks",
				0,
				"estimationPercent",
			]);
	});

	test("rejects negative bounds, bounds above 100 and an inverted range", () => {
		for (const range of [
			{ min: -1, max: 20 },
			{ min: 10, max: 101 },
			{ min: 30, max: 10 },
		]) {
			expect(
				ValidationConfigSchema.safeParse({ taskEstimationRange: range })
					.success,
			).toBe(false);
		}
	});

	test("Offline Validation rejects out-of-range percentages in either mode and provides a useful suggestion", () => {
		for (const mode of ["lenient", "strict"] as const) {
			const result = new TemplateValidator().validate(
				template([{ title: "Too large", estimationPercent: 50 }]),
				{ mode },
			);
			expect(result.valid).toBe(false);
			expect(result.errors).toContainEqual(
				expect.objectContaining({
					code: "TASK_ESTIMATION_OUT_OF_RANGE",
					path: "tasks.0.estimationPercent",
					suggestion: expect.stringContaining("10% and 30%"),
				}),
			);
		}
	});
});
