---
phase: 04-foundation
plan: 02
subsystem: cache
tags: [sha256, unicode-nfc, url-normalization, cache-versioning, migration]

# Dependency graph
requires:
  - phase: 04-foundation
    provides: CacheManager class, CacheEntry type, CLI startup flow
provides:
  - Normalized cache key generation (whitespace, Unicode NFC, URL hostname/trailing slash)
  - v2-prefixed cache keys that break from v1 entries
  - CacheEntry version 2 on all new saves
  - migrateV1Cache() method for silent v1 cleanup on startup
  - CLI startup wiring for v1 migration
affects: [cache, cli, testing]

# Tech tracking
tech-stack:
  added: []
  patterns: [normalization-pipeline-before-hashing, version-prefixed-cache-keys, startup-migration]

key-files:
  created: []
  modified:
    - src/cache/cache-manager.ts
    - src/cache/types.ts
    - src/cli.ts
    - tests/unit/cache/cache-manager.test.ts

key-decisions:
  - "Case-preserving normalization: different letter casing produces different cache keys (user decision from CONTEXT.md)"
  - "URL normalization via new URL() constructor for hostname lowercasing and trailing slash stripping"
  - "v2 prefix in hash input string to ensure clean break from v1 cache entries"
  - "Silent deletion strategy for v1 migration (no logging, no user notification)"

patterns-established:
  - "Normalization pipeline: NFC normalize -> whitespace collapse -> URL normalize -> version prefix -> hash"
  - "Cache versioning: version prefix in hash input + version field in CacheEntry"
  - "Startup migration: scan and clean old cache entries before test execution"

requirements-completed: [CACHE-01, CACHE-02]

# Metrics
duration: 4min
completed: 2026-03-11
---

# Phase 4 Plan 02: Cache Normalization Summary

**Normalization pipeline in hashKey() with Unicode NFC, whitespace collapse, URL normalization, v2 version prefix, and silent v1 migration on startup**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-11T22:51:30Z
- **Completed:** 2026-03-11T22:55:14Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 4

## Accomplishments
- Cache keys now resilient to whitespace differences (tabs, newlines, multiple spaces all collapse to single space)
- Unicode NFD and NFC representations produce identical cache keys
- URLs differing only in trailing slash or hostname casing produce identical cache keys
- Different letter casing preserves distinct cache keys (case-preserving per user decision)
- All new cache entries written with version: 2
- v1 cache files silently deleted on startup via migrateV1Cache()
- v2 hash prefix ensures no accidental v1 cache hits

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing tests for cache normalization, v2 prefix, and v1 migration** - `45dbc97` (test - TDD RED)
2. **Task 2: Implement normalization pipeline, v2 prefix, version bump, v1 migration, wire startup** - `b98a2dc` (feat - TDD GREEN)

_Note: Task 2 commit was bundled with 04-01 docs commit due to concurrent staging. All source changes are verified present._

## Files Created/Modified
- `src/cache/cache-manager.ts` - Added normalization pipeline in hashKey(), v2 prefix, migrateV1Cache() method, version 2 in save()
- `src/cache/types.ts` - Widened CacheEntry.version type from `1` to `1 | 2`
- `src/cli.ts` - Wired migrateV1Cache() call on startup after CacheManager instantiation
- `tests/unit/cache/cache-manager.test.ts` - 10 new tests for normalization, v2 prefix, version bump, and v1 migration

## Decisions Made
- Case-preserving normalization: different letter casing produces different cache keys (per user decision in CONTEXT.md)
- URL normalization uses `new URL()` constructor which handles hostname lowercasing and default port stripping
- Fallback for non-URL baseUrl values uses simple lowercase + trailing slash strip
- v2 prefix string format: `v2|{normalizedCase}|{normalizedUrl}`
- Silent deletion strategy for v1 migration: corrupted files skipped, missing cache dir handled gracefully

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated existing version assertion from toBe(1) to toBe(2)**
- **Found during:** Task 2 (GREEN phase)
- **Issue:** Existing test at line 74 asserted `entry.version` to be 1, but save() now writes version 2
- **Fix:** Changed assertion to `expect(entry.version).toBe(2)`
- **Files modified:** tests/unit/cache/cache-manager.test.ts
- **Verification:** All 22 cache tests pass
- **Committed in:** b98a2dc (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Necessary update to existing test assertion. No scope creep.

## Issues Encountered
- Task 2 GREEN commit was bundled with 04-01 docs commit due to concurrent execution context. All source changes verified present and correct via git diff and full test suite.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Cache normalization and versioning complete, ready for any future cache schema changes
- v1 migration wired into startup, existing users' v1 caches will be silently cleaned on next run
- Full test suite green with 163 tests passing

## Self-Check: PASSED

All files found. All commits verified. All key patterns confirmed in source files.

---
*Phase: 04-foundation*
*Completed: 2026-03-11*
