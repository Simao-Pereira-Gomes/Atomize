export interface AIProvider {
  readonly id: string;
  authenticate(): Promise<void>;
  testConnection?(): Promise<boolean>;
  generate(systemPrompt: string, userPrompt: string): Promise<string>;
  stream(systemPrompt: string, userPrompt: string): AsyncIterable<string>;
}

/** An ephemeral, tool-free conversation used for one user-requested draft. */
export interface AIDraftSession {
  generate(systemPrompt: string, userPrompt: string): Promise<string>;
  /** Optional: yields response text incrementally as it streams in, for live progress. */
  stream?(systemPrompt: string, userPrompt: string): AsyncIterable<string>;
  abort(): Promise<void>;
  dispose(): Promise<void>;
}
