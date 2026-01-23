import { describe, expect, test } from "bun:test";
import {
  generateLargeTemplate,
  generateTemplateWithCycles,
} from "tests/fixtures/generators";
import { measurePerformance } from "tests/utils/perfomance";
import { DependencyResolver } from "../../src/core/dependency-resolver";
import type { TaskDefinition } from "../../src/templates/schema";
import { TemplateValidator } from "../../src/templates/validator";

describe("Validation Performance", () => {
  const validator = new TemplateValidator();
  const dependencyResolver = new DependencyResolver();

  describe("Core Validation Throughput", () => {
    test("should validate 50 tasks < 2ms (avg)", () => {
      const template = generateLargeTemplate(50);

      const avgTime = measurePerformance(() => {
        validator.validate(template);
      });

      expect(validator.validate(template).valid).toBe(true);
      expect(avgTime).toBeLessThan(2);
    });

    test("should validate 200 tasks < 10ms (avg)", () => {
      const template = generateLargeTemplate(200);

      const avgTime = measurePerformance(() => {
        validator.validate(template);
      });

      expect(avgTime).toBeLessThan(10);
    });

    test("should validate 500 tasks < 25ms (avg)", () => {
      const template = generateLargeTemplate(500);

      const avgTime = measurePerformance(() => {
        validator.validate(template);
      }, 50);
      expect(avgTime).toBeLessThan(25);
    });
  });

  describe("Dependency Resolution Speed", () => {
    test("should resolve complex chains for 100 tasks < 5ms", () => {
      const template = generateLargeTemplate(100, { withDependencies: true });
      const tasks = template.tasks as TaskDefinition[];

      const avgTime = measurePerformance(() => {
        dependencyResolver.resolveDependencies(tasks);
      });

      expect(avgTime).toBeLessThan(5);
    });

    test("should build dependency map for 100 tasks < 1ms", () => {
      const template = generateLargeTemplate(100, { withDependencies: true });
      const tasks = template.tasks as TaskDefinition[];

      const avgTime = measurePerformance(() => {
        dependencyResolver.buildDependencyMap(tasks);
      });

      expect(avgTime).toBeLessThan(1);
    });
  });

  describe("Memory & GC Stability", () => {
    test("should maintain stable performance over 1000 iterations", () => {
      const template = generateLargeTemplate(100);

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        validator.validate(template);
      }
      const end = performance.now();

      const avg = (end - start) / 1000;

      // If we had a memory leak, frequent GC pauses would spike this average up.
      expect(avg).toBeLessThan(5);
    });
  });

  describe("Circular Dependency Detection Performance", () => {
    test("should detect cycles in 50 tasks < 3ms (avg)", () => {
      const template = generateTemplateWithCycles(50, 5);

      const avgTime = measurePerformance(() => {
        validator.validate(template);
      });

      const result = validator.validate(template);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.code === "CIRCULAR_DEPENDENCY"),
      ).toBe(true);
      expect(avgTime).toBeLessThan(3);
    });

    test("should detect cycles in 100 tasks < 5ms (avg)", () => {
      const template = generateTemplateWithCycles(100, 5);

      const avgTime = measurePerformance(() => {
        validator.validate(template);
      });

      const result = validator.validate(template);
      expect(result.valid).toBe(false);
      expect(avgTime).toBeLessThan(5);
    });

    test("should detect cycles in 200 tasks < 10ms (avg)", () => {
      const template = generateTemplateWithCycles(200, 10);

      const avgTime = measurePerformance(() => {
        validator.validate(template);
      });

      const result = validator.validate(template);
      expect(result.valid).toBe(false);
      expect(avgTime).toBeLessThan(10);
    });

    test("should validate deep chain (no cycle) for 100 tasks < 5ms", () => {
      const template = generateLargeTemplate(100, { withDeepChain: true });

      const avgTime = measurePerformance(() => {
        validator.validate(template);
      });

      const result = validator.validate(template);
      expect(result.valid).toBe(true);
      expect(avgTime).toBeLessThan(5);
    });

    test("should validate diamond pattern (no cycle) for 100 tasks < 5ms", () => {
      const template = generateLargeTemplate(100, { withDiamondPattern: true });

      const avgTime = measurePerformance(() => {
        validator.validate(template);
      });

      const result = validator.validate(template);
      expect(result.valid).toBe(true);
      expect(avgTime).toBeLessThan(5);
    });
  });
});
