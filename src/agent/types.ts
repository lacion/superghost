import type { CachedStep } from "../cache/types.ts";
import type { ProviderName } from "./model-factory.ts";

/** Result of a single AI agent execution */
export interface AgentExecutionResult {
  /** Whether the test case passed */
  passed: boolean;
  /** Diagnostic message describing the outcome */
  message: string;
  /** Recorded tool call steps for caching */
  steps: CachedStep[];
}

/** Configuration for a single agent run */
export interface AgentConfig {
  /** Model identifier (e.g., "claude-sonnet-4-6", "gpt-4o") */
  model: string;
  /** LLM provider */
  provider: ProviderName;
  /** Maximum number of agent steps */
  recursionLimit: number;
  /** Plain English test case description */
  testCase: string;
  /** Base URL for the application under test */
  baseUrl: string;
  /** Optional per-test context appended to system prompt */
  context?: string;
}
