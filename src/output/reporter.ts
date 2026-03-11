import pc from "picocolors";
import { createSpinner } from "nanospinner";
import type { Reporter } from "./types.ts";
import type { TestResult, RunResult } from "../runner/types.ts";

/**
 * Format milliseconds as a human-readable duration string.
 * < 1000ms shows as Xms, >= 1000ms shows as X.Xs
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * Console reporter with colored output, spinners, and box summary.
 * Colors auto-disable when stdout is not a TTY (via picocolors).
 * Spinner animation auto-disables in non-TTY (via nanospinner).
 */
export class ConsoleReporter implements Reporter {
  private spinner: ReturnType<typeof createSpinner> | null = null;

  /** Creates a spinner with the test name and starts it */
  onTestStart(testName: string): void {
    this.spinner = createSpinner(testName).start();
  }

  /** Stops spinner with success (green check) for passed, error (red X) for failed */
  onTestComplete(result: TestResult): void {
    const { testName, status, source, durationMs, selfHealed } = result;
    const sourceLabel = selfHealed ? "ai, self-healed" : source;
    const duration = pc.dim(`(${sourceLabel}, ${formatDuration(durationMs)})`);
    if (status === "passed") {
      this.spinner?.success({ text: `${testName} ${duration}` });
    } else {
      this.spinner?.error({ text: `${testName} ${duration}` });
    }
    if (selfHealed) {
      console.log(pc.dim("  Cache was stale — re-executed and updated"));
    }
    this.spinner = null;
  }

  /** Prints bordered box summary and lists failed tests with error messages */
  onRunComplete(data: RunResult): void {
    const bar = "\u2501".repeat(40);
    console.log("");
    console.log(`  ${bar}`);
    console.log("    SuperGhost Results");
    console.log(`  ${bar}`);
    console.log(`    Total:   ${data.results.length}`);
    console.log(`    Passed:  ${pc.green(String(data.passed))}`);
    console.log(
      `    Failed:  ${data.failed > 0 ? pc.red(String(data.failed)) : String(data.failed)}`,
    );
    console.log(`    Cached:  ${data.cached}`);
    console.log(`    Time:    ${pc.dim(formatDuration(data.totalDurationMs))}`);
    console.log(`  ${bar}`);

    if (data.failed > 0) {
      console.log("");
      console.log(pc.red("  Failed tests:"));
      for (const result of data.results) {
        if (result.status === "failed") {
          console.log(`    ${pc.red("-")} ${result.testName}`);
          if (result.error) {
            console.log(`      ${pc.dim(result.error)}`);
          }
        }
      }
    }
  }
}
