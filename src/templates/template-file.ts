import { readFile } from "node:fs/promises";
import { getErrorMessage, TemplateLoadError } from "@utils/errors";
import { parse as parseYaml } from "yaml";

export async function loadYamlFile(filePath: string): Promise<unknown> {
  try {
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
