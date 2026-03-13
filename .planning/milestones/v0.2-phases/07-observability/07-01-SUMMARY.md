---
phase: 07-observability
plan: 01
subsystem: output
tags: [ai-sdk, tool-mapping, callbacks, observability]

# Dependency graph
requires:
  - phase: 06-dry-run
    provides: Reporter interface and TestExecutor patterns
provides:
  - StepDescription, StepInfo, OnStepProgress types in output/types.ts
  - describeToolCall utility mapping browser_ tools to human names
  - experimental_onToolCallFinish wired in agent-runner for per-tool-call events
  - onStepProgress callback forwarded through TestExecutor to executeAgentFn
affects: [07-02-PLAN, reporter, cli]

# Tech tracking
tech-stack:
  added: []
  patterns: [callback-chain from agent-runner through test-executor, tool-name-map lookup with fallback]

key-files:
  created: [src/output/tool-name-map.ts, tests/unit/output/tool-name-map.test.ts]
  modified: [src/output/types.ts, src/agent/agent-runner.ts, src/runner/test-executor.ts, tests/unit/agent/agent-runner.test.ts]

key-decisions:
  - "Used experimental_onToolCallFinish (not onStepFinish) for per-tool-call granularity"
  - "Callback only fires on event.success=true, skipping failed tool calls"
  - "Unknown tools fall back to underscore-to-space + capitalize-first-letter"

patterns-established:
  - "Callback chain: agent-runner -> test-executor -> (future: reporter) via OnStepProgress type"
  - "Tool name mapping: PREFIX_MAP for known tools, KEY_ARG_MAP for key argument extraction"

requirements-completed: [OBS-01]

# Metrics
duration: 3min
completed: 2026-03-12
---

# Phase 7 Plan 1: Callback Plumbing Summary

**StepInfo/OnStepProgress types, describeToolCall tool-name mapper, and experimental_onToolCallFinish wired through agent-runner and test-executor**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-12T13:08:34Z
- **Completed:** 2026-03-12T13:11:28Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Created type contracts (StepDescription, StepInfo, OnStepProgress) for step progress events
- Built describeToolCall utility mapping all 23 browser_ MCP tools to human-readable names with key argument extraction
- Wired experimental_onToolCallFinish in agent-runner to invoke onStepProgress per successful tool call
- Extended TestExecutor to accept and forward onStepProgress callback during AI execution only (not cache replay)

## Task Commits

Each task was committed atomically:

1. **Task 1: Types and tool-name-map utility** - `143cfbe` (feat) - TDD: RED then GREEN
2. **Task 2: Wire onStepProgress through agent-runner and test-executor** - `e7745a2` (feat) - TDD: RED then GREEN

_Note: TDD tasks each had RED (failing tests) then GREEN (implementation) in a single commit._

## Files Created/Modified
- `src/output/types.ts` - Added StepDescription, StepInfo, OnStepProgress types; optional onStepProgress to Reporter
- `src/output/tool-name-map.ts` - New: PREFIX_MAP (23 tools), KEY_ARG_MAP (7 tools), describeToolCall function
- `tests/unit/output/tool-name-map.test.ts` - New: 11 unit tests covering all mapping behaviors
- `src/agent/agent-runner.ts` - Added experimental_onToolCallFinish wired to onStepProgress callback
- `tests/unit/agent/agent-runner.test.ts` - Added 3 tests for callback wiring, backward compat, and failed-call skipping
- `src/runner/test-executor.ts` - Added onStepProgress to ExecuteAgentFn type and constructor, forwarded in executeWithAgent

## Decisions Made
- Used experimental_onToolCallFinish (not onStepFinish) for per-tool-call granularity as validated in research
- Callback only fires when event.success is true -- failed tool calls are silently skipped
- Unknown tools get a fallback: replace underscores with spaces, capitalize first letter
- KEY_ARG_MAP covers 7 tools that have meaningful key arguments (navigate->url, click->element, etc.)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All "pipes" are in place for Plan 02 (reporter/CLI) to consume
- ConsoleReporter can now implement onStepProgress to receive real-time step events
- CLI can pass onStepProgress callback when constructing TestExecutor
- Types are exported and ready for import in reporter.ts and cli.ts

## Self-Check: PASSED

- All 7 files verified present on disk
- Commits 143cfbe and e7745a2 verified in git log
- 206/206 tests pass (full suite)
- Zero TypeScript errors in modified files

---
*Phase: 07-observability*
*Completed: 2026-03-12*
