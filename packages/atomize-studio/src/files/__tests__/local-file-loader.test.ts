import { describe, expect, it } from "vitest";
import { createAuthoringStore } from "../../stores/sections";
import { LocalFileResolutionError, loadLocalFile } from "../local-file-loader";

describe("loadLocalFile", () => {
  it("classifies a schema-valid Template as valid, without calling the resolver", async () => {
    let resolveCalled = false;
    const raw = "version: '1.0'\nname: Backend standard\nfilter: {}\ntasks:\n  - title: Implement\n";

    const result = await loadLocalFile(raw, "/tmp/backend.atomize.yaml", async () => {
      resolveCalled = true;
      return {};
    });

    expect(result).toEqual({
      kind: "valid",
      template: { version: "1.0", name: "Backend standard", filter: {}, tasks: [{ title: "Implement" }] },
    });
    expect(resolveCalled).toBe(false);
  });

  it("classifies a Template-shaped file with field errors as malformed, loadable with inline errors", async () => {
    const raw = "version: '1.0'\nname: Draft\nfilter: {}\ntasks:\n  - title: ''\n    estimationPercent: 120\n";

    const result = await loadLocalFile(raw, "/tmp/draft.atomize.yaml", async () => ({}));

    expect(result.kind).toBe("malformed");
    if (result.kind !== "malformed") throw new Error("expected malformed");
    const store = createAuthoringStore();
    store.loadTemplate(result.template);
    expect(store.tasks.fields.items[0]?.fields.estimationPercent).toBe("120");
    expect(store.tasks.isValid()).toBe(false);
  });

  it("classifies invalid YAML as wrong-format", async () => {
    const result = await loadLocalFile("name: [unterminated", "/tmp/bad.atomize.yaml", async () => ({}));
    expect(result).toEqual({ kind: "wrong-format", message: "This file is not valid YAML." });
  });

  it("classifies a file missing the top-level Template shape as wrong-format", async () => {
    const result = await loadLocalFile("just: a string\n", "/tmp/notatemplate.atomize.yaml", async () => ({}));
    expect(result.kind).toBe("wrong-format");
  });

  it("classifies a structurally-Mixin file (name + tasks, no filter) as wrong-format", async () => {
    const raw = "name: Shared tasks\ntasks:\n  - title: Write docs\n";
    const result = await loadLocalFile(raw, "/tmp/shared.atomize.yaml", async () => ({}));
    expect(result.kind).toBe("wrong-format");
  });

  it("resolves extends/mixins through the injected resolver and strips them from the classified result", async () => {
    let receivedPath: string | undefined;
    const raw = "extends: base\nname: Child override\n";
    const resolved = {
      version: "1.0",
      name: "Child override",
      filter: { workItemTypes: ["Bug"] },
      tasks: [{ title: "From base" }, { title: "From child" }],
      extends: "base",
    };

    const result = await loadLocalFile(raw, "/tmp/child.atomize.yaml", async (path) => {
      receivedPath = path;
      return resolved;
    });

    expect(receivedPath).toBe("/tmp/child.atomize.yaml");
    expect(result).toEqual({
      kind: "valid",
      template: { version: "1.0", name: "Child override", filter: { workItemTypes: ["Bug"] }, tasks: [{ title: "From base" }, { title: "From child" }] },
    });
  });

  it("classifies a composed-but-invalid result as malformed rather than throwing", async () => {
    const raw = "mixins:\n  - shared\nname: Child\n";
    const resolved = { version: "1.0", name: "Child", filter: {}, tasks: [{ title: "" }], mixins: ["shared"] };

    const result = await loadLocalFile(raw, "/tmp/child.atomize.yaml", async () => resolved);

    expect(result.kind).toBe("malformed");
  });

  it("raises LocalFileResolutionError, not wrong-format, when the resolver fails", async () => {
    const raw = "extends: missing-base\nname: Child\n";

    await expect(
      loadLocalFile(raw, "/tmp/child.atomize.yaml", async () => {
        throw new Error('template "missing-base" not found.');
      }),
    ).rejects.toThrow(LocalFileResolutionError);
  });

  it("never calls the resolver for a file with empty extends/mixins declarations", async () => {
    let resolveCalled = false;
    const raw = "version: '1.0'\nname: Standalone\nfilter: {}\ntasks:\n  - title: Implement\nextends: ''\nmixins: []\n";

    const result = await loadLocalFile(raw, "/tmp/standalone.atomize.yaml", async () => {
      resolveCalled = true;
      return {};
    });

    expect(resolveCalled).toBe(false);
    expect(result.kind).toBe("valid");
  });
});
