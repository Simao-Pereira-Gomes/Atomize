import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const packageRoot = resolve(import.meta.dir, "../..");
const fixtures = resolve(import.meta.dir, "../fixtures/e2e");

/** How long one CLI run may take before it counts as hung. */
const RUN_TIMEOUT_MS = 30_000;

export interface CliResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * A throwaway copy of the e2e fixtures: a home folder with a personal Catalog (and a legacy
 * `.atomize/templates` folder), a project with its own `.atomize/catalog`, and loose Template files.
 * The CLI runs with HOME pointed at the copy, so nothing touches the real user's Catalog.
 */
export class E2EWorkspace {
  private constructor(readonly root: string) {}

  static async create(): Promise<E2EWorkspace> {
    const root = await mkdtemp(join(tmpdir(), "atomize-e2e-"));
    await cp(fixtures, root, { recursive: true });
    return new E2EWorkspace(root);
  }

  get home(): string {
    return join(this.root, "home");
  }

  get project(): string {
    return join(this.root, "project");
  }

  file(name: string): string {
    return join(this.root, "files", name);
  }

  async read(path: string): Promise<string> {
    return await readFile(path, "utf8");
  }

  /**
   * Runs the CLI from source as a subprocess, non-interactively, from `cwd` (the project by
   * default). A run that doesn't exit within the timeout is killed and fails the test, so a
   * command that hangs is caught rather than stalling the suite.
   */
  async run(args: string[], options: { cwd?: string; timeoutMs?: number } = {}): Promise<CliResult> {
    return await this.runWhile(args, async () => undefined, options);
  }

  /**
   * Like `run`, but calls `onStdoutLine` with each line of stdout as it arrives, along with the
   * process, so a test can act mid-run (for example send it SIGINT).
   */
  async runWhile(
    args: string[],
    onStdoutLine: (line: string, proc: { kill(signal: NodeJS.Signals): void }) => Promise<void> | void,
    options: { cwd?: string; timeoutMs?: number } = {},
  ): Promise<CliResult> {
    const proc = Bun.spawn(["bun", "run", join(packageRoot, "src/cli/index.ts"), ...args], {
      cwd: options.cwd ?? this.project,
      env: {
        ...process.env,
        HOME: this.home,
        USERPROFILE: this.home,
        NO_COLOR: "1",
        FORCE_COLOR: "0",
        CI: "1",
        ATOMIZE_UPDATE_NOTIFIER: "false",
        ATOMIZE_TELEMETRY: "off",
      },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const timeoutMs = options.timeoutMs ?? RUN_TIMEOUT_MS;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, timeoutMs);
    const readStdout = async (): Promise<string> => {
      let text = "";
      let pending = "";
      const decoder = new TextDecoder();
      for await (const chunk of proc.stdout) {
        const piece = decoder.decode(chunk, { stream: true });
        text += piece;
        pending += piece;
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const line of lines) await onStdoutLine(line, proc);
      }
      if (pending) await onStdoutLine(pending, proc);
      return text;
    };
    const [stdout, stderr, exitCode] = await Promise.all([
      readStdout(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    clearTimeout(timer);
    if (timedOut) {
      throw new Error(`atomize ${args.join(" ")} did not exit within ${timeoutMs} ms.\nstdout:\n${stdout.slice(-2000)}\nstderr:\n${stderr.slice(-2000)}`);
    }
    return { stdout, stderr, exitCode };
  }

  /** Runs the CLI and parses its stdout as JSON, failing with the output when it isn't. */
  async runJson<T = unknown>(args: string[], options: { cwd?: string } = {}): Promise<{ json: T } & CliResult> {
    const result = await this.run(args, options);
    try {
      return { ...result, json: JSON.parse(result.stdout) as T };
    } catch {
      throw new Error(`atomize ${args.join(" ")} did not print JSON (exit ${result.exitCode}).\nstdout:\n${result.stdout.slice(0, 2000)}\nstderr:\n${result.stderr.slice(0, 2000)}`);
    }
  }

  async dispose(): Promise<void> {
    await rm(this.root, { recursive: true, force: true });
  }
}

/** A Mock Story JSON for `preview --mock-story`. */
export function mockStory(fields: Record<string, unknown>): string {
  return JSON.stringify({ id: "MOCK-1", title: "Checkout", type: "User Story", state: "New", ...fields });
}
