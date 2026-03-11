import type { RunResult, TestResult } from "../runner/types.ts";

/** Interface for output reporting */
export interface Reporter {
  onTestStart(testName: string): void;
  onTestComplete(result: TestResult): void;
  onRunComplete(data: RunResult): void;
}
