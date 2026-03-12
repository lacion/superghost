import { type CachedStep } from "../cache/types.ts";

/** Result of a single AI agent execution */
export interface AgentExecutionResult {
  /** Whether the test case passed */
  passed: boolean;
  /** Diagnostic message describing the outcome */
  message: string;
  /** Recorded tool call steps for caching */
  steps: CachedStep[];
}
