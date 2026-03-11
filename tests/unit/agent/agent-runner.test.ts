import { describe, expect, it, mock, beforeEach } from "bun:test";

// Mock the "ai" module before importing the module under test
const mockGenerateText = mock((_opts: any) =>
  Promise.resolve({
    output: { passed: true, message: "Login works" } as {
      passed: boolean;
      message: string;
    } | null,
    steps: [] as any[],
  }),
);

mock.module("ai", () => ({
  generateText: mockGenerateText,
  Output: {
    object: (opts: any) => ({ type: "object", ...opts }),
  },
  stepCountIs: (n: number) => ({ type: "step-count", count: n }),
}));

// Import after mocks are set up
import { executeAgent } from "../../../src/agent/agent-runner.ts";

describe("executeAgent", () => {
  const fakeModel = { id: "test-model" };
  const fakeTools = {
    browser_navigate: {
      execute: async () => "navigated",
    },
    browser_click: {
      execute: async () => "clicked",
    },
  };

  beforeEach(() => {
    mockGenerateText.mockClear();
  });

  it("returns AgentExecutionResult with passed=true when output indicates pass", async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: { passed: true, message: "Login page loaded successfully" },
      steps: [],
    });

    const result = await executeAgent({
      model: fakeModel,
      tools: fakeTools,
      testCase: "Login page loads",
      baseUrl: "http://localhost:3000",
      recursionLimit: 500,
    });

    expect(result.passed).toBe(true);
    expect(result.message).toBe("Login page loaded successfully");
    expect(Array.isArray(result.steps)).toBe(true);
  });

  it("returns passed=false with diagnostic when output is null", async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: null,
      steps: [],
    });

    const result = await executeAgent({
      model: fakeModel,
      tools: fakeTools,
      testCase: "Complex multi-page flow",
      baseUrl: "http://localhost:3000",
      recursionLimit: 100,
    });

    expect(result.passed).toBe(false);
    expect(result.message).toContain("did not produce a structured result");
    expect(result.message).toContain("100");
  });

  it("passes recursionLimit to stopWhen via stepCountIs", async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: { passed: true, message: "OK" },
      steps: [],
    });

    await executeAgent({
      model: fakeModel,
      tools: fakeTools,
      testCase: "Test",
      baseUrl: "http://localhost:3000",
      recursionLimit: 250,
    });

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    const callArgs = (mockGenerateText.mock.calls as any[][])[0]?.[0];
    expect(callArgs).toBeDefined();
    expect(callArgs.stopWhen).toEqual({ type: "step-count", count: 250 });
  });

  it("wraps tools with StepRecorder before passing to generateText", async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: { passed: true, message: "OK" },
      steps: [],
    });

    await executeAgent({
      model: fakeModel,
      tools: fakeTools,
      testCase: "Test",
      baseUrl: "http://localhost:3000",
      recursionLimit: 500,
    });

    const callArgs = (mockGenerateText.mock.calls as any[][])[0]?.[0];
    expect(callArgs).toBeDefined();
    // Tools should be wrapped (they still have browser_navigate and browser_click keys)
    expect(callArgs.tools).toHaveProperty("browser_navigate");
    expect(callArgs.tools).toHaveProperty("browser_click");
    // Wrapped tools should differ from original (wrapper adds recording)
    expect(callArgs.tools.browser_navigate).not.toBe(fakeTools.browser_navigate);
  });

  it("includes recorded steps in the returned AgentExecutionResult", async () => {
    // Create tools that actually execute so steps get recorded
    const recordableTools = {
      browser_navigate: {
        execute: async (_input: Record<string, unknown>) =>
          "navigated to page",
      },
    };

    // Mock generateText to actually invoke the wrapped tool
    mockGenerateText.mockImplementationOnce(async (opts: any) => {
      // Simulate the agent calling a tool
      await opts.tools.browser_navigate.execute({ url: "http://example.com" });
      return {
        output: { passed: true, message: "Navigation test passed" },
        steps: [],
      };
    });

    const result = await executeAgent({
      model: fakeModel,
      tools: recordableTools,
      testCase: "Navigate to page",
      baseUrl: "http://localhost:3000",
      recursionLimit: 500,
    });

    expect(result.steps.length).toBe(1);
    expect(result.steps[0].toolName).toBe("browser_navigate");
    expect(result.steps[0].toolInput).toEqual({ url: "http://example.com" });
  });

  it("uses Output.object with TestResultSchema", async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: { passed: false, message: "Element not found" },
      steps: [],
    });

    await executeAgent({
      model: fakeModel,
      tools: fakeTools,
      testCase: "Click submit",
      baseUrl: "http://localhost:3000",
      recursionLimit: 500,
    });

    const callArgs = (mockGenerateText.mock.calls as any[][])[0]?.[0];
    expect(callArgs).toBeDefined();
    expect(callArgs.output).toBeDefined();
    expect(callArgs.output.type).toBe("object");
    expect(callArgs.output.schema).toBeDefined();
  });

  it("builds system prompt using buildSystemPrompt with context", async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: { passed: true, message: "OK" },
      steps: [],
    });

    await executeAgent({
      model: fakeModel,
      tools: fakeTools,
      testCase: "Login test",
      baseUrl: "http://localhost:3000",
      recursionLimit: 500,
      globalContext: "App uses shadow DOM",
      testContext: "Use admin credentials",
    });

    const callArgs = (mockGenerateText.mock.calls as any[][])[0]?.[0];
    expect(callArgs).toBeDefined();
    // buildSystemPrompt is the real function, so it produces a real prompt
    expect(callArgs.system).toContain("Login test");
    expect(callArgs.system).toContain("http://localhost:3000");
    expect(callArgs.system).toContain("App uses shadow DOM");
    expect(callArgs.system).toContain("Use admin credentials");
  });

  it("passes model directly to generateText", async () => {
    mockGenerateText.mockResolvedValueOnce({
      output: { passed: true, message: "OK" },
      steps: [],
    });

    await executeAgent({
      model: fakeModel,
      tools: fakeTools,
      testCase: "Test",
      baseUrl: "http://localhost:3000",
      recursionLimit: 500,
    });

    const callArgs = (mockGenerateText.mock.calls as any[][])[0]?.[0];
    expect(callArgs).toBeDefined();
    expect(callArgs.model).toBe(fakeModel);
  });
});
