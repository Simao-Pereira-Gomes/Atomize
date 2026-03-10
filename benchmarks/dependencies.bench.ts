import { bench, group } from "mitata";
import { DependencyResolver } from "../src/core/dependency-resolver";
import type { TaskDefinition } from "../src/templates/schema";
import { generateLargeTemplate } from "../tests/fixtures/generators";

export function registerDependencyBenchmarks() {
  const resolver = new DependencyResolver();

  // Pre-generate and extract tasks
  const tasks100 = generateLargeTemplate(100, { withDependencies: true })
    .tasks as TaskDefinition[];
  const tasks500 = generateLargeTemplate(500, { withDependencies: true })
    .tasks as TaskDefinition[];

  group("Dependency Resolution", () => {
    bench("Resolve 100 tasks (Chain)", () => {
      resolver.resolveDependencies(tasks100);
    });

    bench("Resolve 500 tasks (Chain)", () => {
      resolver.resolveDependencies(tasks500);
    });

    bench("Build Map 500 tasks", () => {
      resolver.buildDependencyMap(tasks500);
    });
  });
}
