---
phase: 02-core-engine
plan: 01
subsystem: agent
tags: [ai-sdk, anthropic, openai, google, openrouter, model-factory, prompt-builder, zod]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: config schema, runner types, test infrastructure
provides:
  - AgentExecutionResult and AgentConfig type contracts
  - CachedStep and CacheEntry types with diagnostics metadata
  - Model factory with provider auto-inference from model name
  - API key validation with descriptive error messages
  - System prompt builder with global and per-test context support
  - Config schema extended with type (browser|api) and context fields
affects: [02-02, 02-03, 03-packaging]

# Tech tracking
tech-stack:
  added: [ai@6.0.116, "@ai-sdk/mcp@1.0.25", "@modelcontextprotocol/sdk@1.27.1", "@ai-sdk/anthropic@3.0.58", "@ai-sdk/openai@3.0.41", "@ai-sdk/google@3.0.43", "@openrouter/ai-sdk-provider@2.2.5"]
  patterns: [provider-inference-from-model-name, env-var-validation-with-descriptive-errors, context-field-prompt-composition]

key-files:
  created: [src/agent/types.ts, src/agent/model-factory.ts, src/agent/prompt.ts, src/cache/types.ts, tests/unit/agent/model-factory.test.ts, tests/unit/agent/prompt.test.ts]
  modified: [src/config/schema.ts, src/runner/types.ts, package.json, bun.lock, tests/unit/runner/test-runner.test.ts]

key-decisions:
  - "Model factory created in Task 1 alongside types (needed for ProviderName import)"
  - "Provider inference uses ordered regex array with anthropic as default fallback"
  - "Prompt builder uses line-array pattern for composable prompt construction"

patterns-established:
  - "Provider inference: regex prefix matching with ordered priority (claude -> anthropic, gpt -> openai, o-digit -> openai, gemini -> google, slash -> openrouter)"
  - "API key validation: check env var existence, throw with provider name + env var name + setup instructions"
  - "Context composition: global context appended before per-test context, both optional"

requirements-completed: [PROV-01, PROV-02, PROV-03, PROV-04, PROV-05, AGNT-05]

# Metrics
duration: 4min
completed: 2026-03-11
---

# Phase 2 Plan 1: Types, Model Factory, and Prompt Builder Summary

**Multi-provider model factory with auto-inference for 4 LLM providers (Anthropic, OpenAI, Google, OpenRouter), system prompt builder with context fields, and all Phase 2 type contracts**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-11T11:00:08Z
- **Completed:** 2026-03-11T11:04:15Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments
- Installed all 7 Phase 2 AI SDK dependencies (ai, @ai-sdk/mcp, @modelcontextprotocol/sdk, 4 provider packages)
- Model factory auto-infers provider from model name prefix (claude-, gpt-, o-digit, gemini-, slash pattern) with API key validation that names the specific env var
- System prompt builder composes structured prompts with browser/API tool instructions and optional global/per-test context
- All Phase 2 type contracts defined (AgentExecutionResult, AgentConfig, CachedStep, CacheEntry with diagnostics)
- Config schema extended backward-compatibly with type (browser|api) and context fields

## Task Commits

Each task was committed atomically:

1. **Task 1: Install deps, define types, extend config schema** - `47d2563` (feat)
2. **Task 2: Model factory tests** - `5d856e1` (test)
3. **Task 3 RED: Failing prompt builder tests** - `9a97664` (test)
4. **Task 3 GREEN: Implement prompt builder** - `8f26542` (feat)

_Note: Task 2 implementation was included in Task 1 commit (needed for type resolution). Task 3 followed full TDD with separate RED/GREEN commits._

## Files Created/Modified
- `src/agent/types.ts` - AgentExecutionResult and AgentConfig interfaces
- `src/agent/model-factory.ts` - Provider inference, API key validation, model creation for 4 providers
- `src/agent/prompt.ts` - System prompt builder with context field support
- `src/cache/types.ts` - CachedStep and CacheEntry interfaces with diagnostics metadata
- `src/config/schema.ts` - Extended with type (browser|api) and context fields
- `src/runner/types.ts` - Added selfHealed flag to TestResult
- `package.json` / `bun.lock` - Phase 2 dependencies installed
- `tests/unit/agent/model-factory.test.ts` - 24 tests for provider inference, API key validation, model creation
- `tests/unit/agent/prompt.test.ts` - 8 tests for prompt construction and context composition
- `tests/unit/runner/test-runner.test.ts` - Updated for new type field compatibility

## Decisions Made
- Model factory created in Task 1 alongside types (ProviderName type needed for agent/types.ts import -- could not defer to Task 2 without circular dependency)
- Provider inference uses ordered regex array with anthropic as default fallback (matches plan's specification exactly)
- Prompt builder uses line-array-join pattern for composable prompt construction (clean, testable)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test-runner test type compatibility**
- **Found during:** Task 1 (Config schema extension)
- **Issue:** Adding `type` field with `.default("browser")` to TestCaseSchema made `type` required in Zod output type. Existing test-runner tests construct Config objects directly without Zod parse, so they lacked the `type` field.
- **Fix:** Added `type: "browser" as const` to all inline test case objects in test-runner.test.ts
- **Files modified:** tests/unit/runner/test-runner.test.ts
- **Verification:** `bunx tsc --noEmit` passes, all 77 existing tests pass
- **Committed in:** 47d2563 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug - type compatibility)
**Impact on plan:** Auto-fix necessary for backward compatibility after schema extension. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All type contracts ready for agent runner (02-02) and cache subsystem (02-03)
- Model factory ready for integration with MCP manager and agent runner
- Prompt builder ready for agent execution loop
- Config schema accepts browser/api test types and context fields for all downstream plans

## Self-Check: PASSED

All 6 created files verified on disk. All 4 commits (47d2563, 5d856e1, 9a97664, 8f26542) verified in git log.

---
*Phase: 02-core-engine*
*Completed: 2026-03-11*
