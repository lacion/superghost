import { describe, expect, it } from "bun:test";

import { type Config } from "../../../src/config/types.ts";
import { type Reporter } from "../../../src/output/types.ts";
import { TestRunner } from "../../../src/runner/test-runner.ts";
import { type RunResult, type TestResult } from "../../../src/runner/types.ts";

/** Creates a minimal Config object for testing */
function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    browser: "chromium",
    headless: true,
    timeout: 60000,
    maxAttempts: 3,
    model: "claude-sonnet-4-6",
    modelProvider: "anthropic",
    cacheDir: ".superghost-cache",
    recursionLimit: 500,
    tests: [
      { name: "Test A", case: "check that A works", type: "browser" as const },
      { name: "Test B", case: "verify B loads", type: "browser" as const },
    ],
    ...overrides,
  };
}

/** Creates a mock Reporter that records calls */
function createMockReporter() {
  const calls: Array<{
    method: string;
    args: unknown[];
  }> = [];

  const reporter: Reporter = {
    onTestStart(testName: string) {
      calls.push({ method: "onTestStart", args: [testName] });
    },
    onTestComplete(result: TestResult) {
      calls.push({
        method: "onTestComplete",
        args: [result.testName, result.status, result.source, result.durationMs],
      });
    },
    onRunComplete(data: RunResult) {
      calls.push({ method: "onRunComplete", args: [data] });
    },
  };

  return { reporter, calls };
}

describe("TestRunner", () => {
  it("runs all tests sequentially and returns correct RunResult", async () => {
    const config = makeConfig({
      tests: [
        { name: "Test A", case: "case a", type: "browser" as const },
        { name: "Test B", case: "case b", type: "browser" as const },
        { name: "Test C", case: "case c", type: "browser" as const },
      ],
    });
    const { reporter } = createMockReporter();

    const executeFn = async (testCase: string, _baseUrl: string): Promise<TestResult> => {
      if (testCase === "case c") {
        return {
          testName: "Test C",
          testCase,
          status: "failed",
          source: "ai",
          durationMs: 800,
          error: "Element not found",
        };
      }
      return {
        testName: testCase === "case a" ? "Test A" : "Test B",
        testCase,
        status: "passed",
        source: testCase === "case b" ? "cache" : "ai",
        durationMs: 500,
      };
    };

    const runner = new TestRunner(config, reporter, executeFn);
    const result = await runner.run();

    expect(result.passed).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.cached).toBe(1);
    expect(result.results).toHaveLength(3);
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it("calls reporter.onTestStart with test name before each test", async () => {
    const config = makeConfig();
    const { reporter, calls } = createMockReporter();

    const executeFn = async (testCase: string, _baseUrl: string): Promise<TestResult> => ({
      testName: testCase === "check that A works" ? "Test A" : "Test B",
      testCase,
      status: "passed",
      source: "ai",
      durationMs: 100,
    });

    const runner = new TestRunner(config, reporter, executeFn);
    await runner.run();

    const startCalls = calls.filter((c) => c.method === "onTestStart");
    expect(startCalls).toHaveLength(2);
    expect(startCalls[0].args[0]).toBe("Test A");
    expect(startCalls[1].args[0]).toBe("Test B");
  });

  it("calls reporter.onTestComplete with result details after each test", async () => {
    const config = makeConfig({
      tests: [{ name: "Only Test", case: "the only case", type: "browser" as const }],
    });
    const { reporter, calls } = createMockReporter();

    const executeFn = async (): Promise<TestResult> => ({
      testName: "Only Test",
      testCase: "the only case",
      status: "passed",
      source: "cache",
      durationMs: 250,
    });

    const runner = new TestRunner(config, reporter, executeFn);
    await runner.run();

    const completeCalls = calls.filter((c) => c.method === "onTestComplete");
    expect(completeCalls).toHaveLength(1);
    expect(completeCalls[0].args[0]).toBe("Only Test");
    expect(completeCalls[0].args[1]).toBe("passed");
    expect(completeCalls[0].args[2]).toBe("cache");
    expect(completeCalls[0].args[3]).toBe(250);
  });

  it("calls reporter.onRunComplete with aggregated data", async () => {
    const config = makeConfig();
    const { reporter, calls } = createMockReporter();

    const executeFn = async (testCase: string): Promise<TestResult> => ({
      testName: testCase === "check that A works" ? "Test A" : "Test B",
      testCase,
      status: "passed",
      source: "ai",
      durationMs: 100,
    });

    const runner = new TestRunner(config, reporter, executeFn);
    await runner.run();

    const runCompleteCalls = calls.filter((c) => c.method === "onRunComplete");
    expect(runCompleteCalls).toHaveLength(1);
    const data = runCompleteCalls[0].args[0] as RunResult;
    expect(data.results).toHaveLength(2);
    expect(data.passed).toBe(2);
    expect(data.failed).toBe(0);
  });

  it("resolves per-test baseUrl override correctly", async () => {
    const config = makeConfig({
      baseUrl: "https://default.com",
      tests: [
        { name: "Default URL", case: "case a", type: "browser" as const },
        {
          name: "Override URL",
          case: "case b",
          baseUrl: "https://override.com",
          type: "browser" as const,
        },
      ],
    });
    const { reporter } = createMockReporter();

    const receivedBaseUrls: string[] = [];
    const executeFn = async (testCase: string, baseUrl: string): Promise<TestResult> => {
      receivedBaseUrls.push(baseUrl);
      return {
        testName: testCase === "case a" ? "Default URL" : "Override URL",
        testCase,
        status: "passed",
        source: "ai",
        durationMs: 100,
      };
    };

    const runner = new TestRunner(config, reporter, executeFn);
    await runner.run();

    expect(receivedBaseUrls[0]).toBe("https://default.com");
    expect(receivedBaseUrls[1]).toBe("https://override.com");
  });

  it("handles empty baseUrl gracefully (falls back to empty string)", async () => {
    const config = makeConfig({
      // no baseUrl set on config
      tests: [{ name: "No URL", case: "case a", type: "browser" as const }],
    });
    const { reporter } = createMockReporter();

    let receivedBaseUrl = "not-set";
    const executeFn = async (testCase: string, baseUrl: string): Promise<TestResult> => {
      receivedBaseUrl = baseUrl;
      return {
        testName: "No URL",
        testCase,
        status: "passed",
        source: "ai",
        durationMs: 100,
      };
    };

    const runner = new TestRunner(config, reporter, executeFn);
    await runner.run();

    expect(receivedBaseUrl).toBe("");
  });
});
