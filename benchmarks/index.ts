import { run } from "mitata";
import { registerValidationBenchmarks } from "./validation.bench";
import { registerDependencyBenchmarks } from "./dependencies.bench";

registerValidationBenchmarks();
registerDependencyBenchmarks();

const isCI = process.env.CI === "true";

if (!isCI) {
  console.log("Starting Benchmarks...\n");
}

await run({
  format: isCI ? "json" : "mitata",
});
