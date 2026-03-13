---
status: complete
phase: 14-junit-xml-output
source: [14-01-SUMMARY.md]
started: 2026-03-13T01:00:00Z
updated: 2026-03-13T13:20:00Z
---

## Current Test

[testing complete]

## Tests

### 1. JUnit XML Output for Game Run
expected: Run a game with `--output junit`. Output should be valid JUnit XML only — no human-readable text. A `<testsuite>` root with `<testcase>` elements, each having `classname`, `time`, and a `<properties>` block with `source` and `selfHealed`.
result: issue
reported: "we got more than just the xml — human-readable banner, progress lines, and results box all printed to stdout before the XML"
severity: major

### 2. JUnit XML Dry-Run Output
expected: Run with `--output junit --dry-run`. Output should be valid JUnit XML only showing dry-run results in testcase format.
result: issue
reported: "same issue — human-readable dry-run output printed before the XML"
severity: major

### 3. JUnit XML Error Output
expected: Trigger an error with `--output junit`. Output should be JUnit XML only with a `<testcase>` containing an `<error>` element.
result: issue
reported: "same — plain text error printed before the XML"
severity: major

### 4. XML Special Character Escaping
expected: XML-special characters (`&`, `<`, `>`, `"`, `'`) in output are properly escaped. XML remains valid and parseable.
result: pass

### 5. Format Flag Accepted Alongside JSON
expected: `--output json` still works. `--output junit` works. `--output invalid` shows error listing valid options. Help text mentions both formats.
result: pass

## Summary

total: 5
passed: 2
issues: 3
pending: 0
skipped: 0

## Gaps

- truth: "JUnit XML output should be the only content on stdout — no human-readable text"
  status: failed
  reason: "User reported: human-readable banner, progress lines, and results box all printed to stdout before the XML in run, dry-run, and error modes"
  severity: major
  test: 1, 2, 3
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
