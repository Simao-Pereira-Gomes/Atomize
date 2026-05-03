import OpenAI from "openai";
import type { AIProvider } from "../provider.interface";

const GITHUB_MODELS_BASE_URL = "https://models.inference.ai.azure.com";
const DEFAULT_MODEL = "gpt-4o-mini";

export class GitHubModelsProvider implements AIProvider {
  readonly id = "github-models";
  private client: OpenAI;
  private model: string;

  constructor({ token, model = DEFAULT_MODEL }: { token: string; model?: string }) {
    this.client = new OpenAI({ apiKey: token, baseURL: GITHUB_MODELS_BASE_URL });
    this.model = model;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    return response.choices[0]?.message?.content ?? "";
  }

  async *stream(systemPrompt: string, userPrompt: string): AsyncIterable<string> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream: true,
    });
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }
}
