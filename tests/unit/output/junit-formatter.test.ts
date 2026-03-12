import { describe, expect, test } from "bun:test";

import {
  formatJunitDryRun,
  formatJunitError,
  formatJunitOutput,
} from "../../../src/output/junit-formatter.ts";
import { type JsonOutputMetadata } from "../../../src/output/json-formatter.ts";
import { type RunResult } from "../../../src/runner/types.ts";

function makeMetadata(overrides?: Partial<JsonOutputMetadata>): JsonOutputMetadata {
  return {
    model: "gpt-4o",
    provider: "openai",
    configFile: "tests/checkout.yaml",
    baseUrl: "https://example.com",
    timestamp: "2026-01-15T10:00:00.000Z",
    ...overrides,
  };
}

describe("formatJunitOutput", () => {
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

  test("produces XML with declaration", () => {
    const xml = formatJunitOutput(runResult, makeMetadata(), "0.4.0", 1);
    expect(xml).toStartWith('<?xml version="1.0" encoding="UTF-8"?>');
  });

  test("produces single testsuite element", () => {
    const xml = formatJunitOutput(runResult, makeMetadata(), "0.4.0", 1);
    expect(xml).toContain("<testsuite");
    expect(xml).toContain("</testsuite>");
  });

  test("testsuite name and classname derived from config filename stem", () => {
    const xml = formatJunitOutput(runResult, makeMetadata(), "0.4.0", 1);
    expect(xml).toMatch(/name="checkout"/);
  });

  test("testsuite has tests, failures, errors, skipped, time, timestamp attributes", () => {
    const xml = formatJunitOutput(runResult, makeMetadata(), "0.4.0", 1);
    expect(xml).toMatch(/tests="3"/);
    expect(xml).toMatch(/failures="1"/);
    expect(xml).toMatch(/errors="0"/);
    expect(xml).toMatch(/skipped="0"/);
    expect(xml).toMatch(/time="8.720"/);
    expect(xml).toMatch(/timestamp="2026-01-15T10:00:00.000Z"/);
  });

  test("time attribute is in seconds", () => {
    const xml = formatJunitOutput(runResult, makeMetadata(), "0.4.0", 1);
    // 8720ms = 8.720s
    expect(xml).toMatch(/time="8\.720"/);
  });

  test("each testcase has properties block with source and selfHealed", () => {
    const xml = formatJunitOutput(runResult, makeMetadata(), "0.4.0", 1);
    // All testcases should have properties with source and selfHealed
    expect(xml).toMatch(/<property name="source" value="cache"/);
    expect(xml).toMatch(/<property name="source" value="ai"/);
    expect(xml).toMatch(/<property name="selfHealed" value="true"/);
    expect(xml).toMatch(/<property name="selfHealed" value="false"/);
  });

  test("failed test has failure element with message and type", () => {
    const xml = formatJunitOutput(runResult, makeMetadata(), "0.4.0", 1);
    expect(xml).toMatch(/type="TestFailure"/);
    expect(xml).toMatch(/message="Button not found"/);
  });

  test("failure element text contains full error detail", () => {
    const xml = formatJunitOutput(runResult, makeMetadata(), "0.4.0", 1);
    expect(xml).toContain(">Button not found</failure>");
  });

  test("XML-special chars in test names are escaped", () => {
    const result: RunResult = {
      results: [
        { testName: "Test <special> & \"chars\"", testCase: "case", status: "passed", source: "ai", durationMs: 100 },
      ],
      totalDurationMs: 100,
      passed: 1,
      failed: 0,
      cached: 0,
      skipped: 0,
    };
    const xml = formatJunitOutput(result, makeMetadata(), "0.4.0", 0);
    expect(xml).toContain("Test &lt;special&gt; &amp; &quot;chars&quot;");
  });

  test("ANSI codes in error messages are stripped", () => {
    const result: RunResult = {
      results: [
        {
          testName: "Ansi Test",
          testCase: "case",
          status: "failed",
          source: "ai",
          durationMs: 100,
          error: "\x1b[31mRed error\x1b[0m",
        },
      ],
      totalDurationMs: 100,
      passed: 0,
      failed: 1,
      cached: 0,
      skipped: 0,
    };
    const xml = formatJunitOutput(result, makeMetadata(), "0.4.0", 1);
    expect(xml).toContain("Red error");
    expect(xml).not.toContain("\x1b[31m");
  });

  test("pretty-printed with 2-space indentation", () => {
    const xml = formatJunitOutput(runResult, makeMetadata(), "0.4.0", 1);
    expect(xml).toContain("  <testcase");
    expect(xml).toContain("    <properties>");
  });

  test("failure message attribute has newlines replaced with spaces", () => {
    const result: RunResult = {
      results: [
        {
          testName: "Multiline",
          testCase: "case",
          status: "failed",
          source: "ai",
          durationMs: 100,
          error: "Line 1\nLine 2\nLine 3",
        },
      ],
      totalDurationMs: 100,
      passed: 0,
      failed: 1,
      cached: 0,
      skipped: 0,
    };
    const xml = formatJunitOutput(result, makeMetadata(), "0.4.0", 1);
    expect(xml).toMatch(/message="Line 1 Line 2 Line 3"/);
  });

  test("failure element body preserves newlines in error", () => {
    const result: RunResult = {
      results: [
        {
          testName: "Multiline",
          testCase: "case",
          status: "failed",
          source: "ai",
          durationMs: 100,
          error: "Line 1\nLine 2",
        },
      ],
      totalDurationMs: 100,
      passed: 0,
      failed: 1,
      cached: 0,
      skipped: 0,
    };
    const xml = formatJunitOutput(result, makeMetadata(), "0.4.0", 1);
    expect(xml).toContain("Line 1\nLine 2</failure>");
  });

  test("classname fallback for empty configFile", () => {
    const xml = formatJunitOutput(runResult, makeMetadata({ configFile: "" }), "0.4.0", 1);
    expect(xml).toMatch(/name="superghost"/);
  });

  test("classname derivation from path with directory", () => {
    const xml = formatJunitOutput(runResult, makeMetadata({ configFile: "./e2e/login-flow.yaml" }), "0.4.0", 1);
    expect(xml).toMatch(/name="login-flow"/);
  });
});

describe("formatJunitDryRun", () => {
  const tests = [
    { name: "Login Flow", case: "check login works", source: "cache" as const },
    { name: "Dashboard Load", case: "check dashboard loads", source: "ai" as const },
  ];

  test("produces testsuite with skipped testcases", () => {
    const xml = formatJunitDryRun(tests, makeMetadata(), "0.4.0");
    expect(xml).toContain("<skipped/>");
    // Each test should have a skipped element
    const skippedCount = (xml.match(/<skipped\/>/g) || []).length;
    expect(skippedCount).toBe(2);
  });

  test("testsuite has tests=N, skipped=N, failures=0, time=0.000", () => {
    const xml = formatJunitDryRun(tests, makeMetadata(), "0.4.0");
    expect(xml).toMatch(/tests="2"/);
    expect(xml).toMatch(/skipped="2"/);
    expect(xml).toMatch(/failures="0"/);
    expect(xml).toMatch(/time="0\.000"/);
  });

  test("each skipped testcase has properties with source", () => {
    const xml = formatJunitDryRun(tests, makeMetadata(), "0.4.0");
    expect(xml).toMatch(/<property name="source" value="cache"/);
    expect(xml).toMatch(/<property name="source" value="ai"/);
  });

  test("each skipped testcase has selfHealed=false", () => {
    const xml = formatJunitDryRun(tests, makeMetadata(), "0.4.0");
    const selfHealedCount = (xml.match(/<property name="selfHealed" value="false"/g) || []).length;
    expect(selfHealedCount).toBe(2);
  });

  test("produces XML declaration", () => {
    const xml = formatJunitDryRun(tests, makeMetadata(), "0.4.0");
    expect(xml).toStartWith('<?xml version="1.0" encoding="UTF-8"?>');
  });
});

describe("formatJunitError", () => {
  test("produces testsuite with single error testcase", () => {
    const xml = formatJunitError("Config not found", "0.4.0", { configFile: "test.yaml" });
    expect(xml).toMatch(/tests="1"/);
    expect(xml).toMatch(/errors="1"/);
    expect(xml).toMatch(/failures="0"/);
  });

  test("testcase has classname=superghost and name=SuperGhost Error", () => {
    const xml = formatJunitError("Config not found", "0.4.0", {});
    expect(xml).toMatch(/classname="superghost"/);
    expect(xml).toMatch(/name="SuperGhost Error"/);
  });

  test("testcase has error element with type=RuntimeError", () => {
    const xml = formatJunitError("Config not found", "0.4.0", {});
    expect(xml).toMatch(/type="RuntimeError"/);
    expect(xml).toContain("Config not found</error>");
  });

  test("error message attribute has XML chars escaped", () => {
    const xml = formatJunitError("Error: <bad> & \"worse\"", "0.4.0", {});
    expect(xml).toContain("&lt;bad&gt; &amp; &quot;worse&quot;");
  });

  test("produces XML declaration", () => {
    const xml = formatJunitError("err", "0.4.0", {});
    expect(xml).toStartWith('<?xml version="1.0" encoding="UTF-8"?>');
  });

  test("testsuite time is 0.000", () => {
    const xml = formatJunitError("err", "0.4.0", {});
    expect(xml).toMatch(/time="0\.000"/);
  });
});
