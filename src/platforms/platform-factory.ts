import type {
  IPlatformAdapter,
  PlatformConfig,
  PlatformType,
} from "./interfaces/platform.interface";
import { MockPlatformAdapter } from "./adapters/mock/mock.adapter";
import {
  AzureDevOpsAdapter,
  type AzureDevOpsConfig,
} from "./adapters/azure-devops/azure-devops.adapter";
import { PlatformError } from "@utils/errors";
import { logger } from "@config/logger";

/**
 * Factory for creating platform adapters
 */
export class PlatformFactory {
  /**
   * Create a platform adapter based on type
   */
  static create(type: PlatformType, config?: PlatformConfig): IPlatformAdapter {
    logger.debug(`Creating platform adapter: ${type}`);

    switch (type) {
      case "mock":
        return new MockPlatformAdapter();

      case "azure-devops":
        if (!config) {
          throw new PlatformError(
            "Configuration required for Azure DevOps adapter",
            "azure-devops"
          );
        }
        return new AzureDevOpsAdapter(config as AzureDevOpsConfig);

      case "jira":
        throw new PlatformError(
          "Jira adapter not yet implemented. Coming soon!",
          "jira"
        );

      case "github":
        throw new PlatformError(
          "GitHub adapter not yet implemented. Coming soon!",
          "github"
        );

      default:
        throw new PlatformError(
          `Unknown platform type: ${type}. Supported types: mock, azure-devops, jira, github`,
          type
        );
    }
  }

  /**
   * Create adapter from config object
   */
  static createFromConfig(config: PlatformConfig): IPlatformAdapter {
    return this.create(config.type, config);
  }

  /**
   * Get list of supported platforms
   */
  static getSupportedPlatforms(): PlatformType[] {
    return ["mock", "azure-devops", "jira", "github"];
  }

  /**
   * Get list of implemented platforms
   */
  static getImplementedPlatforms(): PlatformType[] {
    return ["mock", "azure-devops"];
  }

  /**
   * Check if platform is implemented
   */
  static isImplemented(type: PlatformType): boolean {
    return this.getImplementedPlatforms().includes(type);
  }
}
