import type { AIProvider } from "../provider.interface";

const DEFAULT_MOCK_TEMPLATE = `version: "1.0"
name: "Mock Template"
description: "A mock template for testing"
filter:
  workItemTypes: ["User Story"]
  states: ["Active"]
  excludeIfHasTasks: true
tasks:
  - title: "Task One"
    estimationPercent: 60
  - title: "Task Two"
    estimationPercent: 40
`;

export class MockAIProvider implements AIProvider {
  readonly id = "mock";
  private response: string;

  constructor(response?: string) {
    this.response = response ?? DEFAULT_MOCK_TEMPLATE;
  }

  async generate(_systemPrompt: string, _userPrompt: string): Promise<string> {
    return this.response;
  }

  async *stream(_systemPrompt: string, _userPrompt: string): AsyncIterable<string> {
    const chunkSize = 50;
    for (let i = 0; i < this.response.length; i += chunkSize) {
      yield this.response.slice(i, i + chunkSize);
    }
  }
}
