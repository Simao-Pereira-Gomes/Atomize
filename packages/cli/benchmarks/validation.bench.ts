import { bench, group } from "mitata";
import { TemplateValidator } from "../src/templates/validator";
import { generateLargeTemplate } from "../tests/fixtures/generators";

export function registerValidationBenchmarks() {
  const validator = new TemplateValidator();

  // Pre-generate data
  const t50 = generateLargeTemplate(50);
  const t100 = generateLargeTemplate(100);
  const t200 = generateLargeTemplate(200);
  const t500 = generateLargeTemplate(500);

  group("Core Validation Logic", () => {
    bench("Validate 50 tasks", () => {
      validator.validate(t50);
    });

    bench("Validate 100 tasks", () => {
      validator.validate(t100);
    });

    bench("Validate 200 tasks", () => {
      validator.validate(t200);
    });

    bench("Validate 500 tasks", () => {
      validator.validate(t500);
    });
  });
}
