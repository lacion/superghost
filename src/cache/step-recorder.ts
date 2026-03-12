import { type CachedStep } from "./types.ts";

/**
 * Records MCP tool calls as CachedStep entries.
 * Used during AI agent execution to capture the sequence of actions
 * that led to a successful test, enabling later cache replay.
 *
 * Only records successful tool executions -- failed calls are not cached.
 */
export class StepRecorder {
  private steps: CachedStep[] = [];

  /** Record a tool invocation manually */
  record(toolName: string, toolInput: Record<string, unknown>): void {
    this.steps.push({ toolName, toolInput });
  }

  /** Get a copy of all recorded steps */
  getSteps(): CachedStep[] {
    return [...this.steps];
  }

  /** Clear all recorded steps */
  clear(): void {
    this.steps = [];
  }

  /**
   * Wrap a tools object to automatically record successful calls.
   * Each tool's execute function is replaced with a version that:
   * 1. Calls the original execute
   * 2. Records the step on success
   * 3. Re-throws on failure (does NOT record failed steps)
   */
  wrapTools(tools: Record<string, any>): Record<string, any> {
    return Object.fromEntries(
      Object.entries(tools).map(([name, tool]) => [
        name,
        {
          ...tool,
          execute: async (input: Record<string, unknown>) => {
            const result = await tool.execute(input);
            this.record(name, input);
            return result;
          },
        },
      ]),
    );
  }
}
