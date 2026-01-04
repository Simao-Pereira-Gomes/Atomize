import { describe, expect, test } from "bun:test";
import { MockPlatformAdapter } from "@platforms/adapters/mock/mock.adapter";
import { PlatformFactory } from "@platforms/platform-factory";
import { PlatformError } from "@utils/errors";

describe("PlatformFactory", () => {
	describe("create", () => {
		test("should create mock adapter", () => {
			const adapter = PlatformFactory.create("mock");

			expect(adapter).toBeInstanceOf(MockPlatformAdapter);
		});

		test("should throw error for azure-devops (not yet implemented)", () => {
			expect(() => PlatformFactory.create("azure-devops")).toThrow(
				PlatformError,
			);
			expect(() => PlatformFactory.create("azure-devops")).toThrow(
				"Configuration required for Azure DevOps adapter",
			);
		});

		test("should throw error for jira (not yet implemented)", () => {
			expect(() => PlatformFactory.create("jira")).toThrow(PlatformError);
			expect(() => PlatformFactory.create("jira")).toThrow(
				"not yet implemented",
			);
		});

		test("should throw error for github (not yet implemented)", () => {
			expect(() => PlatformFactory.create("github")).toThrow(PlatformError);
			expect(() => PlatformFactory.create("github")).toThrow(
				"not yet implemented",
			);
		});

		test("should throw error for unknown platform", () => {
			// @ts-expect-error Testing invalid platform type
			expect(() => PlatformFactory.create("invalid")).toThrow(PlatformError);
			// @ts-expect-error Testing invalid platform type
			expect(() => PlatformFactory.create("invalid")).toThrow(
				"Unknown platform type",
			);
		});
	});

	describe("createFromConfig", () => {
		test("should create adapter from config", () => {
			const config = {
				type: "mock" as const,
				project: "TestProject",
			};

			const adapter = PlatformFactory.createFromConfig(config);

			expect(adapter).toBeInstanceOf(MockPlatformAdapter);
		});
	});

	describe("getSupportedPlatforms", () => {
		test("should return list of supported platforms", () => {
			const platforms = PlatformFactory.getSupportedPlatforms();

			expect(platforms).toContain("mock");
			expect(platforms).toContain("azure-devops");
			expect(platforms).toContain("jira");
			expect(platforms).toContain("github");
			expect(platforms.length).toBe(4);
		});
	});

	describe("getImplementedPlatforms", () => {
		test("should return list of implemented platforms", () => {
			const platforms = PlatformFactory.getImplementedPlatforms();

			expect(platforms).toContain("mock");
			expect(platforms).toContain("azure-devops");
			expect(platforms.length).toBe(2);
		});
	});

	describe("isImplemented", () => {
		test("should return true for mock platform", () => {
			expect(PlatformFactory.isImplemented("mock")).toBe(true);
		});

		test("should return true for azure-devops", () => {
			expect(PlatformFactory.isImplemented("azure-devops")).toBe(true);
		});

		test("should return false for jira", () => {
			expect(PlatformFactory.isImplemented("jira")).toBe(false);
		});

		test("should return false for github", () => {
			expect(PlatformFactory.isImplemented("github")).toBe(false);
		});
	});
});
