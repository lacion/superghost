# Phase 2: Core Engine - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can write a plain English test case in YAML, run it once (AI executes in a real browser or via HTTP), run it again (cached steps replay in ~50ms), and have stale cache auto-heal when the UI changes — across all four LLM providers. No new CLI flags or config fields beyond what Phase 1 established (except `type` and `context` fields on tests).

Requirements: AGNT-01, AGNT-02, AGNT-03, AGNT-04, AGNT-05, CACH-01, CACH-02, CACH-03, CACH-04, CACH-05, CACH-06, CACH-07, PROV-01, PROV-02, PROV-03, PROV-04, PROV-05

</domain>

<decisions>
## Implementation Decisions

### Agent result reporting
- Structured JSON output via Vercel AI SDK — agent returns `{ passed: boolean, message: string }`, no text marker parsing
- Failure diagnostics: actionable 1-2 sentence summary explaining what went wrong and what the page showed — no step-by-step log in default output
- User-provided `context` field (global and per-test) appended to the system prompt — allows app-specific hints (shadow DOM, cookie consent modals, test credentials)
- Recursion limit hit: counts as a failed attempt toward maxAttempts, with clear message ("Agent exceeded 500 step limit — test case may be too complex or the agent is stuck in a loop")

### Cache replay & self-healing
- Replay verification: execute all cached MCP tool calls in sequence; if all execute without errors, test passes from cache (~50ms)
- Self-healing trigger: any step error during replay = entire cache is stale; fall through to full AI re-execution (not partial resume from failed step)
- Cache update: AI re-execution succeeds → update cache with new steps; AI re-execution fails → delete stale cache
- Self-heal indicator in CLI output: `PASS (ai, self-healed, 9.1s)` with note "Cache was stale — re-executed and updated"
- Cache file format: steps + diagnostics metadata — includes `model`, `provider`, `stepCount`, `aiMessage`, `durationMs` alongside `testCase`, `baseUrl`, `steps`, `createdAt`, `updatedAt`

### API test detection
- Explicit `type` field in test config: `type: browser | api`, defaults to `browser` when omitted
- `type: api` tests execute via curl MCP server for HTTP calls
- Both Playwright MCP and curl MCP servers launched for every test regardless of type — agent has all tools available
- MCP servers shared across the test suite (not restarted per test); fresh browser context per test for isolation (AGNT-03)

### Provider error handling
- API key validation: check for required env var at startup before any tests run — fail with clear message and exit code 1 if missing
- Standard SDK env var names: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENROUTER_API_KEY`
- Auto-load `.env` file from project root (Bun native support, no extra dependency)
- AI call errors (rate limit, network, timeout): retry within maxAttempts, same as test failures — consistent retry model
- Error messages include the specific env var name and how to set it

### Claude's Discretion
- Vercel AI SDK agent loop implementation details
- System prompt engineering (structure, ordering, few-shot examples)
- MCP client lifecycle management
- Cache file versioning strategy
- Retry backoff timing (if any)

</decisions>

<specifics>
## Specific Ideas

- `context` field lets users provide app-specific hints without overriding the system prompt — global `context` for suite-wide info (shadow DOM, auth patterns), per-test `context` for test-specific data (credentials, API tokens)
- Cache files should be human-readable JSON with diagnostics — useful for debugging why a test's cache keeps going stale
- Self-heal indicator in output helps users identify tests with unstable selectors that churn cache frequently
- MCP servers shared across suite for performance, but each test gets a fresh browser context for isolation

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- SuperGhost's natural language E2E testing approach provides proven patterns:
  - `agent/agent-factory.ts` — agent execution with MCP tool wrapping and step recording (needs Vercel AI SDK rewrite)
  - `agent/mcp-client.ts` — MCP server config builder for Playwright (adapt for curl MCP addition)
  - `cache/cache-manager.ts` — file-based cache with SHA-256 hashing (extend with diagnostics metadata)
  - `cache/step-recorder.ts` — tool call recording during AI execution (same pattern applies)
  - `cache/step-replayer.ts` — cached step replay with error detection (same pattern applies)
  - `runner/test-executor.ts` — cache-first-then-AI strategy orchestration (same flow applies)

### Established Patterns
- Phase 1 will establish: CLI entry point, config schema, reporter interface, process cleanup
- Config types from Phase 1 will be imported (add `type` and `context` fields to test schema)
- Reporter interface from Phase 1 will be extended for AI/cache/self-heal source reporting

### Integration Points
- Config schema: extend test case type with `type: browser | api` and `context: string` fields
- Reporter: add `self-healed` source alongside existing `cache` and `ai` sources
- CLI: agent execution replaces the placeholder test runner from Phase 1
- Process cleanup: MCP server lifecycle hooks into Phase 1's SIGINT/SIGTERM handling

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-core-engine*
*Context gathered: 2026-03-11*
