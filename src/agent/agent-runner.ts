import { generateText, Output, stepCountIs } from "ai";
import { z } from "zod";
import { StepRecorder } from "../cache/step-recorder.ts";
import type { AgentExecutionResult } from "./types.ts";
import { buildSystemPrompt } from "./prompt.ts";

/**
 * Schema for structured agent output.
 * The agent must produce a { passed, message } JSON object.
 */
const TestResultSchema = z.object({
  passed: z.boolean().describe("Whether the test case passed"),
  message: z
    .string()
    .describe("Brief diagnostic: what happened and what the page showed"),
});

/**
 * Execute a single test case using the AI agent with MCP tools.
 *
 * Uses Vercel AI SDK's generateText with:
 * - Output.object() for structured { passed, message } responses
 * - stopWhen: stepCountIs(recursionLimit) for loop control
 * - StepRecorder tool wrapping for cache step capture
 *
 * @returns AgentExecutionResult with pass/fail status, diagnostic message, and recorded steps
 */
export async function executeAgent(config: {
  model: any;
  tools: Record<string, any>;
  testCase: string;
  baseUrl: string;
  recursionLimit: number;
  globalContext?: string;
  testContext?: string;
}): Promise<AgentExecutionResult> {
  const recorder = new StepRecorder();
  const wrappedTools = recorder.wrapTools(config.tools);

  const systemPrompt = buildSystemPrompt(
    config.testCase,
    config.baseUrl,
    config.globalContext,
    config.testContext,
  );

  const { output } = await generateText({
    model: config.model,
    tools: wrappedTools,
    system: systemPrompt,
    prompt: `Execute the test case: "${config.testCase}"`,
    stopWhen: stepCountIs(config.recursionLimit),
    output: Output.object({ schema: TestResultSchema }),
  });

  if (output === null) {
    return {
      passed: false,
      message: `Agent did not produce a structured result — it may have exceeded the ${config.recursionLimit} step limit`,
      steps: recorder.getSteps(),
    };
  }

  return {
    passed: output.passed,
    message: output.message,
    steps: recorder.getSteps(),
  };
}
