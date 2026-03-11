# Project Research Summary

**Project:** SuperGhost — AI-powered E2E browser + API testing CLI tool
**Domain:** AI-driven test automation CLI (Bun + Vercel AI SDK + Playwright MCP)
**Researched:** 2026-03-10
**Confidence:** HIGH

## Executive Summary

SuperGhost is a natural language E2E testing CLI built with Vercel AI SDK 6 and Bun that lets developers write test cases in plain English YAML and executes them via an LLM agent driving a real browser through the Playwright MCP protocol. The recommended approach is a layered CLI architecture with five clear modules — config, cache, agent, runner, output — where each layer has a single responsibility and depends only on layers below it. This structure makes the build-order deterministic and every component independently testable.

The defining technical moat is the step caching system: SHA-256-keyed JSON files that record every MCP tool call the AI agent makes, enabling ~50ms deterministic replay on subsequent runs instead of 10-60 second AI re-executions. Paired with self-healing behavior (cache miss triggers AI re-run, success overwrites stale cache, failure deletes it), this produces a system that is fast by default and maintenance-free as the UI evolves. This combination — local-first, YAML-only, cache-accelerated, self-healing — is not replicated by any of the cloud-hosted competitors (testRigor, Momentic, ZeroStep) who require accounts, constant AI calls per run, and often Playwright scaffolding.

The primary risks are operational, not architectural. Orphaned MCP subprocess processes on unexpected exit, runaway AI token costs from uncapped agent loops, and non-deterministic behavior from ambiguous natural language test case descriptions are all well-documented failure modes with clear mitigations. These must be addressed in Phase 1 and Phase 2 — they cannot be deferred. The secondary risk is compiled binary distribution: `bun build --compile` has documented limitations with dynamic imports from MCP packages, meaning the binary artifact is a secondary distribution target and `bunx superghost` (npm) is the primary one.

## Key Findings

### Recommended Stack

SuperGhost is built entirely on the Vercel AI SDK ecosystem with Bun as the runtime. The stack is deliberately lean: no LangChain, no LangGraph, no separate transpile step. Bun executes TypeScript directly and compiles standalone binaries. Vercel AI SDK 6 provides the `generateText` agent loop with `maxSteps`/`stopWhen` control and the `@ai-sdk/mcp` client for connecting the agent to Playwright MCP over stdio. All four LLM providers are included at launch via provider packages that share the same unified API surface.

**Core technologies:**
- **Bun 1.3.9** — runtime, package manager, bundler, binary compiler. Native TypeScript execution, no transpile step; Anthropic ships Claude Code as a Bun binary, proving production readiness.
- **Vercel AI SDK (`ai@6.0.116`)** — LLM orchestration, agent loop, multi-provider abstraction. `generateText` with `stopWhen: stepCountIs(N)` replaces LangGraph's `createReactAgent` in ~20 lines.
- **`@ai-sdk/mcp@1.0.25`** — MCP client for connecting the AI agent to Playwright and curl MCP servers via stdio transport. Stable in SDK 6.
- **`@playwright/mcp@0.0.68`** — Microsoft's official Playwright MCP server. Exposes accessibility-snapshot-based browser tools to the agent; no vision model required.
- **TypeScript 5.x (via Bun)** — strict mode. Zod 4.3.6 for config validation (14x faster than v3). Commander.js 14.0.3 for CLI argument parsing.
- **Providers:** `@ai-sdk/anthropic@3.0.58`, `@ai-sdk/openai@3.0.41`, `@ai-sdk/google@3.0.49`, `@openrouter/ai-sdk-provider@2.2.5` — all included at launch, selected at runtime by model name prefix.

**What to avoid:** LangChain/LangGraph (removed by design), direct `playwright` API (bypasses MCP and breaks caching), Vercel AI SDK v4/v5 (experimental MCP APIs), Zod v3, `node:crypto` for hashing (use `Bun.CryptoHasher`), `fs`/`path` for file I/O (use `Bun.file()` / `Bun.write()`).

### Expected Features

The feature set is well-defined. The core value proposition is authoring + caching + self-healing without any SaaS dependency. Cloud-hosted competitors (testRigor, Momentic) require accounts and always burn AI tokens; ZeroStep requires existing Playwright code. SuperGhost requires only a YAML file and an API key.

**Must have (table stakes):**
- Plain English test cases in YAML (`case: "check login is working"`) — the entire value prop
- Zod-validated YAML config with sensible defaults (`baseUrl`, `browser`, `headless`, `timeout`, `maxAttempts`, `model`, `cacheDir`)
- CLI entry point (`superghost --config tests.yaml`) with exit codes 0/1
- AI agent executing tests via Playwright MCP (browser) and curl MCP (API), with auto-detection between the two
- Sequential test execution with independent browser contexts per test
- Configurable browser type, headless mode, timeout, max retries, multi-provider LLM support
- Deterministic pass/fail/timing summary output with source attribution (`cache` vs `ai`)

**Should have (competitive differentiators):**
- Step caching at ~50ms replay via SHA-256-keyed JSON in `.superghost-cache/` — the performance moat
- Self-healing cache: replay failure triggers AI re-run; success updates cache, failure deletes it
- Cache invalidation on description change (hash includes the case string)
- Human-readable cache JSON files (developers can inspect what the AI decided)
- Bun-native compiled binary (`bun build --compile`) and `bunx superghost` npm distribution
- Source attribution per test result: `[PASS] check login (cache, 45ms)` vs `[PASS] check login (ai, 8.2s)`

**Defer (v2+):**
- Parallel test execution — adds concurrency bugs, rate-limit risk, resource contention
- Watch mode, test tagging/grouping, HTML report output
- GUI/dashboard — anti-feature; changes the product category

**Add after validation (v1.x):**
- `--no-cache` / `--clear-cache` flags, `--only <pattern>` filtering, `--verbose` step-level output, JSON output mode, per-test `skip` flag in YAML

### Architecture Approach

The architecture follows a strict layered dependency direction: `config` → `cache` → `agent` → `runner` → `output` → `cli`. Each layer depends only on layers below it, enabling bottom-up development. Components communicate via injected function types and interfaces, not direct module imports across layers. This design means the AI SDK can be swapped without touching the runner, and the cache layer can be unit-tested without any LLM calls.

**Major components:**
1. **Config Loader** — reads YAML, validates with Zod, throws typed `ConfigLoadError`. No business logic; consumed by `cli.ts` only.
2. **CacheManager + StepRecorder + StepReplayer** — SHA-256 keyed JSON file store using Bun native file I/O. Recorder intercepts MCP tool calls during AI execution (records after success, not before). Replayer re-executes steps sequentially against a live browser. Symmetric design: recorder writes, replayer reads.
3. **AgentRunner + ModelFactory + McpClientFactory** — `generateText` with wrapped MCP tools. ModelFactory selects provider by model name prefix. One MCP client (one `@playwright/mcp` subprocess) per test, closed in `finally`. Step recorder wraps tools before AI sees them.
4. **TestRunner + TestExecutor** — sequential iteration over all tests. TestExecutor owns the cache-first decision tree and retry loop. TestRunner knows nothing about AI or caching.
5. **Reporter** — event-driven console output, decoupled from execution state. Accepts `onTestStart`, `onTestComplete`, `onRunComplete` events.

**Key patterns to follow:**
- Cache only `{ toolName, toolInput }` pairs — never cache tool results (they contain dynamic content)
- Only inspect `generateText`'s `text` return value for `TEST_PASSED`/`TEST_FAILED` — not intermediate steps
- Pass `Config` as constructor/function argument — never a global singleton
- Temperature 0 for test execution — determinism over creativity

### Critical Pitfalls

1. **Orphaned MCP subprocesses on exit** — register synchronous `SIGINT`/`SIGTERM` handlers, track all MCP client refs in a global registry, always call `client.close()` in `finally`. Address in Phase 1 before any test execution logic is written.
2. **Runaway AI token costs from uncapped agent loops** — set `maxSteps` default to 10 (not 20), implement per-test token budget via `prepareStep` callback, log token usage per test. Configure cost guardrails when wiring the agent loop in Phase 2.
3. **Cache key collision from unnormalized strings** — normalize test case strings before hashing (trim, lowercase, collapse spaces); include a schema version in the key. A user editing YAML formatting should not bust the cache.
4. **MCP connection context loss between tool calls** — one MCP client per test case, held open for the full test duration (AI run + replay), closed only in `finally`. Never share a client across tests or recreate per tool call.
5. **Natural language ambiguity causing nondeterministic failures** — temperature 0, constrained system prompt specifying `TEST_PASSED`/`TEST_FAILED` terminal format, warn on test cases shorter than 5 words. Design the system prompt before wiring the cache.
6. **`bun build --compile` failing with dynamic imports** — do not bundle MCP server packages into the binary; they run as separate stdio processes. Test compiled binary in a clean Docker container before releasing.
7. **App under test not running at `baseUrl`** — preflight HTTP check before any test execution; abort with clear error and exit code 1 rather than burning AI tokens against an error page.

## Implications for Roadmap

Based on research, the build order is determined by strict component dependencies. The cache cannot exist without an AI agent to populate it. The runner cannot be tested without cache and agent. CLI wiring is last. This maps naturally to a 4-phase roadmap.

### Phase 1: Foundation and CLI Infrastructure

**Rationale:** Config loading, CLI wiring, subprocess lifecycle management, and the reporter are zero-dependency components. They must exist before any test execution logic. Critically, the MCP subprocess lifecycle pattern (process signals, cleanup registry, `finally` blocks) must be established here — it is harder to retrofit than to build in from the start.

**Delivers:** A working CLI skeleton: `superghost --config tests.yaml` parses and validates config, wires dependencies, exits with code 0/1, and handles SIGINT/SIGTERM cleanly. No AI calls yet.

**Addresses:** Plain English YAML config, CI/CD exit codes, deterministic summary output, configurable options.

**Avoids:** Orphaned MCP subprocess pitfall (established here), global config singleton anti-pattern, exit code 2 vs 1 distinction (config error vs test failure).

**Research flag:** Standard patterns — no additional research needed. Config/CLI stack is fully documented.

### Phase 2: Agent Loop and Cache Layer

**Rationale:** This is the highest-complexity phase and the core of SuperGhost's value. The agent loop (AI SDK + MCP), step caching, self-healing, and the cache-first execution strategy are all implemented here as a unit. They are tightly coupled: the recorder wraps the agent's tools, the replayer uses the same MCP client type, and self-healing requires both to be present. Building these separately would require rebuilding integration surfaces.

**Delivers:** End-to-end test execution — first run uses AI and records steps, subsequent runs replay cache in ~50ms, self-healing triggers on cache staleness. All four LLM providers wired. Browser and API test auto-detection via Playwright and curl MCP.

**Uses:** Vercel AI SDK `generateText` + `@ai-sdk/mcp`, `@playwright/mcp`, `@mcp-get-community/server-curl`, all provider packages, `Bun.CryptoHasher`, `Bun.file`/`Bun.write`.

**Implements:** AgentRunner, ModelFactory, McpClientFactory, CacheManager, StepRecorder, StepReplayer, TestExecutor.

**Avoids:** Runaway token costs (maxSteps + cost cap), cache key normalization, MCP context loss (one client per test), nondeterministic behavior (temperature 0, constrained system prompt), caching failed results, app unreachable detection (preflight check).

**Research flag:** This phase is the most likely candidate for `/gsd:research-phase` during planning. The AI SDK's `prepareStep` cost-tracking callback, OpenRouter model namespace handling, and Gemini tool call response shape differences all warrant deeper research before implementation.

### Phase 3: Developer Experience and Output Polish

**Rationale:** Once the test execution loop is proven, DX features make the tool usable in CI and debuggable locally. These are low-complexity additions that significantly increase adoption but do not affect the core execution path.

**Delivers:** Real-time step progress output during AI runs, source attribution (`cache` vs `ai`) in all result lines, verbose mode showing step-level actions, `--no-cache` / `--clear-cache` flags, `--only <pattern>` subset filtering, `--dry-run` config validation mode, per-test `skip` flag.

**Addresses:** Silent cache usage UX pitfall, generic failure messages (require reason in `TEST_FAILED`), frozen CLI appearance during AI runs, ambiguous exit on config errors.

**Research flag:** Standard patterns — all DX features are well-documented. No research-phase needed.

### Phase 4: Distribution and Packaging

**Rationale:** Binary compilation and npm publishing require a fully working tool to package. This phase also includes the security and correctness checklist items that are hard to verify during development: compiled binary in a clean environment, multi-provider wiring verification, self-healing delete-on-failure verification, exit code propagation.

**Delivers:** `bunx superghost` npm package, `bun build --compile` standalone binary artifact, CI release workflow, README with install and usage documentation, `.gitignore` recommendations for cache directory.

**Avoids:** `bun build --compile` dynamic import failures (MCP servers run as external processes, not bundled), credential exposure in cache files (documented `.gitignore` guidance), prompt injection via page content (strict system prompt and `TEST_PASSED`/`TEST_FAILED` exact-match detection).

**Research flag:** Binary packaging in a clean Docker environment should be verified before release. The Bun compile limitation with dynamic imports is a confirmed issue — validate early that `@playwright/mcp` is fully excluded from the binary bundle.

### Phase Ordering Rationale

- **Config before everything:** No other component can be built without knowing the Config type. Zero-dependency phase, testable immediately.
- **Cache before runner:** TestExecutor owns the cache-or-AI decision; it cannot be written until CacheManager, StepRecorder, and StepReplayer exist.
- **Agent with cache (not before):** StepRecorder wraps agent tools; AgentRunner returns to TestExecutor. Building them in the same phase avoids designing temporary interfaces.
- **Preflight check in Phase 2 (not 3):** The app-unreachable pitfall burns real money. It must be in the same phase as the agent loop, not deferred as a DX polish item.
- **Distribution last:** Binary artifacts and npm publishing require a stable, tested tool. Premature packaging adds release infrastructure before the core is validated.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2:** `prepareStep` token-budget callback in Vercel AI SDK 6 (verify API shape), OpenRouter model namespace format (non-standard `anthropic/claude-3-5-sonnet` IDs), Gemini tool call response shape differences vs Anthropic, `@mcp-get-community/server-curl` API test auto-detection heuristics.

Phases with standard patterns (skip research-phase):
- **Phase 1:** Config/CLI/reporter stack is fully documented and validated by reference implementation.
- **Phase 3:** All DX features are additive CLI flags and output formatting — well-established patterns.
- **Phase 4:** Bun compile and npm packaging documentation is complete; the one risk (dynamic imports) is already documented and the mitigation is clear.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against npm and official docs on 2026-03-10. SuperGhost validates the Vercel AI SDK + Playwright MCP combination in production. |
| Features | HIGH | Reference implementation inspected directly. Competitor feature sets verified against official sites. Feature dependency graph validated against architecture. |
| Architecture | HIGH | Based on natural language E2E testing patterns plus Vercel AI SDK official documentation. Component boundaries and data flows are proven patterns, not speculation. |
| Pitfalls | HIGH | All critical pitfalls are documented with GitHub issue references, forum posts, and official documentation. The MCP process leak and Bun compile limitation are confirmed bugs with public trackers. |

**Overall confidence:** HIGH

### Gaps to Address

- **`prepareStep` cost-tracking API:** The token-budget mechanism in Vercel AI SDK 6 is documented but not yet validated in SuperGhost's implementation. Validate the exact API shape before implementing Phase 2's cost guardrails.
- **OpenRouter model namespace:** OpenRouter uses `anthropic/claude-3-5-sonnet` format, not `claude-3-5-sonnet`. The ModelFactory prefix-detection logic must handle this; the exact mapping needs a quick implementation test.
- **Gemini tool calling behavior:** The PITFALLS research flags that Gemini has different tool call response shapes. This needs a dedicated integration test in Phase 2 before claiming multi-provider support is complete.
- **curl MCP auto-detection heuristics:** The research confirms that the AI agent auto-detects API vs browser tests based on the test description, but the exact heuristics (HTTP verbs, URL patterns) are not fully specified. The system prompt design in Phase 2 must address this concretely.
- **Cache atomicity:** PITFALLS research flags atomic cache writes (write to temp file, rename). Bun's `Bun.write()` behavior for atomic file replacement should be validated — it may require a temp-file-then-rename pattern explicitly.

## Sources

### Primary (HIGH confidence)
- [Vercel AI SDK MCP docs](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools) — `createMCPClient`, transport APIs, tool conversion
- [Vercel AI SDK Tool Calling docs](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling) — `generateText`, `stopWhen`, `stepCountIs`, `prepareStep`
- [AI SDK 6 release blog](https://vercel.com/blog/ai-sdk-6) — SDK 6 feature set and breaking changes
- [Bun standalone executables](https://bun.com/docs/bundler/executables) — `bun build --compile` documentation
- npm package pages for: `ai@6.0.116`, `@ai-sdk/mcp@1.0.25`, `@playwright/mcp@0.0.68`, `zod@4.3.6`, `commander@14.0.3`

### Secondary (MEDIUM confidence)
- [MCP Server Process Leak — Cursor Forum](https://forum.cursor.com/t/mcp-server-process-leak/151615) — confirms orphaned subprocess pattern
- [Claude Code GitHub Issue #1935](https://github.com/anthropics/claude-code/issues/1935) — MCP server not terminated on exit
- [Bun Issue #24470](https://github.com/oven-sh/bun/issues/24470) — `bun build --compile` binary fails with dynamic imports
- [Self-Healing Test Automation Guide (Momentic)](https://momentic.ai/blog/self-healing-test-automation-guide) — self-healing patterns

### Tertiary (LOW confidence)
- [Rethinking Testing for LLM Applications (arXiv 2025)](https://arxiv.org/html/2508.20737v1) — natural language ambiguity impairs validation; needs project-specific validation
- [Best E2E Testing Tools 2026 (VirtuosoQA)](https://www.virtuosoqa.com/post/best-end-to-end-testing-tools) — market survey used for competitor feature comparison

---
*Research completed: 2026-03-10*
*Ready for roadmap: yes*
