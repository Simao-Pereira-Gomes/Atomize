import { CopilotClient, RuntimeConnection, type CopilotSession } from "@github/copilot-sdk";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AIDraftSession, AIProvider } from "../provider.interface";

export class CopilotAuthenticationError extends Error {
  constructor(message = "GitHub Copilot is not signed in. Complete the Copilot sign-in flow, then try AI drafting again.") {
    super(message);
    this.name = "CopilotAuthenticationError";
  }
}

/** Sends a prompt on an already-streaming session and yields its response incrementally. */
async function* consumeDeltaStream(session: CopilotSession, userPrompt: string): AsyncIterable<string> {
  const chunks: string[] = [];
  let completed = false;
  let wake: (() => void) | undefined;
  const unsubscribe = session.on("assistant.message_delta", (event) => {
    chunks.push(event.data.deltaContent);
    wake?.();
  });
  const generation = session.sendAndWait({ prompt: userPrompt }).then((response) => {
    if (chunks.length === 0 && response?.data.content) chunks.push(response.data.content);
  }).finally(() => {
    completed = true;
    wake?.();
  });

  try {
    while (!completed || chunks.length > 0) {
      const chunk = chunks.shift();
      if (chunk) {
        yield chunk;
        continue;
      }
      await new Promise<void>((resolve) => { wake = resolve; });
      wake = undefined;
    }
    await generation;
  } finally {
    unsubscribe();
  }
}

export class GitHubCopilotProvider implements AIProvider {
  readonly id = "github-copilot";

  async authenticate(): Promise<void> {
    if (await this.isAuthenticated()) return;
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new CopilotAuthenticationError("GitHub Copilot is not signed in. Run an interactive Atomize AI draft to complete Copilot sign-in first.");
    }
    await this.startLogin();
    if (!(await this.isAuthenticated())) throw new CopilotAuthenticationError();
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.withClient(async (client) => {
        const status = await client.getAuthStatus();
        if (!status.isAuthenticated) throw new CopilotAuthenticationError();
        await client.listModels();
      });
      return true;
    } catch {
      return false;
    }
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    return this.withSession(systemPrompt, false, async (session) => {
      const response = await session.sendAndWait({ prompt: userPrompt });
      return response?.data.content ?? "";
    });
  }

  /** Creates the single session which is deliberately shared by repair attempts. */
  async createDraftSession(): Promise<AIDraftSession> {
    const baseDirectory = await mkdtemp(join(tmpdir(), "atomize-copilot-"));
    const client = this.createClient(baseDirectory);
    try {
      await client.start();
      if (!(await client.getAuthStatus()).isAuthenticated) throw new CopilotAuthenticationError();
      let session: CopilotSession | undefined;
      // Streaming is enabled unconditionally so the same shared session can serve either
      // generate() or stream() first, whichever a caller reaches for; it does not change
      // sendAndWait's behavior, only whether delta events are also emitted alongside it.
      const ensureSession = async (systemPrompt: string) => session ??= await this.createSession(client, systemPrompt, true);
      return {
        generate: async (systemPrompt, userPrompt) => {
          const active = await ensureSession(systemPrompt);
          return (await active.sendAndWait({ prompt: userPrompt }))?.data.content ?? "";
        },
        stream: async function* (systemPrompt, userPrompt) {
          const active = await ensureSession(systemPrompt);
          yield* consumeDeltaStream(active, userPrompt);
        },
        abort: async () => { await session?.abort(); },
        dispose: async () => {
          await session?.disconnect().catch(() => {});
          await client.stop().catch(() => []);
          await rm(baseDirectory, { recursive: true, force: true });
        },
      };
    } catch (error) {
      await client.stop().catch(() => []);
      await rm(baseDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  async *stream(systemPrompt: string, userPrompt: string): AsyncIterable<string> {
    const baseDirectory = await mkdtemp(join(tmpdir(), "atomize-copilot-"));
    const client = this.createClient(baseDirectory);
    try {
      await client.start();
      const status = await client.getAuthStatus();
      if (!status.isAuthenticated) throw new CopilotAuthenticationError();

      const session = await this.createSession(client, systemPrompt, true);
      try {
        yield* consumeDeltaStream(session, userPrompt);
      } finally {
        await session.disconnect().catch(() => {});
      }
    } finally {
      await client.stop().catch(() => []);
      await rm(baseDirectory, { recursive: true, force: true });
    }
  }

  private async withSession<T>(
    systemPrompt: string,
    streaming: boolean,
    action: (session: CopilotSession) => Promise<T>,
  ): Promise<T> {
    return this.withClient(async (client) => {
      const status = await client.getAuthStatus();
      if (!status.isAuthenticated) throw new CopilotAuthenticationError();
      const session = await this.createSession(client, systemPrompt, streaming);
      try {
        return await action(session);
      } finally {
        await session.disconnect().catch(() => {});
      }
    });
  }

  private async createSession(client: CopilotClient, systemPrompt: string, streaming: boolean): Promise<CopilotSession> {
    return client.createSession({
      model: "auto",
      availableTools: [],
      streaming,
      systemMessage: { mode: "customize", content: systemPrompt },
    });
  }

  private async withClient<T>(action: (client: CopilotClient) => Promise<T>): Promise<T> {
    const baseDirectory = await mkdtemp(join(tmpdir(), "atomize-copilot-"));
    const client = this.createClient(baseDirectory);
    try {
      await client.start();
      return await action(client);
    } finally {
      await client.stop().catch(() => []);
      await rm(baseDirectory, { recursive: true, force: true });
    }
  }


  private async isAuthenticated(): Promise<boolean> {
    return this.withClient(async (client) => (await client.getAuthStatus()).isAuthenticated);
  }

  private createClient(baseDirectory: string): CopilotClient {
    const cliPath = process.env.ATOMIZE_COPILOT_CLI_PATH;
    return new CopilotClient({
      baseDirectory,
      logLevel: "error",
      mode: "empty",
      connection: cliPath ? RuntimeConnection.forStdio({ path: cliPath }) : undefined,
    });
  }

  private async startLogin(): Promise<void> {
    const require = createRequire(import.meta.url);
    const loader = require.resolve("@github/copilot/npm-loader.js");
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [loader, "login"], { stdio: "inherit" });
      child.once("error", reject);
      child.once("exit", (code) => code === 0 ? resolve() : reject(new CopilotAuthenticationError("GitHub Copilot sign-in did not complete.")));
    });
  }
}
