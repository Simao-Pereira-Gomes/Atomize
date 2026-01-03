import { describe, expect, test } from "bun:test";
import { FilterEngine } from "@core/filter-engine";
import type { FilterCriteria as TemplateFilter } from "@templates/schema";

describe("FilterEngine", () => {
	const engine = new FilterEngine();

	describe("convertFilter", () => {
		test("should convert work item types", () => {
			const templateFilter: TemplateFilter = {
				workItemTypes: ["User Story", "Bug"],
			};

			const platformFilter = engine.convertFilter(templateFilter);

			expect(platformFilter.workItemTypes).toEqual(["User Story", "Bug"]);
		});

		test("should convert states", () => {
			const templateFilter: TemplateFilter = {
				states: ["New", "Active"],
			};

			const platformFilter = engine.convertFilter(templateFilter);

			expect(platformFilter.states).toEqual(["New", "Active"]);
		});

		test("should convert tags with include and exclude", () => {
			const templateFilter: TemplateFilter = {
				tags: {
					include: ["backend", "api"],
					exclude: ["deprecated"],
				},
			};

			const platformFilter = engine.convertFilter(templateFilter);

			expect(platformFilter.tags?.include).toEqual(["backend", "api"]);
			expect(platformFilter.tags?.exclude).toEqual(["deprecated"]);
		});

		test("should convert priority range", () => {
			const templateFilter: TemplateFilter = {
				priority: {
					min: 1,
					max: 3,
				},
			};

			const platformFilter = engine.convertFilter(templateFilter);

			expect(platformFilter.priority?.min).toBe(1);
			expect(platformFilter.priority?.max).toBe(3);
		});

		test("should convert excludeIfHasTasks", () => {
			const templateFilter: TemplateFilter = {
				excludeIfHasTasks: true,
			};

			const platformFilter = engine.convertFilter(templateFilter);

			expect(platformFilter.excludeIfHasTasks).toBe(true);
		});

		test("should handle empty filter", () => {
			const templateFilter: TemplateFilter = {};

			const platformFilter = engine.convertFilter(templateFilter);

			expect(platformFilter).toEqual({});
		});

		test("should convert all fields together", () => {
			const templateFilter: TemplateFilter = {
				workItemTypes: ["User Story"],
				states: ["New"],
				tags: {
					include: ["backend"],
				},
				areaPaths: ["Project\\Backend"],
				iterations: ["Sprint 23"],
				assignedTo: ["john@example.com"],
				priority: {
					min: 1,
					max: 2,
				},
				excludeIfHasTasks: true,
			};

			const platformFilter = engine.convertFilter(templateFilter);

			expect(platformFilter.workItemTypes).toEqual(["User Story"]);
			expect(platformFilter.states).toEqual(["New"]);
			expect(platformFilter.tags?.include).toEqual(["backend"]);
			expect(platformFilter.areaPaths).toEqual(["Project\\Backend"]);
			expect(platformFilter.iterations).toEqual(["Sprint 23"]);
			expect(platformFilter.assignedTo).toEqual(["john@example.com"]);
			expect(platformFilter.priority?.min).toBe(1);
			expect(platformFilter.priority?.max).toBe(2);
			expect(platformFilter.excludeIfHasTasks).toBe(true);
		});
	});

	describe("validateFilter", () => {
		test("should validate filter with criteria", () => {
			const filter: TemplateFilter = {
				states: ["New"],
			};

			const result = engine.validateFilter(filter);

			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		test("should reject empty filter", () => {
			const filter: TemplateFilter = {};

			const result = engine.validateFilter(filter);

			expect(result.valid).toBe(false);
			expect(result.errors).toContain(
				"Filter must have at least one criterion",
			);
		});

		test("should reject empty work item types array", () => {
			const filter: TemplateFilter = {
				workItemTypes: [],
			};

			const result = engine.validateFilter(filter);

			expect(result.valid).toBe(false);
			expect(result.errors).toContain("workItemTypes cannot be empty array");
		});

		test("should reject empty states array", () => {
			const filter: TemplateFilter = {
				states: [],
			};

			const result = engine.validateFilter(filter);

			expect(result.valid).toBe(false);
			expect(result.errors).toContain("states cannot be empty array");
		});
	});

	describe("mergeFilters", () => {
		test("should merge work item types", () => {
			const filters: TemplateFilter[] = [
				{ workItemTypes: ["User Story"] },
				{ workItemTypes: ["Bug"] },
			];

			const merged = engine.mergeFilters(filters);

			expect(merged.workItemTypes).toEqual(["User Story", "Bug"]);
		});

		test("should merge states", () => {
			const filters: TemplateFilter[] = [
				{ states: ["New"] },
				{ states: ["Active", "New"] },
			];

			const merged = engine.mergeFilters(filters);

			expect(merged.states).toEqual(["New", "Active"]);
		});

		test("should merge tags", () => {
			const filters: TemplateFilter[] = [
				{ tags: { include: ["backend"] } },
				{ tags: { include: ["api"], exclude: ["deprecated"] } },
			];

			const merged = engine.mergeFilters(filters);

			expect(merged.tags?.include).toEqual(["backend", "api"]);
			expect(merged.tags?.exclude).toEqual(["deprecated"]);
		});

		test("should remove duplicates", () => {
			const filters: TemplateFilter[] = [
				{ workItemTypes: ["User Story"] },
				{ workItemTypes: ["User Story", "Bug"] },
			];

			const merged = engine.mergeFilters(filters);

			expect(merged.workItemTypes).toEqual(["User Story", "Bug"]);
		});

		test("should use last value for single-value fields", () => {
			const filters: TemplateFilter[] = [
				{ excludeIfHasTasks: false },
				{ excludeIfHasTasks: true },
			];

			const merged = engine.mergeFilters(filters);

			expect(merged.excludeIfHasTasks).toBe(true);
		});
	});
});
