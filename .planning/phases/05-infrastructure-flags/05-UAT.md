---
status: complete
phase: 05-infrastructure-flags
source: [05-01-SUMMARY.md, 05-02-SUMMARY.md]
started: 2026-03-12T00:45:00Z
updated: 2026-03-12T00:55:00Z
---

## Current Test

[testing complete]

## Tests

### 1. --help shows new flags
expected: Running `bun run src/cli.ts --help` lists both `--only <pattern>` and `--no-cache` options in the help text.
result: pass

### 2. --only filters tests by glob pattern
expected: Running `bun run src/cli.ts --config tests/fixtures/multi-test-config.yaml --only "Login*"` shows header "Running 2 of 4 test(s)" with a dim annotation line showing the filter pattern. Only "Login Flow" and "Login Error" tests should be selected (case-insensitive matching).
result: pass

### 3. --only zero-match exits with available test names
expected: Running `bun run src/cli.ts --config tests/fixtures/multi-test-config.yaml --only "nonexistent*"` exits with code 2 and prints a red "Error:" message followed by a bulleted list of all available test names from the config.
result: pass

### 4. --no-cache shows cache-disabled annotation
expected: Running `bun run src/cli.ts --config tests/fixtures/valid-config.yaml --no-cache` shows "(cache disabled)" as a dim annotation line in the header output.
result: pass

### 5. Annotations stack when both flags active
expected: Running with both `--only "Login*"` and `--no-cache` shows the filter annotation and "(cache disabled)" on separate lines, stacked vertically below the header.
result: pass

### 6. Unreachable baseUrl exits with clear error
expected: Running CLI with a config that has an unreachable baseUrl (e.g., http://127.0.0.1:19999) exits with code 2 and prints "Error: baseUrl unreachable: http://127.0.0.1:19999" with a suggestion to check the server.
result: pass

### 7. Skipped count in summary
expected: When using `--only` to filter tests, the summary box at the end includes a "Skipped: N" line showing how many tests were filtered out (only shown when N > 0).
result: pass

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
