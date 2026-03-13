import { describe, expect, test } from "bun:test";

import {
  formatJsonDryRun,
  formatJsonError,
  formatJsonOutput,
  type JsonOutput,
  type JsonOutputMetadata,
} from "../../../src/output/json-formatter.ts";
import { type RunResult } from "../../../src/runner/types.ts";

function makeMetadata(overrides?: Partial<JsonOutputMetadata>): JsonOutputMetadata {
  return {
    model: "gpt-4o",
    provider: "openai",
    configFile: "tests/fixtures/valid-config.yaml",
    baseUrl: "https://example.com",
    timestamp: "2026-01-15T10:00:00.000Z",
    ...overrides,
  };
}

describe("formatJsonOutput", () => {
  const runResult: RunResult = {
    results: [
      { testName: "Login Flow", testCase: "check login works", status: "passed", source: "cache", durationMs: 120 },
      {
        testName: "Dashboard Load",
        testCase: "check dashboard loads",
        status: "passed",
        source: "ai",
        durationMs: 3400,
        selfHealed: true,
      },
      {
        testName: "Checkout",
        testCase: "check checkout works",
        status: "failed",
        source: "ai",
        durationMs: 5200,
        error: "Button not found",
      },
    ],
    totalDurationMs: 8720,
    passed: 2,
    failed: 1,
    cached: 1,
    skipped: 0,
  };

  test("returns valid JSON with correct top-level fields", () => {
    const json = formatJsonOutput(runResult, makeMetadata(), "0.4.0", 1);
    const parsed: JsonOutput = JSON.parse(json);

    expect(parsed.version).toBe("0.4.0");
    expect(parsed.success).toBe(false);
    expect(parsed.exitCode).toBe(1);
    expect(parsed.dryRun).toBeUndefined();
  });

  test("includes correct summary counts", () => {
    const json = formatJsonOutput(runResult, makeMetadata(), "0.4.0", 1);
    const parsed: JsonOutput = JSON.parse(json);

    expect(parsed.summary.passed).toBe(2);
    expect(parsed.summary.failed).toBe(1);
    expect(parsed.summary.cached).toBe(1);
    expect(parsed.summary.skipped).toBe(0);
    expect(parsed.summary.totalDurationMs).toBe(8720);
  });

  test("maps test results with correct fields", () => {
    const json = formatJsonOutput(runResult, makeMetadata(), "0.4.0", 1);
    const parsed: JsonOutput = JSON.parse(json);

    expect(parsed.tests).toHaveLength(3);
    expect(parsed.tests[0]).toEqual({
      testName: "Login Flow",
      testCase: "check login works",
      status: "passed",
      source: "cache",
      durationMs: 120,
    });
  });

  test("selfHealed field only appears when true", () => {
    const json = formatJsonOutput(runResult, makeMetadata(), "0.4.0", 1);
    const parsed: JsonOutput = JSON.parse(json);

    // First test: selfHealed not present (was undefined)
    expect("selfHealed" in parsed.tests[0]).toBe(false);
    // Second test: selfHealed is true
    expect(parsed.tests[1].selfHealed).toBe(true);
    // Third test: selfHealed not present
    expect("selfHealed" in parsed.tests[2]).toBe(false);
  });

  test("error field only appears when present", () => {
    const json = formatJsonOutput(runResult, makeMetadata(), "0.4.0", 1);
    const parsed: JsonOutput = JSON.parse(json);

    expect("error" in parsed.tests[0]).toBe(false);
    expect("error" in parsed.tests[1]).toBe(false);
    expect(parsed.tests[2].error).toBe("Button not found");
  });

  test("includes metadata with all fields", () => {
    const json = formatJsonOutput(runResult, makeMetadata(), "0.4.0", 1);
    const parsed: JsonOutput = JSON.parse(json);

    expect(parsed.metadata.model).toBe("gpt-4o");
    expect(parsed.metadata.provider).toBe("openai");
    expect(parsed.metadata.configFile).toBe("tests/fixtures/valid-config.yaml");
    expect(parsed.metadata.baseUrl).toBe("https://example.com");
    expect(parsed.metadata.timestamp).toBe("2026-01-15T10:00:00.000Z");
  });

  test("filter metadata included when provided", () => {
    const metadata = makeMetadata({
      filter: { pattern: "Login*", matched: 2, total: 4 },
    });
    const json = formatJsonOutput(runResult, metadata, "0.4.0", 1);
    const parsed: JsonOutput = JSON.parse(json);

    expect(parsed.metadata.filter).toEqual({ pattern: "Login*", matched: 2, total: 4 });
  });

  test("filter metadata omitted when not provided", () => {
    const json = formatJsonOutput(runResult, makeMetadata(), "0.4.0", 1);
    const parsed: JsonOutput = JSON.parse(json);

    expect(parsed.metadata.filter).toBeUndefined();
  });

  test("output is pretty-printed with 2-space indent", () => {
    const json = formatJsonOutput(runResult, makeMetadata(), "0.4.0", 1);
    // Should contain indented lines
    expect(json).toContain("  ");
    // Verify it's multi-line
    expect(json.split("\n").length).toBeGreaterThan(5);
  });
});

describe("formatJsonDryRun", () => {
  const tests = [
    { name: "Login Flow", case: "check login works", source: "cache" as const },
    { name: "Dashboard Load", case: "check dashboard loads", source: "ai" as const },
  ];

  test("returns valid JSON with dryRun: true", () => {
    const json = formatJsonDryRun(tests, makeMetadata(), "0.4.0");
    const parsed: JsonOutput = JSON.parse(json);

    expect(parsed.version).toBe("0.4.0");
    expect(parsed.dryRun).toBe(true);
    expect(parsed.success).toBe(true);
    expect(parsed.exitCode).toBe(0);
  });

  test("includes summary with total and cached counts", () => {
    const json = formatJsonDryRun(tests, makeMetadata(), "0.4.0");
    const parsed: JsonOutput = JSON.parse(json);

    expect(parsed.summary.total).toBe(2);
    expect(parsed.summary.cached).toBe(1);
  });

  test("maps test entries with testName, testCase, source", () => {
    const json = formatJsonDryRun(tests, makeMetadata(), "0.4.0");
    const parsed: JsonOutput = JSON.parse(json);

    expect(parsed.tests).toHaveLength(2);
    expect(parsed.tests[0].testName).toBe("Login Flow");
    expect(parsed.tests[0].testCase).toBe("check login works");
    expect(parsed.tests[0].source).toBe("cache");
    expect(parsed.tests[1].source).toBe("ai");
  });

  test("includes metadata", () => {
    const json = formatJsonDryRun(tests, makeMetadata(), "0.4.0");
    const parsed: JsonOutput = JSON.parse(json);

    expect(parsed.metadata.model).toBe("gpt-4o");
  });
});

describe("formatJsonError", () => {
  test("returns valid JSON with error fields", () => {
    const json = formatJsonError("baseUrl unreachable", "0.4.0", {
      configFile: "test.yaml",
    });
    const parsed: JsonOutput = JSON.parse(json);

    expect(parsed.version).toBe("0.4.0");
    expect(parsed.success).toBe(false);
    expect(parsed.exitCode).toBe(2);
    expect(parsed.error).toBe("baseUrl unreachable");
  });

  test("has empty tests array and zero summary counts", () => {
    const json = formatJsonError("some error", "0.4.0", {});
    const parsed: JsonOutput = JSON.parse(json);

    expect(parsed.tests).toEqual([]);
    expect(parsed.summary.passed).toBe(0);
    expect(parsed.summary.failed).toBe(0);
    expect(parsed.summary.cached).toBe(0);
    expect(parsed.summary.skipped).toBe(0);
  });

  test("includes partial metadata", () => {
    const json = formatJsonError("err", "0.4.0", {
      configFile: "my-config.yaml",
      model: "gpt-4o",
    });
    const parsed: JsonOutput = JSON.parse(json);

    expect(parsed.metadata.configFile).toBe("my-config.yaml");
    expect(parsed.metadata.model).toBe("gpt-4o");
  });

  test("timestamp is in ISO 8601 format", () => {
    const json = formatJsonError("err", "0.4.0", {});
    const parsed: JsonOutput = JSON.parse(json);

    // Should be a valid ISO date string
    expect(parsed.metadata.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
