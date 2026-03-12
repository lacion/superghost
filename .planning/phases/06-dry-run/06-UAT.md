---
status: complete
phase: 06-dry-run
source: [06-01-SUMMARY.md]
started: 2026-03-12T12:10:00Z
updated: 2026-03-12T12:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. --help shows --dry-run option
expected: Run `bunx superghost --help` or `bun run src/cli.ts --help`. Help output includes `--dry-run` option with description.
result: pass

### 2. --dry-run lists tests with source labels
expected: Run `OPENAI_API_KEY=fake bun run src/cli.ts --config tests/fixtures/multi-test-config.yaml --dry-run`. Output lists all 4 test names (Login Flow, Login Error, Dashboard Load, Checkout Process) each with `(ai)` source label. Shows summary line "4 tests, 0 cached". Exits 0.
result: pass

### 3. --dry-run validates config (exits 2 on bad YAML)
expected: Run `bun run src/cli.ts --config tests/fixtures/bad-syntax.yaml --dry-run`. Exits with code 2 and stderr contains a YAML error message.
result: pass

### 4. --dry-run exits 2 on missing API key
expected: Run `OPENAI_API_KEY= bun run src/cli.ts --config tests/fixtures/multi-test-config.yaml --dry-run` (empty API key). Exits with code 2 and stderr contains "Missing API key".
result: pass

### 5. --dry-run skips preflight (unreachable baseUrl exits 0)
expected: Create a temp config with `baseUrl: http://127.0.0.1:19999` and run with `--dry-run` and a fake API key. Should exit 0 (NOT 2) — proves preflight reachability check is skipped.
result: pass

### 6. --dry-run + --only filters then lists
expected: Run `OPENAI_API_KEY=fake bun run src/cli.ts --config tests/fixtures/multi-test-config.yaml --dry-run --only "Login*"`. Output shows only "Login Flow" and "Login Error" (not Dashboard Load or Checkout Process). Shows "2 of 4" in header. Exits 0.
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
