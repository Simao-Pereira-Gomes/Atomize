import { readdir, readFile } from "fs/promises";
import { join, resolve, dirname } from "path";
import { parse as parseYaml } from "yaml";
import type { TaskTemplate } from "@templates/schema";
import { logger } from "@config/logger";
import {
  EMBEDDED_PRESETS,
  PRESET_NAMES,
  type PresetName,
} from "./embedded-presets";

export interface PresetInfo {
  name: string;
  displayName: string;
  description: string;
  path: string;
}

/**
 * Preset Manager
 * Handles loading and managing template presets
 * Uses hybrid approach: embedded presets + file-based presets
 */
export class PresetManager {
  private presetsDir: string;

  constructor(presetsDir?: string) {
    if (presetsDir) {
      this.presetsDir = presetsDir;
    } else {
      const packageRoot = this.findPackageRoot();
      this.presetsDir = resolve(packageRoot, "templates", "presets");
    }
  }

  /**
   * Find the package root by looking for package.json
   * Works whether running from source or installed via npm
   */
  private findPackageRoot(): string {
    let currentDir = __dirname;

    while (currentDir !== dirname(currentDir)) {
      try {
        const fs = require("fs");
        const pkgPath = resolve(currentDir, "package.json");
        if (fs.existsSync(pkgPath)) {
          return currentDir;
        }
      } catch {}
      currentDir = dirname(currentDir);
    }

    // Fallback to current working directory
    return process.cwd();
  }

  /**
   * List all available presets (embedded + file-based)
   */
  async listPresets(): Promise<PresetInfo[]> {
    const presets: PresetInfo[] = [];
    const seenNames = new Set<string>();

    for (const name of PRESET_NAMES) {
      try {
        const template = await this.loadPreset(name);
        presets.push({
          name,
          displayName: template.name,
          description: template.description || "No description",
          path: "<embedded>",
        });
        seenNames.add(name);
      } catch (error) {
        logger.warn(`Failed to load embedded preset ${name}`, { error });
      }
    }

    try {
      const files = await readdir(this.presetsDir);
      const yamlFiles = files.filter(
        (f) => f.endsWith(".yaml") || f.endsWith(".yml")
      );

      for (const file of yamlFiles) {
        const name = file.replace(/\.ya?ml$/, "");

        if (seenNames.has(name)) {
          continue;
        }

        try {
          const path = join(this.presetsDir, file);
          const content = await readFile(path, "utf-8");
          const template = parseYaml(content) as TaskTemplate;

          presets.push({
            name,
            displayName: template.name,
            description: template.description || "No description",
            path,
          });
          seenNames.add(name);
        } catch (error) {
          logger.warn(`Failed to load preset file ${file}`, { error });
        }
      }
    } catch (error) {
      // Directory doesn't exist or can't be read
      logger.debug(
        "Presets directory not accessible, using embedded presets only",
        {
          error,
        }
      );
    }

    return presets;
  }

  /**
   * Load a specific preset
   * Tries embedded presets first, then file-based
   */
  async loadPreset(name: string): Promise<TaskTemplate> {
    if (name in EMBEDDED_PRESETS) {
      const yaml = EMBEDDED_PRESETS[name as PresetName];
      const template = parseYaml(yaml) as TaskTemplate;
      logger.debug(`Loaded embedded preset: ${name}`);
      return template;
    }

    try {
      const path = join(this.presetsDir, `${name}.yaml`);
      const content = await readFile(path, "utf-8");
      const template = parseYaml(content) as TaskTemplate;
      logger.debug(`Loaded file-based preset: ${name}`);
      return template;
    } catch (error) {
      throw new Error(
        `Preset "${name}" not found. Available presets: ${PRESET_NAMES.join(
          ", "
        )}`
      );
    }
  }

  /**
   * Check if a preset exists
   */
  async presetExists(name: string): Promise<boolean> {
    // Check embedded first
    if (name in EMBEDDED_PRESETS) {
      return true;
    }

    // Check file-based
    try {
      const presets = await this.listPresets();
      return presets.some((p) => p.name === name);
    } catch {
      return false;
    }
  }

  /**
   * Get preset names for selection
   */
  async getPresetChoices(): Promise<Array<{ name: string; value: string }>> {
    const presets = await this.listPresets();

    return presets.map((preset) => ({
      name: `${preset.displayName} - ${preset.description}`,
      value: preset.name,
    }));
  }
}
