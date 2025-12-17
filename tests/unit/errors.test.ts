import { describe, expect, test } from "bun:test";
import {
  AtomizeError,
  TemplateLoadError,
  TemplateValidationError,
  PlatformError,
  ConfigurationError,
  UnknownError,
} from "@utils/errors";

describe("Error Classes", () => {
  describe("AtomizeError", () => {
    test("should create error with message", () => {
      const error = new UnknownError("Test error");

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AtomizeError);
      expect(error.message).toBe("Test error");
      expect(error.name).toBe("UnknownError");
    });

    test("should have stack trace", () => {
      const error = new UnknownError("Test error");

      expect(error.stack).toBeDefined();
    });
  });

  describe("TemplateLoadError", () => {
    test("should create error with message and file path", () => {
      const error = new TemplateLoadError(
        "Failed to load",
        "/path/to/template.yaml"
      );

      expect(error).toBeInstanceOf(AtomizeError);
      expect(error.message).toBe("Failed to load");
      expect(error.filePath).toBe("/path/to/template.yaml");
      expect(error.name).toBe("TemplateLoadError");
    });

    test("should be catchable as AtomizeError", () => {
      try {
        throw new TemplateLoadError("Test", "/path");
      } catch (error) {
        expect(error).toBeInstanceOf(AtomizeError);
        expect(error).toBeInstanceOf(TemplateLoadError);
      }
    });
  });

  describe("TemplateValidationError", () => {
    test("should create error with message and errors array", () => {
      const errors = ["Error 1", "Error 2"];
      const error = new TemplateValidationError("Validation failed", errors);

      expect(error).toBeInstanceOf(AtomizeError);
      expect(error.message).toBe("Validation failed");
      expect(error.errors).toEqual(errors);
      expect(error.name).toBe("TemplateValidationError");
    });

    test("should handle empty errors array", () => {
      const error = new TemplateValidationError("Validation failed", []);

      expect(error.errors).toEqual([]);
    });

    test("should handle multiple errors", () => {
      const errors = [
        "tasks[0]: Missing title",
        "tasks[1]: Invalid estimation",
        "validation: Total must be 100%",
      ];
      const error = new TemplateValidationError("Multiple errors", errors);

      expect(error.errors).toHaveLength(3);
      expect(error.errors[0]).toBe("tasks[0]: Missing title");
    });
  });

  describe("PlatformError", () => {
    test("should create error with message and platform", () => {
      const error = new PlatformError("Connection failed", "azure-devops");

      expect(error).toBeInstanceOf(AtomizeError);
      expect(error.message).toBe("Connection failed");
      expect(error.platform).toBe("azure-devops");
      expect(error.name).toBe("PlatformError");
    });

    test("should support different platforms", () => {
      const platforms = ["azure-devops", "jira", "github"];

      platforms.forEach((platform) => {
        const error = new PlatformError("Test", platform);
        expect(error.platform).toBe(platform);
      });
    });
  });

  describe("ConfigurationError", () => {
    test("should create error with message", () => {
      const error = new ConfigurationError("Invalid configuration");

      expect(error).toBeInstanceOf(AtomizeError);
      expect(error.message).toBe("Invalid configuration");
      expect(error.name).toBe("ConfigurationError");
    });

    test("should be distinguishable from other errors", () => {
      const configError = new ConfigurationError("Config error");
      const loadError = new TemplateLoadError("Load error", "/path");

      expect(configError).toBeInstanceOf(ConfigurationError);
      expect(configError).not.toBeInstanceOf(TemplateLoadError);
      expect(loadError).not.toBeInstanceOf(ConfigurationError);
    });
  });

  describe("Error Hierarchy", () => {
    test("all custom errors should extend AtomizeError", () => {
      const errors = [
        new TemplateLoadError("Test", "/path"),
        new TemplateValidationError("Test", []),
        new PlatformError("Test", "platform"),
        new ConfigurationError("Test"),
      ];

      errors.forEach((error) => {
        expect(error).toBeInstanceOf(AtomizeError);
        expect(error).toBeInstanceOf(Error);
      });
    });

    test("should be catchable by type", () => {
      let caughtTemplateError = false;
      let caughtAtomizeError = false;

      try {
        throw new TemplateLoadError("Test", "/path");
      } catch (error) {
        if (error instanceof TemplateLoadError) {
          caughtTemplateError = true;
          expect(error.filePath).toBe("/path");
        }
        if (error instanceof AtomizeError) {
          caughtAtomizeError = true;
        }
      }

      expect(caughtTemplateError).toBe(true);
      expect(caughtAtomizeError).toBe(true);
    });
  });
});
