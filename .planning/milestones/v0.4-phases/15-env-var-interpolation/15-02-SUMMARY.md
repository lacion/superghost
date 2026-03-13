---
phase: 15-env-var-interpolation
plan: 02
subsystem: config
tags: [interpolation, env-vars, cache, integration, tdd]

requires:
  - phase: 15-01
    provides: "interpolateConfig() function and InterpolationResult type"
provides:
  - "loadConfig returns { config, templates } with interpolation between YAML parse and Zod validate"
  - "Template-aware CacheManager that stores template forms instead of resolved secrets"
  - "Full pipeline: YAML parse -> interpolate -> Zod validate -> templates flow to cache"
affects: [cache, cli]

tech-stack:
  added: []
  patterns: ["template-aware cache hashing with v2 prefix format extension", "optional parameter threading for backward compatibility"]

key-files:
  created:
    - tests/fixtures/env-var-config.yaml
  modified:
    - src/config/loader.ts
    - src/cache/cache-manager.ts
    - src/runner/test-executor.ts
    - src/runner/test-runner.ts
    - src/cli.ts
    - tests/unit/config/loader.test.ts
    - tests/unit/cache/cache-manager.test.ts

key-decisions:
  - "loadConfig return type changed to { config, templates } - single caller (cli.ts) updated"
  - "CacheManager uses optional params for backward compatibility - no templates means identical behavior"
  - "Template path lookup uses testIndex for per-test field matching in template map"
  - "loadByHash private helper added to avoid hash recalculation when save checks existing entry"

patterns-established:
  - "Optional template threading: all template-aware params are optional, existing code paths unchanged"
  - "Post-parse interpolation: env var resolution runs after YAML parse on JS objects, avoiding YAML-special char issues"

requirements-completed: [CFG-01, CFG-02, CFG-03, CFG-04]

duration: 4min
completed: 2026-03-13
---

# Phase 15 Plan 02: Integration Wiring Summary

**Env var interpolation wired into loadConfig pipeline with template-aware CacheManager storing template forms instead of resolved secrets**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-13T13:56:22Z
- **Completed:** 2026-03-13T14:00:00Z
- **Tasks:** 2 (TDD task + integration task)
- **Files modified:** 9

## Accomplishments
- loadConfig returns { config, templates } with interpolation layer between YAML parse and Zod validate
- ConfigLoadError thrown for missing env vars with batched numbered list matching existing error format
- CacheManager.hashKey includes template+resolved values when provided for proper cache invalidation
- CacheManager.save stores template form ("${VAR}") for interpolated fields, never resolved secrets
- Templates threaded through cli.ts -> TestExecutor -> CacheManager.save() with testIndex for path lookup
- All 312 tests pass with zero regressions, backward compatibility maintained

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Add failing tests for loadConfig and cache templates** - `bfaeb53` (test)
2. **Task 1 (GREEN): Integrate interpolation into loadConfig and CacheManager** - `538a95f` (feat)
3. **Task 2: Thread template map through CLI and TestExecutor** - `4c7074c` (feat)

## Files Created/Modified
- `tests/fixtures/env-var-config.yaml` - Test fixture with ${VAR} references in baseUrl and tests
- `src/config/loader.ts` - Added interpolation layer, changed return type to { config, templates }
- `src/cache/cache-manager.ts` - Template-aware hashKey and save, loadByHash helper
- `src/runner/test-executor.ts` - Accepts templates, threads to CacheManager.save() with testIndex
- `src/runner/test-runner.ts` - Passes test index to executeFn for template path lookup
- `src/cli.ts` - Destructures { config, templates }, passes templates to TestExecutor
- `tests/unit/config/loader.test.ts` - 3 new env var interpolation tests, updated existing test for new return type
- `tests/unit/cache/cache-manager.test.ts` - 5 new template-aware hash and save tests

## Decisions Made
- loadConfig return type changed from `Promise<Config>` to `Promise<{ config, templates }>` -- single caller pattern made this safe
- CacheManager backward compatibility via optional params -- all existing callers work unchanged
- Added private `loadByHash` helper to avoid hash double-computation in save when checking existing entry
- TestRunner changed from for-of to indexed for loop to provide testIndex to executeFn

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added loadByHash private helper to CacheManager**
- **Found during:** Task 1 (CacheManager save implementation)
- **Issue:** When save() uses template-aware hash, the existing `load()` call to preserve createdAt would compute a different hash (non-template), failing to find the existing entry
- **Fix:** Added private `loadByHash(hash)` method, called from save() with the already-computed template-aware hash
- **Files modified:** src/cache/cache-manager.ts
- **Verification:** Cache tests pass, existing entry createdAt preserved correctly
- **Committed in:** 538a95f (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Essential for correctness of createdAt preservation. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full env var interpolation pipeline complete: YAML -> interpolate -> validate -> cache
- Cache files never contain resolved env var values -- only template forms
- Cache correctly invalidates when env var value changes (hash includes both template + resolved)
- All success criteria met, phase 15 complete

---
*Phase: 15-env-var-interpolation*
*Completed: 2026-03-13*
