import type {
  IPlatformAdapter,
  PlatformConfig,
  PlatformType,
} from "./interfaces/platform.interface";
import { MockPlatformAdapter } from "./adapters/mock/mock.adapter";
import { PlatformError } from "@utils/errors";
import { logger } from "@config/logger";
import { match, P } from "ts-pattern";

/**
 * Factory for creating platform adapters
 */
export class PlatformFactory {
  /**
   * Create a platform adapter based on type
   */
  static create(
    type: PlatformType,
    _config?: PlatformConfig
  ): IPlatformAdapter {
    logger.debug(`Creating platform adapter: ${type}`);
    return match(type)
      .with(P.union("azure-devops", "jira", "github"), (platform) => {
        throw new PlatformError(
          `${
            platform.charAt(0).toUpperCase() + platform.slice(1)
          } adapter not yet implemented`,
          platform
        );
      })
      .with("mock", () => new MockPlatformAdapter())
      .otherwise((unknown) => {
        throw new PlatformError(
          `Unknown platform type: ${unknown}. Supported types: mock, azure-devops, jira, github`,
          unknown
        );
      });
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
    return ["mock"];
  }

  /**
   * Check if platform is implemented
   */
  static isImplemented(type: PlatformType): boolean {
    return this.getImplementedPlatforms().includes(type);
  }
}
