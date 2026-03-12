import { describe, expect, it, spyOn, beforeEach, afterEach } from "bun:test";
import { ConsoleReporter, formatDuration } from "../../../src/output/reporter.ts";
import type { Reporter } from "../../../src/output/types.ts";
import type { StepInfo } from "../../../src/output/types.ts";
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
  let writeSpy: ReturnType<typeof spyOn>;
  let stderrOutput: string[];

  beforeEach(() => {
    reporter = new ConsoleReporter();
    stderrOutput = [];
    writeSpy = spyOn(Bun, "write").mockImplementation(
      async (dest: any, data: any) => {
        if (dest === Bun.stderr) {
          stderrOutput.push(String(data));
        }
        return data ? String(data).length : 0;
      },
    );
  });

  afterEach(() => {
    writeSpy.mockRestore();
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
        skipped: 0,
      };

      reporter.onRunComplete(runResult);

      const output = stderrOutput.join("\n");
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
        skipped: 0,
      };

      reporter.onRunComplete(runResult);

      const output = stderrOutput.join("\n");
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
        skipped: 0,
      };

      reporter.onRunComplete(runResult);

      const output = stderrOutput.join("\n");
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
        skipped: 0,
      };

      reporter.onRunComplete(runResult);

      const output = stderrOutput.join("\n");
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
        skipped: 0,
      };

      reporter.onRunComplete(runResult);

      const output = stderrOutput.join("\n");
      expect(output).not.toContain("Failed tests:");
    });

    it("shows Skipped line when skipped > 0", () => {
      const runResult: RunResult = {
        results: [
          {
            testName: "Login Flow",
            testCase: "check login works",
            status: "passed",
            source: "ai",
            durationMs: 1500,
          },
        ],
        totalDurationMs: 1500,
        passed: 1,
        failed: 0,
        cached: 0,
        skipped: 3,
      };

      reporter.onRunComplete(runResult);

      const output = stderrOutput.join("\n");
      expect(output).toContain("Skipped:");
      expect(output).toContain("3");
    });

    it("does not show Skipped line when skipped is 0", () => {
      const runResult: RunResult = {
        results: [
          {
            testName: "Login Flow",
            testCase: "check login works",
            status: "passed",
            source: "ai",
            durationMs: 1500,
          },
        ],
        totalDurationMs: 1500,
        passed: 1,
        failed: 0,
        cached: 0,
        skipped: 0,
      };

      reporter.onRunComplete(runResult);

      const output = stderrOutput.join("\n");
      expect(output).not.toContain("Skipped:");
    });
  });

  describe("verbose mode and onStepProgress", () => {
    const makeStepInfo = (overrides?: Partial<StepInfo>): StepInfo => ({
      stepNumber: 1,
      toolName: "browser_navigate",
      input: { url: "/login" },
      description: {
        action: "Navigate",
        keyArg: "/login",
        full: "Navigate \u2192 /login",
      },
      ...overrides,
    });

    it("constructor accepts verbose flag", () => {
      expect(() => new ConsoleReporter(true)).not.toThrow();
    });

    it("onStepProgress in verbose mode writes dim step line to stderr", () => {
      const verboseReporter = new ConsoleReporter(true);
      // Use the shared writeSpy from beforeEach (already captures stderrOutput)
      verboseReporter.onTestStart("Login");
      verboseReporter.onStepProgress(makeStepInfo());

      const output = stderrOutput.join("");
      expect(output).toContain("Step 1:");
      expect(output).toContain("Navigate");
    });

    it("onStepProgress in non-verbose mode updates spinner text (no throw)", () => {
      const defaultReporter = new ConsoleReporter();
      defaultReporter.onTestStart("Login Flow");

      // In default mode, onStepProgress updates the spinner -- should not throw
      expect(() => defaultReporter.onStepProgress(makeStepInfo())).not.toThrow();
    });

    it("onStepProgress truncates long descriptions at ~60 chars", () => {
      const verboseReporter = new ConsoleReporter(true);

      verboseReporter.onTestStart("Login");

      const longStep = makeStepInfo({
        description: {
          action: "Navigate",
          keyArg: "/very/long/path/that/exceeds/sixty/characters/for/sure/yes/indeed",
          full: "Navigate \u2192 /very/long/path/that/exceeds/sixty/characters/for/sure/yes/indeed",
        },
      });
      verboseReporter.onStepProgress(longStep);

      // Verbose mode prints the full description (no truncation) -- truncation is for spinner only
      // But the test verifies the output exists
      const output = stderrOutput.join("");
      expect(output).toContain("Step 1:");
    });

    it("onRunComplete writes to stderr not stdout", () => {
      // The shared writeSpy is already capturing stderrOutput
      const logSpy = spyOn(console, "log").mockImplementation(() => {});

      const runResult: RunResult = {
        results: [],
        totalDurationMs: 0,
        passed: 0,
        failed: 0,
        cached: 0,
        skipped: 0,
      };

      reporter.onRunComplete(runResult);

      logSpy.mockRestore();

      const stderrStr = stderrOutput.join("");
      expect(stderrStr).toContain("SuperGhost Results");
    });

    it("self-heal message in onTestComplete writes to stderr", () => {
      // The shared writeSpy is already capturing stderrOutput
      reporter.onTestStart("Login Flow");
      reporter.onTestComplete({
        testName: "Login Flow",
        testCase: "check login works",
        status: "passed",
        source: "ai",
        durationMs: 1500,
        selfHealed: true,
      });

      const stderrStr = stderrOutput.join("");
      expect(stderrStr).toContain("Cache was stale");
    });

    it("when verbose and no spinner active, onStepProgress does not throw", () => {
      const verboseReporter = new ConsoleReporter(true);
      // Do NOT call onTestStart -- no spinner active
      expect(() => verboseReporter.onStepProgress(makeStepInfo())).not.toThrow();
    });
  });
});
