/** A single recorded tool call step for caching */
export interface CachedStep {
  toolName: string;
  toolInput: Record<string, unknown>;
}

/** A complete cache entry with diagnostic metadata */
export interface CacheEntry {
  version: 1;
  testCase: string;
  baseUrl: string;
  steps: CachedStep[];
  /** Model used for AI execution */
  model: string;
  /** Provider name (anthropic, openai, google, openrouter) */
  provider: string;
  /** Number of steps recorded */
  stepCount: number;
  /** AI verdict message */
  aiMessage: string;
  /** Duration of AI execution in milliseconds */
  durationMs: number;
  /** ISO timestamp when cache was first created */
  createdAt: string;
  /** ISO timestamp when cache was last updated */
  updatedAt: string;
}
