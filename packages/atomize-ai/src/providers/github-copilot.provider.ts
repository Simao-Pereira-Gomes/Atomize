import { CopilotClient, RuntimeConnection, type CopilotSession } from "@github/copilot-sdk";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AIDraftSession, AIProvider } from "../provider.interface";

export class CopilotAuthenticationError extends Error {
  // The SDK runtime's "logged-in user" detection checks `gh auth token`, not `copilot login`'s
  // own separately-stored credential — `gh auth login` is what actually satisfies this check.
  constructor(message = "GitHub Copilot is not signed in. Run `gh auth login` in a terminal, then try AI drafting again.") {
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
      throw new CopilotAuthenticationError("GitHub Copilot is not signed in. Run `gh auth login` in a terminal first.");
    }
    await this.startLogin();
    if (!(await this.isAuthenticated())) throw new CopilotAuthenticationError();
  }

  /** Whether Copilot is currently signed in — lets a caller check before attempting a draft. */
  async checkAuthStatus(): Promise<boolean> {
    return this.isAuthenticated();
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
    const client = this.createClient();
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
        },
      };
    } catch (error) {
      await client.stop().catch(() => []);
      throw error;
    }
  }

  async *stream(systemPrompt: string, userPrompt: string): AsyncIterable<string> {
    const client = this.createClient();
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
    const client = this.createClient();
    try {
      await client.start();
      return await action(client);
    } finally {
      await client.stop().catch(() => []);
    }
  }

  private async isAuthenticated(): Promise<boolean> {
    return this.withClient(async (client) => (await client.getAuthStatus()).isAuthenticated);
  }

  /**
   * `baseDirectory` sets `COPILOT_HOME` for the spawned runtime — it IS the credential/config
   * root, not a scratch directory. A fresh temp directory here (the previous implementation)
   * meant every auth check ran against a brand-new, never-authenticated identity, regardless of
   * how many times sign-in actually succeeded — always reporting "not signed in". Pointing this
   * at the same real, persistent home `copilot login` itself uses (honoring `COPILOT_HOME` when
   * set, e.g. for isolated testing) is what makes sign-in state actually visible here.
   */
  private createClient(): CopilotClient {
    const cliPath = process.env.ATOMIZE_COPILOT_CLI_PATH;
    return new CopilotClient({
      baseDirectory: process.env.COPILOT_HOME || join(homedir(), ".copilot"),
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
