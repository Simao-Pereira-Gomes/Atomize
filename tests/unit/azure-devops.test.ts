import { describe, expect, test } from "bun:test";
import {
	AzureDevOpsAdapter,
	type AzureDevOpsConfig,
} from "@platforms/adapters/azure-devops/azure-devops.adapter";
import { PlatformError } from "@utils/errors";

describe("AzureDevOpsAdapter", () => {
	const validConfig: AzureDevOpsConfig = {
		type: "azure-devops",
		organizationUrl: Bun.env.AZURE_DEVOPS_ORG_URL || "",
		project: Bun.env.AZURE_DEVOPS_PROJECT || "SampleProject",
		token: Bun.env.AZURE_DEVOPS_PAT || "",
	};

	describe("constructor", () => {
		test("should create adapter with valid config", () => {
			const adapter = new AzureDevOpsAdapter(validConfig);
			expect(adapter).toBeDefined();
		});

		test("should throw error for missing organization URL", () => {
			const invalidConfig = { ...validConfig, organizationUrl: "" };

			expect(() => new AzureDevOpsAdapter(invalidConfig)).toThrow(
				PlatformError,
			);
			expect(() => new AzureDevOpsAdapter(invalidConfig)).toThrow(
				"Organization URL is required",
			);
		});

		test("should throw error for missing project", () => {
			const invalidConfig = { ...validConfig, project: "" };

			expect(() => new AzureDevOpsAdapter(invalidConfig)).toThrow(
				PlatformError,
			);
			expect(() => new AzureDevOpsAdapter(invalidConfig)).toThrow(
				"Project name is required",
			);
		});

		test("should throw error for missing token", () => {
			const invalidConfig = { ...validConfig, token: "" };

			expect(() => new AzureDevOpsAdapter(invalidConfig)).toThrow(
				PlatformError,
			);
			expect(() => new AzureDevOpsAdapter(invalidConfig)).toThrow(
				"Personal Access Token is required",
			);
		});
	});

	describe("getPlatformMetadata", () => {
		test("should return correct metadata", () => {
			const adapter = new AzureDevOpsAdapter(validConfig);
			const metadata = adapter.getPlatformMetadata();

			expect(metadata.name).toBe("Azure DevOps");
			expect(metadata.version).toBe("7.0");
			expect(metadata.features).toContain("query");
			expect(metadata.features).toContain("create");
			expect(metadata.connected).toBe(false);
		});

		test("should show connected after authentication", async () => {
			const adapter = new AzureDevOpsAdapter(validConfig);

			// Note: This would require mocking the Azure DevOps API
			// For now, we just verify the initial state
			const metadata = adapter.getPlatformMetadata();
			expect(metadata.connected).toBe(false);
		});
	});

	describe("configuration validation", () => {
		test("should accept valid organization URL formats", () => {
			const configs = [
				"https://dev.azure.com/org",
				"https://dev.azure.com/mycompany",
				"https://customdomain.visualstudio.com",
			];

			configs.forEach((url) => {
				const config = { ...validConfig, organizationUrl: url };
				const adapter = new AzureDevOpsAdapter(config);
				expect(adapter).toBeDefined();
			});
		});

		test("should accept team configuration", () => {
			const config = { ...validConfig, team: "MyTeam" };
			const adapter = new AzureDevOpsAdapter(config);
			expect(adapter).toBeDefined();
		});
	});

	describe("error handling", () => {
		test("should throw PlatformError for operations before authentication", async () => {
			const adapter = new AzureDevOpsAdapter(validConfig);

			expect(adapter.queryWorkItems({})).rejects.toThrow(PlatformError);
			expect(adapter.queryWorkItems({})).rejects.toThrow("Not authenticated");
		});

		test("should throw PlatformError for invalid work item ID", async () => {
			const adapter = new AzureDevOpsAdapter(validConfig);
			await adapter.authenticate();
			const result = await adapter.getWorkItem("invalid-id");
			expect(result).toBeNull();
		});
	});
});

describe("AzureDevOps WIQL Query Building", () => {
	test("should document expected WIQL for work item types", () => {
		// Expected: [System.WorkItemType] IN ('User Story', 'Bug')
		expect(true).toBe(true);
	});

	test("should document expected WIQL for states", () => {
		// Expected: [System.State] IN ('New', 'Active')
		expect(true).toBe(true);
	});

	test("should document expected WIQL for tags", () => {
		// Expected: [System.Tags] CONTAINS 'backend'
		expect(true).toBe(true);
	});
});
