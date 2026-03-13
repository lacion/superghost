---
status: complete
phase: 15-env-var-interpolation
source: [15-01-SUMMARY.md, 15-02-SUMMARY.md]
started: 2026-03-13T15:10:00Z
updated: 2026-03-13T15:15:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Basic env var resolution in config
expected: Create a config YAML with `baseUrl: ${TEST_BASE_URL}`. Set `TEST_BASE_URL=https://example.com` in env. Run super-ghost with that config. The resolved baseUrl should be `https://example.com` — no literal `${...}` in output.
result: pass

### 2. Default value fallback
expected: Use `${UNSET_VAR:-fallback_value}` in a config field WITHOUT setting `UNSET_VAR`. Run super-ghost. The field should resolve to `fallback_value`. Then SET `UNSET_VAR=override` and re-run — the field should resolve to `override`.
result: pass

### 3. Required var error with exit code 2
expected: Use `${MISSING_VAR:?This var is required}` in a config field. Do NOT set `MISSING_VAR`. Run super-ghost. It should exit with code 2 and print an error message listing `MISSING_VAR` as missing. Multiple missing vars should all be listed in one error (batched, not one-at-a-time).
result: pass

### 4. Cache files don't contain resolved secrets
expected: Set an env var (e.g., `SECRET_TOKEN=my-secret-value`) and use `${SECRET_TOKEN}` in your config. Run super-ghost so it creates cache entries. Inspect the `.superghostcache` directory — cache files should contain the template `${SECRET_TOKEN}`, NOT the literal `my-secret-value`.
result: pass

### 5. Cache invalidation on env var change
expected: Run super-ghost with `MY_VAR=value1` so it caches results. Then change to `MY_VAR=value2` and re-run. The tool should NOT serve stale cached results from `value1` — it should re-execute tests against the new value.
result: pass

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
