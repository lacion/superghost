import pc from "picocolors";
import { createSpinner } from "nanospinner";
import type { Reporter, StepInfo } from "./types.ts";
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

/** Write a line of text to stderr */
export function writeStderr(text: string): void {
  Bun.write(Bun.stderr, text + "\n");
}

/**
 * Console reporter with colored output, spinners, and box summary.
 * All output routes to stderr so stdout is reserved for structured output.
 * Colors auto-disable when stdout is not a TTY (via picocolors).
 * Spinner animation auto-disables in non-TTY (via nanospinner).
 */
export class ConsoleReporter implements Reporter {
  private spinner: ReturnType<typeof createSpinner> | null = null;
  private readonly verbose: boolean;
  private currentTestName: string | null = null;

  constructor(verbose = false) {
    this.verbose = verbose;
  }

  /** Creates a spinner with the test name and starts it */
  onTestStart(testName: string): void {
    this.currentTestName = testName;
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
      writeStderr(pc.dim("  Cache was stale \u2014 re-executed and updated"));
    }
    this.spinner = null;
    this.currentTestName = null;
  }

  /** Handles per-step progress during AI execution */
  onStepProgress(step: StepInfo): void {
    if (this.verbose) {
      writeStderr(pc.dim(`    Step ${step.stepNumber}: ${step.description.full}`));
    } else if (this.spinner) {
      let spinnerText = `${this.currentTestName} \u2014 ${step.description.full}`;
      if (spinnerText.length > 60) {
        spinnerText = spinnerText.slice(0, 57) + "...";
      }
      this.spinner.update(spinnerText);
    }
  }

  /** Prints bordered box summary and lists failed tests with error messages */
  onRunComplete(data: RunResult): void {
    const bar = "\u2501".repeat(40);
    writeStderr("");
    writeStderr(`  ${bar}`);
    writeStderr("    SuperGhost Results");
    writeStderr(`  ${bar}`);
    writeStderr(`    Total:   ${data.results.length}`);
    writeStderr(`    Passed:  ${pc.green(String(data.passed))}`);
    writeStderr(
      `    Failed:  ${data.failed > 0 ? pc.red(String(data.failed)) : String(data.failed)}`,
    );
    if (data.skipped > 0) {
      writeStderr(`    Skipped: ${data.skipped}`);
    }
    writeStderr(`    Cached:  ${data.cached}`);
    writeStderr(`    Time:    ${pc.dim(formatDuration(data.totalDurationMs))}`);
    writeStderr(`  ${bar}`);

    if (data.failed > 0) {
      writeStderr("");
      writeStderr(pc.red("  Failed tests:"));
      for (const result of data.results) {
        if (result.status === "failed") {
          writeStderr(`    ${pc.red("-")} ${result.testName}`);
          if (result.error) {
            writeStderr(`      ${pc.dim(result.error)}`);
          }
        }
      }
    }
  }
}
