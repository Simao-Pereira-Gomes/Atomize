import { readFile } from "fs/promises";
import { parse as parseYaml } from "yaml";
import { resolve } from "path";
import type { TaskTemplate } from "./schema";
import { TemplateLoadError } from "@utils/errors";
import { logger } from "@config/logger";

export class TemplateLoader {
  /**
   * Load a template from a YAML file
   */
  async load(filePath: string): Promise<TaskTemplate> {
    try {
      logger.debug(`Loading template from: ${filePath}`);
      const absolutePath = resolve(filePath);
      const fileContent = await readFile(absolutePath, "utf-8");
      const parsed = parseYaml(fileContent);

      if (!parsed) {
        throw new TemplateLoadError("Template file is empty", absolutePath);
      }

      logger.debug(`Template parsed successfully`);

      return parsed as TaskTemplate;
    } catch (error) {
      if (error instanceof TemplateLoadError) {
        throw error;
      }

      const message = error instanceof Error ? error.message : String(error);
      throw new TemplateLoadError(
        `Failed to load template: ${message}`,
        filePath
      );
    }
  }

  /**
   * Load multiple templates
   */
  async loadMultiple(filePaths: string[]): Promise<TaskTemplate[]> {
    const templates: TaskTemplate[] = [];

    for (const filePath of filePaths) {
      const template = await this.load(filePath);
      templates.push(template);
    }

    return templates;
  }

  /**
   * Check if a file is a valid template without full validation
   */
  async canLoad(filePath: string): Promise<boolean> {
    try {
      await this.load(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
