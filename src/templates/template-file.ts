import { readFile, stat } from "node:fs/promises";
import { getErrorMessage, TemplateLoadError } from "@utils/errors";
import { parse as parseYaml } from "yaml";

export const MAX_TEMPLATE_FILE_BYTES = 512 * 1024; // 512 KB

export async function loadYamlFile(filePath: string): Promise<unknown> {
  try {
    const fileStats = await stat(filePath);
    if (fileStats.size > MAX_TEMPLATE_FILE_BYTES) {
      throw new TemplateLoadError(
        `Template file too large (${fileStats.size} bytes). Maximum allowed: ${MAX_TEMPLATE_FILE_BYTES / 1024} KB.`,
        filePath,
      );
    }

    const content = await readFile(filePath, "utf-8");
    const parsed = parseYaml(content);
    if (!parsed) {
      throw new TemplateLoadError("File is empty", filePath);
    }
    return parsed;
  } catch (error) {
    if (error instanceof TemplateLoadError) throw error;
    const message = getErrorMessage(error);
    throw new TemplateLoadError(`Failed to load file: ${message}`, filePath);
  }
}
