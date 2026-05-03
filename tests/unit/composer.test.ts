import { describe, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { TemplateCatalog } from "@services/template/template-catalog";
import { TemplateResolver } from "@services/template/template-resolver";
import { MAX_INHERITANCE_DEPTH, TemplateComposer } from "@templates/composer";
import { TemplateLoader } from "@templates/loader";
import { TemplateCompositionError } from "@utils/errors";
import { expectToReject } from "../utils/matchers";

const fixturesPath = resolve(__dirname, "../fixtures/templates");

describe("TemplateComposer", () => {
  const composer = new TemplateComposer();

  describe("resolve — no composition", () => {
    test("returns template unchanged when no extends or mixins", async () => {
      const raw = {
        version: "1.0",
        name: "Plain Template",
        filter: { workItemTypes: ["User Story"] },
        tasks: [{ title: "Task 1", estimationPercent: 100 }],
      };
      const result = await composer.resolve(raw, "/some/path/template.yaml");
      expect(result).toEqual(raw);
    });
  });

  describe("resolve — extends", () => {
    test("loads and merges base template fields", async () => {
      const basePath = resolve(fixturesPath, "base-template.yaml");
      const raw = {
        extends: basePath,
        name: "Child",
        description: "Child description",
      };

      const result = await composer.resolve(raw, "/any/context.yaml");

      expect(result.name).toBe("Child");
      expect(result.description).toBe("Child description");
      expect(result.filter.workItemTypes).toEqual(["User Story"]);
      expect(result.tasks).toHaveLength(3);
    });

    test("child task with same id overrides base task", async () => {
      const basePath = resolve(fixturesPath, "base-template.yaml");
      const raw = {
        extends: basePath,
        name: "Child",
        tasks: [
          {
            id: "design",
            title: "Custom Design",
            estimationPercent: 15,
          },
        ],
      };

      const result = await composer.resolve(raw, "/any/context.yaml");

      const designTask = result.tasks.find((t) => t.id === "design");
      expect(designTask?.title).toBe("Custom Design");
      expect(designTask?.estimationPercent).toBe(15);
      expect(result.tasks).toHaveLength(3);
    });

    test("child tasks without id are appended to base tasks", async () => {
      const basePath = resolve(fixturesPath, "base-template.yaml");
      const raw = {
        extends: basePath,
        name: "Child",
        tasks: [{ title: "New Task", estimationPercent: 10 }],
      };

      const result = await composer.resolve(raw, "/any/context.yaml");

      expect(result.tasks).toHaveLength(4);
      expect(result.tasks[3]?.title).toBe("New Task");
    });

    test("merges and deduplicates tags", async () => {
      const basePath = resolve(fixturesPath, "base-template.yaml");
      const raw = {
        extends: basePath,
        name: "Child",
        tags: ["child", "base"],
      };

      const result = await composer.resolve(raw, "/any/context.yaml");

      expect(result.tags).toContain("base");
      expect(result.tags).toContain("child");
      expect(result.tags).toContain("shared");
      const tags = result.tags;
      if (!tags) {
        throw new Error("Expected composed template tags to be defined");
      }
      const unique = new Set(tags);
      expect(unique.size).toBe(tags.length);
    });

    test("child filter replaces base filter entirely", async () => {
      const basePath = resolve(fixturesPath, "base-template.yaml");
      const raw = {
        extends: basePath,
        name: "Child",
        filter: { workItemTypes: ["Bug"] },
      };

      const result = await composer.resolve(raw, "/any/context.yaml");

      expect(result.filter.workItemTypes).toEqual(["Bug"]);
      expect(result.filter.states).toBeUndefined();
    });

    test("throws TemplateCompositionError for circular extends", async () => {
      const circularA = resolve(fixturesPath, "circular-a.yaml");
      const loader = new TemplateLoader();

      await expectToReject(loader.load(circularA), TemplateCompositionError);
    });

    test("resolves relative paths from context", async () => {
      const childPath = resolve(fixturesPath, "child-template.yaml");
      const loader = new TemplateLoader();
      const result = await loader.load(childPath);

      expect(result.name).toBe("Child Template");
      expect(result.filter.workItemTypes).toEqual(["User Story"]);
    });
  });

  describe("resolve — mixins", () => {
    test("mixin tasks are merged into composed template", async () => {
      const templatePath = resolve(fixturesPath, "template-with-mixins.yaml");
      const loader = new TemplateLoader();
      const result = await loader.load(templatePath);

      const taskIds = result.tasks.map((t) => t.id);
      expect(taskIds).toContain("design");
      expect(taskIds).toContain("implement");
      expect(taskIds).toContain("test");
      expect(taskIds).toContain("security-review");
      expect(taskIds).toContain("dependency-audit");
    });

    test("child overrides mixin task with same id", async () => {
      const templatePath = resolve(fixturesPath, "template-with-mixins.yaml");
      const loader = new TemplateLoader();
      const result = await loader.load(templatePath);

      const securityTask = result.tasks.find((t) => t.id === "security-review");
      expect(securityTask?.title).toBe(`Security Audit: \${story.title}`);
      expect(securityTask?.estimationPercent).toBe(8);
    });

    test("throws TemplateCompositionError for invalid mixin", async () => {
      const invalidMixinRef = "./mixins/nonexistent.yaml";
      const raw = {
        mixins: [invalidMixinRef],
        name: "Template",
        filter: { workItemTypes: ["User Story"] },
        tasks: [{ title: "Task", estimationPercent: 100 }],
      };

      await expect(
        composer.resolve(raw, resolve(fixturesPath, "dummy.yaml")),
      ).rejects.toThrow();
    });

    test("throws TemplateCompositionError when mixin ref is a template name", async () => {
      const raw = {
        mixins: ["backend-api"],
        name: "Template",
        filter: { workItemTypes: ["User Story"] },
        tasks: [{ title: "Task", estimationPercent: 100 }],
      };

      await expect(
        composer.resolve(raw, resolve(fixturesPath, "dummy.yaml")),
      ).rejects.toThrow(TemplateCompositionError);
    });

    test("throws TemplateCompositionError for malformed mixins even when extends is valid", async () => {
      const basePath = resolve(fixturesPath, "base-template.yaml");
      const raw = {
        extends: basePath,
        mixins: ["./mixins/security.yaml", 42],
        name: "Template",
      };

      await expect(
        composer.resolve(raw, resolve(fixturesPath, "dummy.yaml")),
      ).rejects.toThrow(TemplateCompositionError);
    });

    test("later incoming tasks with the same new id override earlier incoming tasks", async () => {
      const raw = {
        mixins: ["./mixins/security.yaml"],
        name: "Template",
        filter: { workItemTypes: ["User Story"] },
        tasks: [
          { id: "child-task", title: "First Child Task", estimationPercent: 10 },
          { id: "child-task", title: "Second Child Task", estimationPercent: 20 },
        ],
      };

      const result = await composer.resolve(raw, resolve(fixturesPath, "dummy.yaml"));
      const childTasks = result.tasks.filter((task) => task.id === "child-task");

      expect(childTasks).toHaveLength(1);
      expect(childTasks[0]?.title).toBe("Second Child Task");
    });
  });

  describe("TemplateLoader integration", () => {
    test("plain template loads unchanged", async () => {
      const loader = new TemplateLoader();
      const template = await loader.load(
        resolve(fixturesPath, "valid-template.yaml"),
      );
      expect(template.name).toBe("Test Template");
      expect(template.tasks).toHaveLength(2);
    });

    test("child template loads with inherited filter and merged tasks", async () => {
      const loader = new TemplateLoader();
      const template = await loader.load(
        resolve(fixturesPath, "child-template.yaml"),
      );

      expect(template.name).toBe("Child Template");
      expect(template.filter.workItemTypes).toEqual(["User Story"]);
      expect(template.tasks.find((t) => t.id === "design")?.title).toBe(
        `Custom Design: \${story.title}`,
      );
      expect(template.tasks.find((t) => t.id === "implement")?.title).toBe(
        `Implement: \${story.title}`,
      );
      expect(template.tasks.find((t) => t.id === "deploy")).toBeDefined();
    });
  });
});

describe("TemplateCatalog discovery", () => {
  const catalogRoot = resolve(__dirname, "../fixtures/catalog");

  test("discovers templates from package templates folder", async () => {
    const catalog = new TemplateCatalog({
      packageRoot: resolve(catalogRoot, "package"),
      userRoot: resolve(catalogRoot, "user"),
      projectRoot: resolve(catalogRoot, "project"),
    });

    const templates = await catalog.listTemplates();

    expect(templates.find((item) => item.ref === "template:team-base")?.displayName).toBe(
      "Package Team Base",
    );
  });

  test("exposes Atomize curated templates as built-in templates", async () => {
    const catalog = new TemplateCatalog();
    const templates = await catalog.listTemplates();

    const backend = templates.find((item) => item.ref === "template:backend-api");
    expect(backend?.scope).toBe("builtin");
    expect(backend?.displayName).toBe("Backend API Development");
  });

  test("project mixins override user mixins with the same name", async () => {
    const catalog = new TemplateCatalog({
      packageRoot: resolve(catalogRoot, "package"),
      userRoot: resolve(catalogRoot, "user"),
      projectRoot: resolve(catalogRoot, "project"),
    });

    const mixins = await catalog.listMixins();
    const security = mixins.find((item) => item.name === "security");

    expect(security?.scope).toBe("project");
    expect(security?.displayName).toBe("Project Security");
  });

  test("loads logical template and mixin refs", async () => {
    const catalog = new TemplateCatalog({
      packageRoot: resolve(catalogRoot, "package"),
      userRoot: resolve(catalogRoot, "user"),
      projectRoot: resolve(catalogRoot, "project"),
    });

    const resolver = new TemplateResolver(catalog);
    const template = await resolver.loadTemplateRef("template:team-base");
    const mixin = await resolver.loadMixinRef("mixin:security");

    expect(template.name).toBe("Package Team Base");
    expect(mixin.name).toBe("Project Security");
  });

  test("loads Atomize curated template refs", async () => {
    const resolver = new TemplateResolver(new TemplateCatalog());
    const template = await resolver.loadTemplateRef("template:backend-api");

    expect(template.name).toBe("Backend API Development");
    expect(template.tasks.length).toBeGreaterThan(0);
  });

  test("installs a mixin into the user catalog", async () => {
    const userRoot = await mkdtemp(resolve(tmpdir(), "atomize-catalog-"));
    const catalog = new TemplateCatalog({
      packageRoot: resolve(catalogRoot, "package"),
      userRoot,
      projectRoot: resolve(catalogRoot, "empty-project"),
    });

    const installed = await catalog.installFromFile(
      resolve(catalogRoot, "project/mixins/security.yaml"),
      "mixin",
    );
    const mixins = await catalog.listMixins();

    expect(installed.ref).toBe("mixin:security");
    expect(mixins.find((item) => item.name === "security")?.scope).toBe("user");
  });
});

describe("mergeTasks conflict resolution", () => {
  test("base task ordering is preserved when overriding", async () => {
    const basePath = resolve(fixturesPath, "base-template.yaml");
    const composer = new TemplateComposer();
    const raw = {
      extends: basePath,
      name: "Child",
      tasks: [
        { id: "implement", title: "Override Implement", estimationPercent: 40 },
      ],
    };

    const result = await composer.resolve(raw, "/any/context.yaml");

    const ids = result.tasks.map((t) => t.id);
    expect(ids.indexOf("design")).toBeLessThan(ids.indexOf("implement"));
    expect(ids.indexOf("implement")).toBeLessThan(ids.indexOf("test"));
    expect(result.tasks.find((t) => t.id === "implement")?.title).toBe(
      "Override Implement",
    );
  });
});

// ─── P0 bug regression: mixins-only priority inversion ───────────────────────

describe("mixins-only (no extends) — child wins over mixin", () => {
  test("child task with same id overrides mixin task, not the other way", async () => {
    const loader = new TemplateLoader();
    const template = await loader.load(
      resolve(fixturesPath, "mixins-only-template.yaml"),
    );

    const securityTask = template.tasks.find((t) => t.id === "security-review");
    expect(securityTask?.title).toBe("Child Security Review (overrides mixin)");
    expect(securityTask?.estimationPercent).toBe(15);
  });

  test("mixin tasks not in child are still present", async () => {
    const loader = new TemplateLoader();
    const template = await loader.load(
      resolve(fixturesPath, "mixins-only-template.yaml"),
    );

    const dependencyAudit = template.tasks.find(
      (t) => t.id === "dependency-audit",
    );
    expect(dependencyAudit).toBeDefined();
  });

  test("child's own tasks (no mixin conflict) are preserved", async () => {
    const loader = new TemplateLoader();
    const template = await loader.load(
      resolve(fixturesPath, "mixins-only-template.yaml"),
    );

    const ownTask = template.tasks.find((t) => t.id === "my-task");
    expect(ownTask?.title).toBe("My Own Task");
  });
});

describe("circular inheritance error message", () => {
  test("error message contains all nodes in the cycle, not just duplicates", async () => {
    const loader = new TemplateLoader();
    try {
      await loader.load(resolve(fixturesPath, "circular-a.yaml"));
      expect(true).toBe(false); // should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(TemplateCompositionError);
      if (error instanceof TemplateCompositionError) {
        // Should show A → B → A, not A → A
        const msg = error.message;
        expect(msg).toContain("circular-a.yaml");
        expect(msg).toContain("circular-b.yaml");
      }
    }
  });
});

describe("MAX_INHERITANCE_DEPTH", () => {
  test("MAX_INHERITANCE_DEPTH is exported and equals 10", () => {
    expect(MAX_INHERITANCE_DEPTH).toBe(10);
  });

  test("throws TemplateCompositionError when depth is exceeded", async () => {
    const basePath = resolve(fixturesPath, "base-template.yaml");
    const fakeContextPath = resolve(fixturesPath, "deep-chain.yaml");

    const visited = new Set<string>();
    for (let i = 0; i < MAX_INHERITANCE_DEPTH; i++) {
      visited.add(`/fake/path/template-${i}.yaml`);
    }

    const composer = new TemplateComposer();
    await expect(
      composer.resolve(
        { extends: basePath, name: "Overflow" },
        fakeContextPath,
        visited,
      ),
    ).rejects.toThrow(TemplateCompositionError);
  });
});

describe("multi-level inheritance chain", () => {
  test("three-level chain resolves all fields correctly", async () => {
    const parentPath = resolve(fixturesPath, "parent-template.yaml");
    const loader = new TemplateLoader();
    const template = await loader.load(parentPath);
    expect(template.filter.workItemTypes).toEqual(["User Story"]);
    expect(template.filter.states).toEqual(["New"]);
  });

  test("child wins over parent wins over grandparent for tasks", async () => {
    const parentPath = resolve(fixturesPath, "parent-template.yaml");
    const loader = new TemplateLoader();
    const template = await loader.load(parentPath);
    const gpTask = template.tasks.find((t) => t.id === "gp-task");
    expect(gpTask?.title).toBe("Overridden by Parent");
    const parentTask = template.tasks.find((t) => t.id === "parent-task");
    expect(parentTask).toBeDefined();
  });

  test("tags are merged across the full chain", async () => {
    const parentPath = resolve(fixturesPath, "parent-template.yaml");
    const loader = new TemplateLoader();
    const template = await loader.load(parentPath);

    expect(template.tags).toContain("grandparent");
    expect(template.tags).toContain("parent");
  });

});

describe("TemplateLoader.loadWithMeta", () => {
  test("plain template has isComposed = false", async () => {
    const loader = new TemplateLoader();
    const { meta } = await loader.loadWithMeta(
      resolve(fixturesPath, "valid-template.yaml"),
    );
    expect(meta.isComposed).toBe(false);
    expect(meta.extendsRef).toBeUndefined();
    expect(meta.mixinRefs).toHaveLength(0);
  });

  test("child template reports extendsRef and resolved path", async () => {
    const loader = new TemplateLoader();
    const { meta } = await loader.loadWithMeta(
      resolve(fixturesPath, "child-template.yaml"),
    );
    expect(meta.isComposed).toBe(true);
    expect(meta.extendsRef).toBe("./base-template.yaml");
    expect(meta.resolvedExtendsPath).toContain("base-template.yaml");
  });

  test("template with mixins reports mixin paths", async () => {
    const loader = new TemplateLoader();
    const { meta } = await loader.loadWithMeta(
      resolve(fixturesPath, "template-with-mixins.yaml"),
    );
    expect(meta.isComposed).toBe(true);
    expect(meta.mixinRefs).toHaveLength(1);
    expect(meta.resolvedMixinPaths[0]).toContain("security.yaml");
  });

  test("file extends reports resolved path metadata", async () => {
    const loader = new TemplateLoader();
    const { meta } = await loader.loadWithMeta(
      resolve(fixturesPath, "child-template.yaml"),
    );
    expect(meta.resolvedExtendsPath).toBeDefined();
  });
});
