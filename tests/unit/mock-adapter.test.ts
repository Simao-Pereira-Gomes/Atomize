import { beforeEach, describe, expect, test } from "bun:test";
import { MockPlatformAdapter } from "@platforms/adapters/mock/mock.adapter";
import type { FilterCriteria } from "@platforms/interfaces/filter.interface";

describe("MockPlatformAdapter", () => {
	let adapter: MockPlatformAdapter;

	beforeEach(() => {
		adapter = new MockPlatformAdapter();
	});

	describe("authentication", () => {
		test("should authenticate successfully", async () => {
			await adapter.authenticate();

			const metadata = adapter.getPlatformMetadata();
			expect(metadata.connected).toBe(true);
		});

		test("should throw error if not authenticated", async () => {
			const filter: FilterCriteria = { states: ["New"] };

			await expect(adapter.queryWorkItems(filter)).rejects.toThrow(
				"Not authenticated",
			);
		});
	});

	describe("queryWorkItems", () => {
		beforeEach(async () => {
			await adapter.authenticate();
		});

		test("should return all mock stories without filter", async () => {
			const results = await adapter.queryWorkItems({});

			expect(results.length).toBeGreaterThan(0);
			expect(results[0]).toHaveProperty("id");
			expect(results[0]).toHaveProperty("title");
			expect(results[0]).toHaveProperty("type");
		});

		test("should filter by work item type", async () => {
			const filter: FilterCriteria = {
				workItemTypes: ["User Story"],
			};

			const results = await adapter.queryWorkItems(filter);

			expect(results.every((item) => item.type === "User Story")).toBe(true);
		});

		test("should filter by state", async () => {
			const filter: FilterCriteria = {
				states: ["New"],
			};

			const results = await adapter.queryWorkItems(filter);

			expect(results.every((item) => item.state === "New")).toBe(true);
			expect(results.length).toBeGreaterThan(0);
		});

		test("should filter by tags (include)", async () => {
			const filter: FilterCriteria = {
				tags: {
					include: ["backend"],
				},
			};

			const results = await adapter.queryWorkItems(filter);

			expect(results.every((item) => item.tags?.includes("backend"))).toBe(
				true,
			);
			expect(results.length).toBeGreaterThan(0);
		});

		test("should filter by tags (exclude)", async () => {
			const filter: FilterCriteria = {
				tags: {
					exclude: ["frontend"],
				},
			};

			const results = await adapter.queryWorkItems(filter);

			expect(results.every((item) => !item.tags?.includes("frontend"))).toBe(
				true,
			);
		});

		test("should filter by tags (include and exclude)", async () => {
			const filter: FilterCriteria = {
				tags: {
					include: ["backend"],
					exclude: ["database"],
				},
			};

			const results = await adapter.queryWorkItems(filter);

			expect(
				results.every((item) => {
					return (
						item.tags?.includes("backend") && !item.tags?.includes("database")
					);
				}),
			).toBe(true);
		});

		test("should exclude stories with existing tasks", async () => {
			const filter: FilterCriteria = {
				excludeIfHasTasks: true,
			};

			const results = await adapter.queryWorkItems(filter);

			expect(
				results.every((item) => !item.children || item.children.length === 0),
			).toBe(true);
		});

		test("should filter by multiple criteria", async () => {
			const filter: FilterCriteria = {
				workItemTypes: ["User Story"],
				states: ["New"],
				tags: {
					include: ["backend"],
				},
			};

			const results = await adapter.queryWorkItems(filter);

			expect(
				results.every((item) => {
					return (
						item.type === "User Story" &&
						item.state === "New" &&
						item.tags?.includes("backend")
					);
				}),
			).toBe(true);
		});

		test("should apply limit", async () => {
			const filter: FilterCriteria = {
				limit: 3,
			};

			const results = await adapter.queryWorkItems(filter);

			expect(results.length).toBeLessThanOrEqual(3);
		});

		test("should filter by priority range", async () => {
			const filter: FilterCriteria = {
				priority: {
					min: 1,
					max: 2,
				},
			};

			const results = await adapter.queryWorkItems(filter);

			expect(
				results.every((item) => {
					const priority = item.priority || 999;
					return priority >= 1 && priority <= 2;
				}),
			).toBe(true);
		});
	});

	describe("getWorkItem", () => {
		beforeEach(async () => {
			await adapter.authenticate();
		});

		test("should get work item by ID", async () => {
			const item = await adapter.getWorkItem("STORY-001");

			expect(item).not.toBeNull();
			expect(item?.id).toBe("STORY-001");
			expect(item?.title).toBeDefined();
		});

		test("should return null for non-existent ID", async () => {
			const item = await adapter.getWorkItem("STORY-999");

			expect(item).toBeNull();
		});
	});

	describe("createTask", () => {
		beforeEach(async () => {
			await adapter.authenticate();
		});

		test("should create a single task", async () => {
			const task = {
				title: "Test Task",
				description: "Test description",
				estimation: 3,
				tags: ["test"],
			};

			const created = await adapter.createTask("STORY-001", task);

			expect(created.id).toMatch(/^TASK-\d+$/);
			expect(created.title).toBe("Test Task");
			expect(created.type).toBe("Task");
			expect(created.state).toBe("New");
			expect(created.estimation).toBe(3);
			expect(created.parentId).toBe("STORY-001");
		});

		test("should assign task properties correctly", async () => {
			const task = {
				title: "Assigned Task",
				assignTo: "developer@company.com",
				priority: 1,
				tags: ["urgent"],
			};

			const created = await adapter.createTask("STORY-001", task);

			expect(created.assignedTo).toBe("developer@company.com");
			expect(created.priority).toBe(1);
			expect(created.tags).toContain("urgent");
		});
	});

	describe("createTasksBulk", () => {
		beforeEach(async () => {
			await adapter.authenticate();
		});

		test("should create multiple tasks", async () => {
			const tasks = [
				{ title: "Task 1", estimation: 2 },
				{ title: "Task 2", estimation: 3 },
				{ title: "Task 3", estimation: 5 },
			];

			const created = await adapter.createTasksBulk("STORY-001", tasks);

			expect(created).toHaveLength(3);
			expect(created[0]?.title).toBe("Task 1");
			expect(created[1]?.title).toBe("Task 2");
			expect(created[2]?.title).toBe("Task 3");
		});

		test("should assign unique IDs to all tasks", async () => {
			const tasks = [
				{ title: "Task A" },
				{ title: "Task B" },
				{ title: "Task C" },
			];

			const created = await adapter.createTasksBulk("STORY-001", tasks);

			const ids = created.map((t) => t.id);
			const uniqueIds = new Set(ids);

			expect(uniqueIds.size).toBe(tasks.length);
		});
	});

	describe("getChildren", () => {
		beforeEach(async () => {
			await adapter.authenticate();
		});

		test("should get children for parent", async () => {
			// Create some tasks first
			const tasks = [{ title: "Child 1" }, { title: "Child 2" }];

			await adapter.createTasksBulk("STORY-001", tasks);

			const children = await adapter.getChildren("STORY-001");

			expect(children.length).toBeGreaterThanOrEqual(2);
			expect(children.every((c) => c.parentId === "STORY-001")).toBe(true);
		});

		test("should return empty array for parent with no children", async () => {
			const children = await adapter.getChildren("STORY-999");

			expect(children).toEqual([]);
		});
	});

	describe("updateWorkItem", () => {
		beforeEach(async () => {
			await adapter.authenticate();
		});

		test("should update work item", async () => {
			// Create a task first
			const task = { title: "Original Title" };
			const created = await adapter.createTask("STORY-001", task);

			// Update it
			const updated = await adapter.updateWorkItem(created.id, {
				title: "Updated Title",
				state: "In Progress",
			});

			expect(updated.title).toBe("Updated Title");
			expect(updated.state).toBe("In Progress");
		});

		test("should throw error for non-existent work item", async () => {
			await expect(
				adapter.updateWorkItem("TASK-999", { title: "New Title" }),
			).rejects.toThrow("not found");
		});
	});

	describe("deleteWorkItem", () => {
		beforeEach(async () => {
			await adapter.authenticate();
		});

		test("should delete work item", async () => {
			// Create a task first
			const task = { title: "To Delete" };
			const created = await adapter.createTask("STORY-001", task);

			// Delete it
			const deleted = await adapter.deleteWorkItem(created.id);

			expect(deleted).toBe(true);

			// Verify it's gone
			const children = await adapter.getChildren("STORY-001");
			expect(children.find((c) => c.id === created.id)).toBeUndefined();
		});

		test("should return false for non-existent work item", async () => {
			const deleted = await adapter.deleteWorkItem("TASK-999");

			expect(deleted).toBe(false);
		});
	});

	describe("getPlatformMetadata", () => {
		test("should return metadata", () => {
			const metadata = adapter.getPlatformMetadata();

			expect(metadata.name).toBe("Mock Platform");
			expect(metadata.version).toBe("1.0.0");
			expect(metadata.features).toBeDefined();
		});

		test("should show connected status after authentication", async () => {
			let metadata = adapter.getPlatformMetadata();
			expect(metadata.connected).toBe(false);

			await adapter.authenticate();

			metadata = adapter.getPlatformMetadata();
			expect(metadata.connected).toBe(true);
		});
	});

	describe("testConnection", () => {
		test("should test connection successfully", async () => {
			const result = await adapter.testConnection();

			expect(result).toBe(true);
		});
	});

	describe("reset", () => {
		test("should reset adapter state", async () => {
			await adapter.authenticate();

			const tasks = [{ title: "Task 1" }];
			await adapter.createTasksBulk("STORY-001", tasks);

			adapter.reset();

			expect(adapter.getPlatformMetadata().connected).toBe(false);
			expect(adapter.getCreatedTasks()).toHaveLength(0);
		});
	});
});
