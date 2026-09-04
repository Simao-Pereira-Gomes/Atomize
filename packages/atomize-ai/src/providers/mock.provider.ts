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

  constructor(private readonly response = DEFAULT_MOCK_TEMPLATE) {}

  async authenticate(): Promise<void> {}

  async generate(_systemPrompt: string, _userPrompt: string): Promise<string> {
    return this.response;
  }

  async *stream(_systemPrompt: string, _userPrompt: string): AsyncIterable<string> {
    const chunkSize = 50;
    for (let index = 0; index < this.response.length; index += chunkSize) {
      yield this.response.slice(index, index + chunkSize);
    }
  }
}
