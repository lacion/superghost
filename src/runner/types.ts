/** Status of a completed test */
export type TestStatus = "passed" | "failed";

/** Source of the test result */
export type TestSource = "cache" | "ai";

/** Result of executing a single test case */
export interface TestResult {
  testName: string;
  testCase: string;
  status: TestStatus;
  source: TestSource;
  durationMs: number;
  error?: string;
  /** Whether this test self-healed from a stale cache */
  selfHealed?: boolean;
}

/** Overall run result from the test runner */
export interface RunResult {
  results: TestResult[];
  totalDurationMs: number;
  passed: number;
  failed: number;
  cached: number;
  skipped: number;
}
