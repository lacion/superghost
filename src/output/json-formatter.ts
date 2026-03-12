import { type RunResult } from "../runner/types.ts";

/** Metadata about the test run environment and configuration */
export interface JsonOutputMetadata {
  model: string;
  provider: string;
  configFile: string;
  baseUrl: string | undefined;
  timestamp: string;
  filter?: {
    pattern: string;
    matched: number;
    total: number;
  };
}

/** Top-level JSON output structure for all output modes */
export interface JsonOutput {
  version: string;
  success: boolean;
  exitCode: number;
  dryRun?: boolean;
  error?: string;
  metadata: JsonOutputMetadata;
  summary: {
    passed: number;
    failed: number;
    cached: number;
    skipped: number;
    total?: number;
    totalDurationMs?: number;
  };
  tests: Array<{
    testName: string;
    testCase: string;
    status?: string;
    source: string;
    durationMs?: number;
    selfHealed?: boolean;
    error?: string;
  }>;
}

/**
 * Format a completed run result as JSON.
 * Only includes selfHealed when true, only includes error when present.
 */
export function formatJsonOutput(
  runResult: RunResult,
  metadata: JsonOutputMetadata,
  version: string,
  exitCode: number,
): string {
  const output: JsonOutput = {
    version,
    success: exitCode === 0,
    exitCode,
    metadata,
    summary: {
      passed: runResult.passed,
      failed: runResult.failed,
      cached: runResult.cached,
      skipped: runResult.skipped,
      totalDurationMs: runResult.totalDurationMs,
    },
    tests: runResult.results.map((r) => {
      const entry: Record<string, unknown> = {
        testName: r.testName,
        testCase: r.testCase,
        status: r.status,
        source: r.source,
        durationMs: r.durationMs,
      };
      if (r.selfHealed === true) {
        entry.selfHealed = true;
      }
      if (r.error !== undefined) {
        entry.error = r.error;
      }
      return entry as JsonOutput["tests"][number];
    }),
  };

  return JSON.stringify(output, null, 2);
}

/**
 * Format a dry-run test listing as JSON.
 * Produces dryRun: true, exitCode: 0, success: true.
 */
export function formatJsonDryRun(
  tests: Array<{ name: string; case: string; source: "cache" | "ai" }>,
  metadata: JsonOutputMetadata,
  version: string,
): string {
  const cachedCount = tests.filter((t) => t.source === "cache").length;

  const output: JsonOutput = {
    version,
    success: true,
    exitCode: 0,
    dryRun: true,
    metadata,
    summary: {
      passed: 0,
      failed: 0,
      cached: cachedCount,
      skipped: 0,
      total: tests.length,
    },
    tests: tests.map((t) => ({
      testName: t.name,
      testCase: t.case,
      source: t.source,
    })),
  };

  return JSON.stringify(output, null, 2);
}

/**
 * Format an error condition as JSON.
 * Produces success: false, exitCode: 2, with the error message.
 */
export function formatJsonError(errorMessage: string, version: string, metadata: Partial<JsonOutputMetadata>): string {
  const fullMetadata: JsonOutputMetadata = {
    model: metadata.model ?? "",
    provider: metadata.provider ?? "",
    configFile: metadata.configFile ?? "",
    baseUrl: metadata.baseUrl,
    timestamp: metadata.timestamp ?? new Date().toISOString(),
  };

  const output: JsonOutput = {
    version,
    success: false,
    exitCode: 2,
    error: errorMessage,
    metadata: fullMetadata,
    summary: {
      passed: 0,
      failed: 0,
      cached: 0,
      skipped: 0,
    },
    tests: [],
  };

  return JSON.stringify(output, null, 2);
}
