import { describe, expect, it, spyOn, beforeEach, afterEach } from "bun:test";
import { ConsoleReporter, formatDuration } from "../../../src/output/reporter.ts";
import type { Reporter } from "../../../src/output/types.ts";
import type { RunResult, TestResult } from "../../../src/runner/types.ts";

describe("formatDuration", () => {
  it("formats milliseconds under 1000 as Xms", () => {
    expect(formatDuration(500)).toBe("500ms");
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  it("formats milliseconds >= 1000 as X.Xs", () => {
    expect(formatDuration(1500)).toBe("1.5s");
    expect(formatDuration(10400)).toBe("10.4s");
    expect(formatDuration(1000)).toBe("1.0s");
    expect(formatDuration(60000)).toBe("60.0s");
  });
});

describe("ConsoleReporter", () => {
  let reporter: ConsoleReporter;
  let logSpy: ReturnType<typeof spyOn>;
  let logOutput: string[];

  beforeEach(() => {
    reporter = new ConsoleReporter();
    logOutput = [];
    logSpy = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logOutput.push(args.map(String).join(" "));
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("implements the Reporter interface", () => {
    // Type check: ConsoleReporter should satisfy the Reporter interface
    const r: Reporter = reporter;
    expect(r.onTestStart).toBeFunction();
    expect(r.onTestComplete).toBeFunction();
    expect(r.onRunComplete).toBeFunction();
  });

  it("onTestStart can be called without throwing", () => {
    expect(() => reporter.onTestStart("Login Flow")).not.toThrow();
  });

  it("onTestComplete can be called without throwing for passed tests", () => {
    reporter.onTestStart("Login Flow");
    expect(() =>
      reporter.onTestComplete({
        testName: "Login Flow",
        testCase: "check login works",
        status: "passed",
        source: "ai",
        durationMs: 1500,
      }),
    ).not.toThrow();
  });

  it("onTestComplete can be called without throwing for failed tests", () => {
    reporter.onTestStart("Login Flow");
    expect(() =>
      reporter.onTestComplete({
        testName: "Login Flow",
        testCase: "check login works",
        status: "failed",
        source: "ai",
        durationMs: 500,
      }),
    ).not.toThrow();
  });

  describe("onRunComplete", () => {
    it("outputs box summary with SuperGhost Results title", () => {
      const runResult: RunResult = {
        results: [
          {
            testName: "Login Flow",
            testCase: "check login works",
            status: "passed",
            source: "ai",
            durationMs: 1500,
          },
          {
            testName: "Dashboard",
            testCase: "verify dashboard",
            status: "passed",
            source: "cache",
            durationMs: 200,
          },
        ],
        totalDurationMs: 1700,
        passed: 2,
        failed: 0,
        cached: 1,
      };

      reporter.onRunComplete(runResult);

      const output = logOutput.join("\n");
      expect(output).toContain("SuperGhost Results");
    });

    it("outputs total, passed, failed, cached counts and time", () => {
      const runResult: RunResult = {
        results: [
          {
            testName: "Test A",
            testCase: "case a",
            status: "passed",
            source: "ai",
            durationMs: 1500,
          },
          {
            testName: "Test B",
            testCase: "case b",
            status: "failed",
            source: "ai",
            durationMs: 500,
            error: "Element not found",
          },
          {
            testName: "Test C",
            testCase: "case c",
            status: "passed",
            source: "cache",
            durationMs: 100,
          },
        ],
        totalDurationMs: 2100,
        passed: 2,
        failed: 1,
        cached: 1,
      };

      reporter.onRunComplete(runResult);

      const output = logOutput.join("\n");
      expect(output).toContain("Total:");
      expect(output).toContain("3");
      expect(output).toContain("Passed:");
      expect(output).toContain("2");
      expect(output).toContain("Failed:");
      expect(output).toContain("1");
      expect(output).toContain("Cached:");
      expect(output).toContain("Time:");
      expect(output).toContain("2.1s");
    });

    it("uses heavy horizontal bar characters for borders", () => {
      const runResult: RunResult = {
        results: [],
        totalDurationMs: 0,
        passed: 0,
        failed: 0,
        cached: 0,
      };

      reporter.onRunComplete(runResult);

      const output = logOutput.join("\n");
      // U+2501 heavy horizontal line character
      expect(output).toContain("\u2501".repeat(40));
    });

    it("lists failed tests with test names and error messages", () => {
      const runResult: RunResult = {
        results: [
          {
            testName: "Login Flow",
            testCase: "check login works",
            status: "passed",
            source: "ai",
            durationMs: 1500,
          },
          {
            testName: "Dashboard Check",
            testCase: "verify dashboard loads",
            status: "failed",
            source: "ai",
            durationMs: 500,
            error: "Timeout waiting for element",
          },
          {
            testName: "Signup Flow",
            testCase: "check signup works",
            status: "failed",
            source: "ai",
            durationMs: 800,
            error: "Button not clickable",
          },
        ],
        totalDurationMs: 2800,
        passed: 1,
        failed: 2,
        cached: 0,
      };

      reporter.onRunComplete(runResult);

      const output = logOutput.join("\n");
      expect(output).toContain("Failed tests:");
      expect(output).toContain("Dashboard Check");
      expect(output).toContain("Timeout waiting for element");
      expect(output).toContain("Signup Flow");
      expect(output).toContain("Button not clickable");
    });

    it("does not list failed tests section when all pass", () => {
      const runResult: RunResult = {
        results: [
          {
            testName: "Test A",
            testCase: "case a",
            status: "passed",
            source: "ai",
            durationMs: 100,
          },
        ],
        totalDurationMs: 100,
        passed: 1,
        failed: 0,
        cached: 0,
      };

      reporter.onRunComplete(runResult);

      const output = logOutput.join("\n");
      expect(output).not.toContain("Failed tests:");
    });
  });
});
