---
phase: 03-distribution
plan: 01
subsystem: distribution
tags: [npm, binary, standalone, mcp, paths, setup, readme]

requires:
  - phase: 01-foundation
    provides: CLI entry point (src/cli.ts), Commander.js CLI, package.json base
  - phase: 02-core-engine
    provides: McpManager with MCP server spawn logic (src/agent/mcp-manager.ts)
provides:
  - Distribution-ready package.json with bin, files, publishConfig, engines
  - Standalone binary detection and MCP command resolution (src/dist/paths.ts)
  - First-run MCP dependency auto-installer (src/dist/setup.ts)
  - README.md with install, CLI, provider, and config documentation
  - McpManager wired to use getMcpCommand() for distribution-aware MCP spawns
  - CLI wired to call ensureMcpDependencies() for standalone binary first-run setup
affects: [03-02 CI/CD automation, standalone binary builds]

tech-stack:
  added: []
  patterns: [standalone binary detection via process.argv, getMcpCommand distribution-aware spawn resolution, BUN_BE_BUN=1 for standalone bun install]

key-files:
  created:
    - src/dist/paths.ts
    - src/dist/setup.ts
    - README.md
    - tests/unit/dist/paths.test.ts
    - tests/unit/dist/setup.test.ts
    - tests/unit/dist/package-contents.test.ts
  modified:
    - package.json
    - src/agent/mcp-manager.ts
    - src/cli.ts
    - .gitignore

key-decisions:
  - "getMcpCommand accepts optional standalone override parameter for testability"
  - "_isStandaloneBinaryWith(argv) exported for testable binary detection without mocking process.argv"
  - ".gitignore changed from dist/ to /dist/ to avoid ignoring tests/unit/dist/"

patterns-established:
  - "Distribution-aware command resolution: getMcpCommand() abstracts bunx vs path-based spawn"
  - "First-run dependency install: ensureMcpDependencies() with marker-file check and spinner UX"

requirements-completed: [DIST-01, DIST-02, DIST-03, DIST-04]

duration: 5min
completed: 2026-03-11
---

# Phase 3 Plan 1: Distribution Packaging Summary

**npm distribution-ready package.json, standalone binary MCP auto-installer with spinner UX, and distribution-aware MCP command resolution wired into McpManager and CLI**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-11T11:57:06Z
- **Completed:** 2026-03-11T12:02:46Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- Distribution path resolution module (paths.ts) with standalone binary detection and MCP command resolution
- First-run MCP dependency auto-installer (setup.ts) with BUN_BE_BUN=1, spinner, and colored output
- Package.json updated with files whitelist, publishConfig, engines, keywords, description, scripts
- README.md with three install methods, CLI flags, all 4 providers, config reference, and standalone binary docs
- McpManager wired to use getMcpCommand() -- no hardcoded bunx commands
- CLI calls ensureMcpDependencies() when running as standalone binary before test execution

## Task Commits

Each task was committed atomically:

1. **Task 1: Distribution path resolution and MCP dependency auto-installer** - `08ae63a` (test, RED) + `d51f44c` (feat, GREEN)
2. **Task 2: Package.json distribution fields, README, and package contents verification** - `076e7e8` (feat)
3. **Task 3: Wire getMcpCommand into McpManager and ensureMcpDependencies into CLI** - `66dab73` (feat)

_Note: Task 1 is TDD with RED and GREEN commits_

## Files Created/Modified
- `src/dist/paths.ts` - Standalone binary detection, SUPERGHOST_HOME, MCP_NODE_MODULES, getMcpCommand()
- `src/dist/setup.ts` - ensureMcpDependencies() with BUN_BE_BUN=1 install and spinner UX
- `README.md` - Full user-facing docs with install, CLI, providers, config, and standalone binary sections
- `package.json` - Distribution fields: files, publishConfig, engines, keywords, description, scripts
- `src/agent/mcp-manager.ts` - Uses getMcpCommand() for Playwright and curl MCP spawns
- `src/cli.ts` - Calls ensureMcpDependencies() when isStandaloneBinary() before test execution
- `.gitignore` - Changed `dist/` to `/dist/` to not ignore tests/unit/dist/
- `tests/unit/dist/paths.test.ts` - 10 tests for path constants, binary detection, command resolution
- `tests/unit/dist/setup.test.ts` - 3 tests for dependency skip, install, and exit-on-failure
- `tests/unit/dist/package-contents.test.ts` - 11 tests for package.json fields and tarball contents

## Decisions Made
- getMcpCommand() accepts optional `standalone` parameter override for testability (avoids mocking process.argv in tests)
- `_isStandaloneBinaryWith(argv)` exported as testable helper for binary detection tests
- `.gitignore` changed from `dist/` to `/dist/` so tests/unit/dist/ is not ignored by git

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed .gitignore ignoring tests/unit/dist/**
- **Found during:** Task 1 (RED phase commit)
- **Issue:** `.gitignore` had `dist/` which matched `tests/unit/dist/`, preventing git from tracking test files
- **Fix:** Changed to `/dist/` (root-only match)
- **Files modified:** `.gitignore`
- **Verification:** git add succeeded for tests/unit/dist/ files
- **Committed in:** `08ae63a` (Task 1 RED commit)

**2. [Rule 1 - Bug] Fixed TypeScript error in setup test mock**
- **Found during:** Task 3 (type checking verification)
- **Issue:** `mock()` with no type args created `[]` typed calls, causing TS2493 on `calls[0]` access
- **Fix:** Cast `mock.calls` as `unknown[][]` for array index access
- **Files modified:** `tests/unit/dist/setup.test.ts`
- **Verification:** `bunx tsc --noEmit` passes
- **Committed in:** `66dab73` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
- Pre-existing integration test timeout in `tests/integration/cli-pipeline.test.ts` (was failing before plan changes, not caused by distribution code). Out of scope.
- Pre-existing `references/` test failures due to missing LangChain dependencies in reference code. Out of scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Distribution code complete: package.json, paths.ts, setup.ts, README.md all wired
- Ready for Plan 02: CI/CD automation (GitHub Actions for npm publish and binary builds)
- All 24 distribution unit tests pass
- Type checking passes

## Self-Check: PASSED

All 7 files verified present. All 4 commits verified in git log.

---
*Phase: 03-distribution*
*Completed: 2026-03-11*
