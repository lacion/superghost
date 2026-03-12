---
phase: 09-json-output
plan: 01
subsystem: output
tags: [json, cli, commander, stdout, stderr, structured-output]

requires:
  - phase: 07-cli-runner
    provides: writeStderr helper, stdout-reserved convention, Commander CLI setup
provides:
  - "--output json flag producing valid JSON on stdout"
  - "formatJsonOutput, formatJsonDryRun, formatJsonError pure functions"
  - "JsonOutput and JsonOutputMetadata type interfaces"
  - "Commander configureOutput redirecting help/version to stderr"
affects: [10-exit-codes, 11-cache-safety]

tech-stack:
  added: []
  patterns: [pure-formatter-functions, stdout-json-stderr-human, configureOutput-redirect]

key-files:
  created:
    - src/output/json-formatter.ts
    - tests/unit/output/json-formatter.test.ts
  modified:
    - src/cli.ts
    - src/output/banner.ts
    - tests/integration/cli-pipeline.test.ts
    - tests/integration/binary-build.test.ts

key-decisions:
  - "Banner animation redirected to stderr to enforce stdout-reserved invariant"
  - "JSON output includes conditional fields (selfHealed only when true, error only when present)"
  - "Error catch blocks emit valid JSON to stdout before exiting when --output json active"

patterns-established:
  - "Pure formatter pattern: json-formatter.ts exports stateless functions, CLI wires them"
  - "Dual-output pattern: human-readable on stderr + structured on stdout simultaneously"

requirements-completed: [OUT-01, OUT-03, OUT-04]

duration: 4min
completed: 2026-03-12
---

# Phase 9 Plan 1: JSON Output Summary

**`--output json` flag with pure formatter functions, configureOutput stderr redirect, and dual stdout/stderr output**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-12T21:34:01Z
- **Completed:** 2026-03-12T21:38:24Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Pure formatter module with formatJsonOutput, formatJsonDryRun, formatJsonError functions and TypeScript interfaces
- `--output json` flag on CLI producing valid JSON on stdout for dry-run, run, and error paths
- Commander help/version output redirected to stderr via configureOutput (OUT-04)
- Human-readable stderr progress continues simultaneously with JSON stdout (OUT-03)
- 17 unit tests + 7 new integration tests, all 240 tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Create json-formatter.ts with types and unit tests** - `d362507` (test: RED), `94040c3` (feat: GREEN)
2. **Task 2: Wire --output flag into CLI, configureOutput, and integration tests** - `f66695c` (feat)

_Note: Task 1 used TDD with RED/GREEN commits_

## Files Created/Modified
- `src/output/json-formatter.ts` - Pure formatter functions and JSON output type interfaces
- `src/cli.ts` - --output flag, configureOutput, JSON output wiring in dry-run/run/error paths
- `src/output/banner.ts` - Banner animation redirected from stdout to stderr
- `tests/unit/output/json-formatter.test.ts` - 17 unit tests for all three formatter functions
- `tests/integration/cli-pipeline.test.ts` - Updated help/version tests + 7 new output json tests
- `tests/integration/binary-build.test.ts` - Updated --version test to check stderr

## Decisions Made
- Banner animation redirected to stderr to enforce the stdout-reserved invariant established in Phase 7
- JSON output uses conditional fields: selfHealed only included when true, error only when present
- All error catch blocks emit valid JSON to stdout before exiting when --output json is active

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Banner animation writing to stdout instead of stderr**
- **Found during:** Task 2 (integration tests failing)
- **Issue:** `animateBanner()` in `src/output/banner.ts` used `process.stdout.write`, causing --help stdout to contain banner text instead of being empty
- **Fix:** Changed all `process.stdout.write` to `process.stderr.write` and `process.stdout.isTTY` to `process.stderr.isTTY` in banner.ts
- **Files modified:** src/output/banner.ts
- **Verification:** `bun run src/cli.ts --help 2>/dev/null` produces empty output
- **Committed in:** f66695c (Task 2 commit)

**2. [Rule 1 - Bug] Binary build test checking stdout for --version**
- **Found during:** Task 2 (test suite run)
- **Issue:** `tests/integration/binary-build.test.ts` checked `stdout` for version string, but configureOutput now sends it to stderr
- **Fix:** Updated test to check `stderr` instead of `stdout`
- **Files modified:** tests/integration/binary-build.test.ts
- **Verification:** All 240 tests pass
- **Committed in:** f66695c (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for stdout-reserved invariant. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- JSON output infrastructure complete, ready for Phase 10 (exit codes) and Phase 11 (cache safety)
- `formatJsonOutput` and `formatJsonError` available for any future structured output needs

---
*Phase: 09-json-output*
*Completed: 2026-03-12*
