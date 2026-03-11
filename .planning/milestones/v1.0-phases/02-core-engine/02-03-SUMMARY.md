---
phase: 02-core-engine
plan: 03
subsystem: agent
tags: [mcp, playwright-mcp, curl-mcp, ai-sdk, generate-text, structured-output, step-recording, stdio-transport]

# Dependency graph
requires:
  - phase: 02-core-engine
    provides: "Agent types (AgentExecutionResult, AgentConfig), model factory, prompt builder, StepRecorder, CachedStep types"
provides:
  - "McpManager: Playwright and curl MCP server lifecycle management via StdioClientTransport"
  - "executeAgent: AI agent execution with generateText, Output.object(), and stopWhen"
  - "Merged MCP tool set (browser + API) available to agent regardless of test type"
  - "Step recording via StepRecorder wrapping during agent execution"
affects: [03-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [mcp-server-lifecycle-management, generate-text-structured-output, tool-wrapping-step-recording]

key-files:
  created:
    - src/agent/mcp-manager.ts
    - src/agent/agent-runner.ts
    - tests/unit/agent/agent-runner.test.ts
  modified: []

key-decisions:
  - "McpManager uses StdioClientTransport from @modelcontextprotocol/sdk (Bun-compatible, NOT Experimental_StdioMCPTransport)"
  - "McpManager config typed as Pick<Config, 'browser' | 'headless'> for minimal coupling"
  - "--headless flag conditionally included based on config.headless value"

patterns-established:
  - "MCP server lifecycle: initialize() spawns servers, getTools() merges, close() via Promise.allSettled"
  - "Agent runner: generateText + Output.object() + stopWhen: stepCountIs() for structured agent loop"
  - "Null output handling: return diagnostic message with recursion limit info"

requirements-completed: [AGNT-01, AGNT-02, AGNT-03]

# Metrics
duration: 4min
completed: 2026-03-11
---

# Phase 2 Plan 03: MCP Manager and Agent Runner Summary

**MCP server lifecycle manager for Playwright/curl via StdioClientTransport and AI agent runner using generateText with Output.object() for structured pass/fail results**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-11T11:08:01Z
- **Completed:** 2026-03-11T11:12:21Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- McpManager spawns Playwright MCP (with --isolated, --headless, --browser flags) and curl MCP servers via Bun-compatible StdioClientTransport
- Agent runner uses generateText with Output.object() for structured { passed, message } output and stopWhen: stepCountIs() for loop control
- Tools wrapped with StepRecorder before generateText for transparent step capture
- Null output (step limit exceeded) returns diagnostic message with recursion limit context
- All 8 agent-runner tests pass with mocked generateText

## Task Commits

Each task was committed atomically:

1. **Task 1: McpManager for Playwright and curl MCP server lifecycle** - `4a28029` (feat)
2. **Task 2 RED: Failing agent runner tests** - `7accbbd` (test)
3. **Task 2 GREEN: Implement agent runner with structured output** - `3af04e8` (feat)

_Note: Task 2 followed full TDD with separate RED/GREEN commits._

## Files Created/Modified
- `src/agent/mcp-manager.ts` - MCP server lifecycle: spawn Playwright + curl via StdioClientTransport, merge tools, cleanup via Promise.allSettled
- `src/agent/agent-runner.ts` - executeAgent function: generateText with Output.object(), stopWhen, StepRecorder wrapping
- `tests/unit/agent/agent-runner.test.ts` - 8 tests covering structured output, null handling, recursion limit, tool wrapping, step recording, context

## Decisions Made
- McpManager uses `StdioClientTransport` from `@modelcontextprotocol/sdk/client/stdio.js` instead of `Experimental_StdioMCPTransport` from `@ai-sdk/mcp` (Node.js only, incompatible with Bun per research pitfall 2)
- McpManager config typed as `Pick<Config, "browser" | "headless">` for minimal coupling rather than accepting full Config
- `--headless` flag is conditionally included only when `config.headless` is true (not always added)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- McpManager ready for integration with TestExecutor (Phase 3)
- executeAgent ready to be called from TestExecutor with model from model-factory and tools from McpManager
- All Phase 2 subsystems complete: model factory, prompt builder, cache (CacheManager, StepRecorder, StepReplayer), MCP manager, agent runner
- Phase 2 core engine fully built, pending integration wiring in Phase 3

## Self-Check: PASSED

All 3 created files verified on disk. All 3 commits (4a28029, 7accbbd, 3af04e8) verified in git history.

---
*Phase: 02-core-engine*
*Completed: 2026-03-11*
