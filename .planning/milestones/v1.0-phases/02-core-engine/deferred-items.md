# Phase 02 Deferred Items

## Pre-existing Test Failures (Out of Scope)

1. **tests/unit/agent/prompt.test.ts** - Imports `src/agent/prompt.ts` which does not exist yet. Will be created by a future plan.

2. **tests/unit/runner/test-runner.test.ts** - Missing `type` field in test case objects after schema was extended with `type: "browser" | "api"`. Pre-existing from Plan 01 schema changes.
