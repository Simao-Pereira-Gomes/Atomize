import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Subprocess } from "bun";

/**
 * Drives the real sidecar process over its newline-delimited JSON-RPC stdio (ADR-0042), the way
 * Studio's Rust relay does. Covers the Catalog root fix (#310), Catalog item reads (#312), Mock
 * Preview as a dry run (#315), the typed contract (#327) and the error shape (#328).
 */

// biome-ignore lint/suspicious/noTemplateCurlyInString: a Template interpolation placeholder, not a JS template
const BASE = 'formatVersion: "1.0"\nname: "Root Base"\nfilter:\n  workItemTypes: ["User Story"]\ntasks:\n  - id: "plan"\n    title: "Plan ${story.title}"\n    estimationPercent: 40\n  - id: "build"\n    title: "Build"\n    estimationPercent: 60\n';
const MIXIN = 'name: "Root Review"\ntasks:\n  - id: "review"\n    title: "Review"\n    estimationFixed: 1\n';
const CHILD = 'formatVersion: "1.0"\nname: "Project Child"\nextends: "template:root-base"\nmixins: ["mixin:root-review"]\ntasks:\n  - id: "build"\n    title: "Build it"\n    estimationPercent: 60\n';

type Message = { jsonrpc: "2.0"; id?: number; method?: string; result?: unknown; error?: { code: string; message: string; tokenRejected?: true } };

class SidecarProcess {
  private buffer = "";
  readonly lines: string[] = [];
  private readonly waiters = new Map<number, (message: Message) => void>();
  private nextId = 1;
  private ready!: Promise<void>;

  private constructor(private readonly proc: Subprocess<"pipe", "pipe", "pipe">) {}

  static start(env: Record<string, string>, cwd: string): SidecarProcess {
    const proc = Bun.spawn(["bun", join(import.meta.dir, "index.ts")], {
      cwd,
      env: { ...process.env, ...env },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    const sidecar = new SidecarProcess(proc);
    sidecar.ready = sidecar.read();
    return sidecar;
  }

  private read(): Promise<void> {
    return new Promise((resolveReady, rejectReady) => {
      const decoder = new TextDecoder();
      void (async () => {
        for await (const chunk of this.proc.stdout) {
          this.buffer += decoder.decode(chunk);
          let newline = this.buffer.indexOf("\n");
          while (newline >= 0) {
            const line = this.buffer.slice(0, newline);
            this.buffer = this.buffer.slice(newline + 1);
            newline = this.buffer.indexOf("\n");
            if (!line.trim()) continue;
            this.lines.push(line);
            const message = JSON.parse(line) as Message;
            if (message.method === "sidecar.ready") resolveReady();
            if (typeof message.id === "number") this.waiters.get(message.id)?.(message);
          }
        }
        rejectReady(new Error("The sidecar exited before it was ready."));
      })();
    });
  }

  async request(method: string, params?: unknown, timeoutMs = 20_000): Promise<Message> {
    await this.ready;
    const id = this.nextId++;
    const response = new Promise<Message>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${method} got no response within ${timeoutMs} ms`)), timeoutMs);
      this.waiters.set(id, (message) => {
        clearTimeout(timer);
        resolve(message);
      });
    });
    this.proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) })}\n`);
    await this.proc.stdin.flush();
    return await response;
  }

  async stop(): Promise<void> {
    this.proc.stdin.end();
    this.proc.kill();
    await this.proc.exited;
  }
}

let root: string;
let sidecar: SidecarProcess;
let projectTemplate: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "atomize-sidecar-e2e-"));
  const catalogRoot = join(root, "bundled");
  const home = join(root, "home");
  const project = join(root, "project");
  await mkdir(join(catalogRoot, "catalog", "templates"), { recursive: true });
  await mkdir(join(catalogRoot, "catalog", "mixins"), { recursive: true });
  await mkdir(join(home, ".atomize"), { recursive: true });
  await mkdir(join(project, ".atomize"), { recursive: true });
  await writeFile(join(catalogRoot, "catalog", "templates", "root-base.atomize.yaml"), BASE);
  await writeFile(join(catalogRoot, "catalog", "mixins", "root-review.atomize.yaml"), MIXIN);
  projectTemplate = join(project, "child.atomize.yaml");
  await writeFile(projectTemplate, CHILD);
  // The bundled Catalog lives only under ATOMIZE_CATALOG_ROOT, as in the packaged Studio app.
  sidecar = SidecarProcess.start({ ATOMIZE_CATALOG_ROOT: catalogRoot, HOME: home, USERPROFILE: home }, project);
});

afterAll(async () => {
  await sidecar?.stop();
  await rm(root, { recursive: true, force: true });
});

describe("the sidecar over stdio", () => {
  it("lists the bundled Catalog from ATOMIZE_CATALOG_ROOT with each item's own content", async () => {
    const response = await sidecar.request("catalog.list");
    const items = response.result as Array<{ ref: string; scope: string; content: { name?: string; extends?: string } }>;

    expect(response.error).toBeUndefined();
    expect(items.map((item) => item.ref).sort()).toEqual(["mixin:root-review", "template:root-base"]);
    expect(items.find((item) => item.ref === "template:root-base")?.content.name).toBe("Root Base");
  });

  it("resolves a project Template's catalog refs against the same bundled Catalog (#310)", async () => {
    const response = await sidecar.request("template.resolveLocal", { path: projectTemplate });
    const template = response.result as { tasks: Array<{ id?: string; title: string }> };

    expect(response.error).toBeUndefined();
    expect(template.tasks.map((task) => task.id)).toEqual(["plan", "build", "review"]);
    expect(template.tasks[1]?.title).toBe("Build it");
  });

  it("runs Mock Preview through the Generation Run", async () => {
    const story = JSON.stringify({ id: "S-1", title: "Checkout", estimation: 10 });
    const response = await sidecar.request("preview.mockStory", { source: projectTemplate, mockStory: story });
    const preview = response.result as { tasks: Array<{ title: string; estimation?: number }>; estimationSummary: { storyEstimation: number } };

    expect(response.error).toBeUndefined();
    expect(preview.tasks.map((task) => [task.title, task.estimation])).toEqual([["Plan Checkout", 4], ["Build it", 6], ["Review", 1]]);
    expect(preview.estimationSummary.storyEstimation).toBe(10);
  });

  it("inspects the Story fields a Template reads", async () => {
    const response = await sidecar.request("preview.inspect", { source: projectTemplate });
    expect(response.error).toBeUndefined();
    expect(response.result).toHaveProperty("fields");
  });

  it("rejects an invalid Mock Story with its own code", async () => {
    const response = await sidecar.request("preview.mockStory", { source: projectTemplate, mockStory: "[1]" });
    expect(response.error?.code).toBe("MOCK_STORY_INVALID");
  });

  it("answers an unknown method with METHOD_NOT_FOUND and no tokenRejected flag", async () => {
    const response = await sidecar.request("nope.nothing");
    expect(response.error).toEqual({ code: "METHOD_NOT_FOUND", message: "Unknown method: nope.nothing" });
  });

  it("answers bad params with INVALID_PARAMS", async () => {
    const response = await sidecar.request("template.resolveLocal", {});
    expect(response.error?.code).toBe("INVALID_PARAMS");
  });

  it("writes nothing but JSON-RPC messages to stdout, so logging never corrupts the channel", () => {
    expect(sidecar.lines.length).toBeGreaterThan(0);
    for (const line of sidecar.lines) {
      expect(JSON.parse(line)).toMatchObject({ jsonrpc: "2.0" });
    }
  });
});
