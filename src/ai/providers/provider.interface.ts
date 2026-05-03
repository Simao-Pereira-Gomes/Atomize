export interface AIProvider {
  readonly id: string;
  testConnection?(): Promise<boolean>;
  generate(systemPrompt: string, userPrompt: string): Promise<string>;
  stream(systemPrompt: string, userPrompt: string): AsyncIterable<string>;
}
