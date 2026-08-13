export interface AIProvider {
  readonly id: string;
  authenticate(): Promise<void>;
  testConnection?(): Promise<boolean>;
  generate(systemPrompt: string, userPrompt: string): Promise<string>;
  stream(systemPrompt: string, userPrompt: string): AsyncIterable<string>;
}
