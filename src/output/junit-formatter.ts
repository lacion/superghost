import path from "node:path";

import { type RunResult } from "../runner/types.ts";
import { type JsonOutputMetadata } from "./json-formatter.ts";
import { escapeXml, stripAnsi } from "./xml-utils.ts";

/**
 * Derive a classname from the config file path.
 * "tests/checkout.yaml" -> "checkout"
 * "./e2e/login-flow.yaml" -> "login-flow"
 * Empty/missing -> "superghost"
 */
function deriveClassname(configFile: string | undefined): string {
  if (!configFile) return "superghost";
  const stem = path.basename(configFile, path.extname(configFile));
  return stem || "superghost";
}

/**
 * Format a completed run result as JUnit XML.
 * Produces a single testsuite with testcase elements, including properties
 * for source and selfHealed metadata on each test.
 */
export function formatJunitOutput(
  runResult: RunResult,
  metadata: JsonOutputMetadata,
  _version: string,
  _exitCode: number,
): string {
  const classname = deriveClassname(metadata.configFile);
  const failures = runResult.results.filter((r) => r.status === "failed").length;
  const totalTime = (runResult.totalDurationMs / 1000).toFixed(3);

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<testsuite name="${escapeXml(classname)}" tests="${runResult.results.length}" failures="${failures}" errors="0" skipped="${runResult.skipped}" time="${totalTime}" timestamp="${escapeXml(metadata.timestamp)}">`,
  );

  for (const result of runResult.results) {
    const testTime = (result.durationMs / 1000).toFixed(3);
    lines.push(
      `  <testcase classname="${escapeXml(classname)}" name="${escapeXml(result.testName)}" time="${testTime}">`,
    );
    lines.push("    <properties>");
    lines.push(`      <property name="source" value="${escapeXml(result.source)}"/>`);
    lines.push(`      <property name="selfHealed" value="${result.selfHealed === true}"/>`);
    lines.push("    </properties>");

    if (result.status === "failed" && result.error) {
      const strippedError = stripAnsi(result.error);
      const messageAttr = escapeXml(strippedError.replace(/\n/g, " "));
      const bodyText = escapeXml(strippedError);
      lines.push(`    <failure message="${messageAttr}" type="TestFailure">${bodyText}</failure>`);
    }

    lines.push("  </testcase>");
  }

  lines.push("</testsuite>");
  return lines.join("\n");
}

/**
 * Format a dry-run test listing as JUnit XML.
 * All testcases are marked as skipped.
 */
export function formatJunitDryRun(
  tests: Array<{ name: string; case: string; source: "cache" | "ai" }>,
  metadata: JsonOutputMetadata,
  _version: string,
): string {
  const classname = deriveClassname(metadata.configFile);

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<testsuite name="${escapeXml(classname)}" tests="${tests.length}" failures="0" errors="0" skipped="${tests.length}" time="0.000" timestamp="${escapeXml(metadata.timestamp)}">`,
  );

  for (const t of tests) {
    lines.push(`  <testcase classname="${escapeXml(classname)}" name="${escapeXml(t.name)}" time="0.000">`);
    lines.push("    <properties>");
    lines.push(`      <property name="source" value="${escapeXml(t.source)}"/>`);
    lines.push(`      <property name="selfHealed" value="false"/>`);
    lines.push("    </properties>");
    lines.push("    <skipped/>");
    lines.push("  </testcase>");
  }

  lines.push("</testsuite>");
  return lines.join("\n");
}

/**
 * Format an error condition as JUnit XML.
 * Produces a testsuite with a single error testcase.
 */
export function formatJunitError(
  errorMessage: string,
  _version: string,
  metadata: Partial<JsonOutputMetadata>,
): string {
  const strippedError = stripAnsi(errorMessage);
  const escapedMessage = escapeXml(strippedError);

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(
    `<testsuite name="superghost" tests="1" failures="0" errors="1" skipped="0" time="0.000" timestamp="${escapeXml(metadata.timestamp ?? new Date().toISOString())}">`,
  );
  lines.push('  <testcase classname="superghost" name="SuperGhost Error" time="0.000">');
  lines.push(`    <error message="${escapedMessage}" type="RuntimeError">${escapedMessage}</error>`);
  lines.push("  </testcase>");
  lines.push("</testsuite>");
  return lines.join("\n");
}
