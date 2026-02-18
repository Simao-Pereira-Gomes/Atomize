import { cancel, confirm, isCancel, password, text } from "@clack/prompts";
import type { AzureDevOpsConfig } from "@platforms/adapters/azure-devops/azure-devops.adapter";
import { ConfigurationError } from "@utils/errors";

function assertNotCancelled<T>(value: T): Exclude<T, symbol> {
	if (isCancel(value)) {
		cancel("Operation cancelled.");
		process.exit(0);
	}
	return value as Exclude<T, symbol>;
}

/**
 * Validate Azure DevOps configuration
 */
export function validateAzureDevOpsConfig(
	config: Partial<AzureDevOpsConfig>,
): void {
	const errors: string[] = [];

	if (!config.organizationUrl) {
		errors.push("organizationUrl is required");
	} else if (!config.organizationUrl.startsWith("https://")) {
		errors.push("organizationUrl must start with https://");
	}

	if (!config.project || config.project.trim() === "") {
		errors.push("project is required and cannot be empty");
	}

	if (!config.token || config.token.trim() === "") {
		errors.push("token (PAT) is required and cannot be empty");
	}

	if (errors.length > 0) {
		throw new ConfigurationError(
			`Invalid Azure DevOps configuration: ${errors.join(", ")}`,
		);
	}
}

/**
 * Create Azure DevOps configuration from explicit values
 */
export function createAzureDevOpsConfig(
	organizationUrl: string,
	project: string,
	token: string,
	team?: string,
): AzureDevOpsConfig {
	const config: AzureDevOpsConfig = {
		type: "azure-devops",
		organizationUrl,
		project,
		token,
		team,
	};

	validateAzureDevOpsConfig(config);

	return config;
}

/**
 * Load Azure DevOps configuration from environment variables
 */
export function loadFromEnv(): AzureDevOpsConfig {
	const organizationUrl = process.env.AZURE_DEVOPS_ORG_URL;
	const project = process.env.AZURE_DEVOPS_PROJECT;
	const token = process.env.AZURE_DEVOPS_PAT;
	if (!organizationUrl) {
		throw new ConfigurationError(
			"AZURE_DEVOPS_ORG_URL environment variable is required. Example: https://dev.azure.com/myorg",
		);
	}

	if (!project) {
		throw new ConfigurationError(
			"AZURE_DEVOPS_PROJECT environment variable is required. Example: MyProject",
		);
	}

	if (!token) {
		throw new ConfigurationError(
			"AZURE_DEVOPS_PAT environment variable is required. Get a PAT from: https://dev.azure.com/[org]/_usersSettings/tokens",
		);
	}

	return createAzureDevOpsConfig(
		organizationUrl,
		project,
		token,
		process.env.AZURE_DEVOPS_TEAM,
	);
}

/**
 * Prompt user for Azure DevOps configuration interactively
 */
export async function promptForConfig(): Promise<AzureDevOpsConfig> {
	const organizationUrl = assertNotCancelled(
		await text({
			message: "Azure DevOps Organization URL:",
			validate: (input: string): string | undefined => {
				if (!input) return "Organization URL is required";
				if (!input.startsWith("https://")) return "URL must start with https://";
				return undefined;
			},
		}),
	);

	const project = assertNotCancelled(
		await text({
			message: "Project name:",
			validate: (input: string): string | undefined => {
				if (!input || input.trim() === "") return "Project name is required";
				return undefined;
			},
		}),
	);

	const token = assertNotCancelled(
		await password({
			message: "Personal Access Token:",
			validate: (input: string): string | undefined => {
				if (!input || input.trim() === "") return "PAT is required";
				return undefined;
			},
		}),
	);

	const team = assertNotCancelled(
		await text({
			message: "Team name (optional):",
		}),
	);

	return createAzureDevOpsConfig(
		organizationUrl,
		project,
		token,
		team || undefined,
	);
}

/**
 * Load Azure DevOps configuration with automatic fallback
 * Tries environment variables first, prompts user if not available
 */
export async function getAzureDevOpsConfig(options?: {
	useEnv?: boolean;
	promptIfMissing?: boolean;
}): Promise<AzureDevOpsConfig> {
	const { useEnv = true, promptIfMissing = true } = options || {};

	if (useEnv) {
		try {
			return loadFromEnv();
		} catch (error) {
			if (!promptIfMissing) {
				throw error;
			}
		}
	}

	if (promptIfMissing) {
		return promptForConfig();
	}

	throw new ConfigurationError(
		"Azure DevOps configuration not available. Please set environment variables or provide configuration.",
	);
}

/**
 * Load Azure DevOps configuration with interactive choice
 * Asks user whether to use env vars or manual input
 */
export async function getAzureDevOpsConfigInteractive(): Promise<AzureDevOpsConfig> {
	const useEnv = assertNotCancelled(
		await confirm({
			message: "Load Azure DevOps configuration from environment variables?",
			initialValue: true,
		}),
	);

	if (useEnv) {
		return loadFromEnv();
	}

	return promptForConfig();
}
