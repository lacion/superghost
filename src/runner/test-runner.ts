import { type Config } from "../config/types.ts";
import { type Reporter } from "../output/types.ts";
import { type RunResult, type TestResult } from "./types.ts";

/** Function signature for executing a single test case */
export type ExecuteFn = (testCase: string, baseUrl: string, testContext?: string) => Promise<TestResult>;

/**
 * Orchestrates sequential execution of all test cases.
 * Calls reporter hooks before/after each test and after the full run.
 * Delegates individual test execution to the provided execute function.
 */
export class TestRunner {
  private readonly config: Config;
  private readonly reporter: Reporter;
  private readonly executeFn: ExecuteFn;

  constructor(config: Config, reporter: Reporter, executeFn: ExecuteFn) {
    this.config = config;
    this.reporter = reporter;
    this.executeFn = executeFn;
  }

  /** Run all test cases sequentially and return aggregate results */
  async run(): Promise<RunResult> {
    const startTime = Date.now();
    const results: TestResult[] = [];

    for (const test of this.config.tests) {
      const baseUrl = test.baseUrl ?? this.config.baseUrl ?? "";

      this.reporter.onTestStart(test.name);

      const result = await this.executeFn(test.case, baseUrl, test.context);
      // Ensure testName uses the configured test.name (display name), not the raw testCase
      const displayResult = { ...result, testName: test.name };
      results.push(displayResult);

      this.reporter.onTestComplete(displayResult);
    }

    const runResult = aggregateResults(results, Date.now() - startTime);
    this.reporter.onRunComplete(runResult);
    return runResult;
  }
}

/** Aggregate individual test results into a run summary */
function aggregateResults(results: TestResult[], totalDurationMs: number): RunResult {
  return {
    results,
    totalDurationMs,
    passed: results.filter((r) => r.status === "passed").length,
    failed: results.filter((r) => r.status === "failed").length,
    cached: results.filter((r) => r.source === "cache" && r.status === "passed").length,
    skipped: 0,
  };
}
