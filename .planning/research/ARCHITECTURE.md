# Architecture Research

**Domain:** AI-powered E2E browser testing CLI tool
**Researched:** 2026-03-10
**Confidence:** HIGH — based on SuperGhost's natural language E2E architecture + Vercel AI SDK docs

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLI Layer                                   │
│   superghost --config tests.yaml                                      │
│   ┌──────────────────────────────────────────────────────────────┐   │
│   │  CLI Entry Point (cli.ts)                                     │   │
│   │  - Parse args (commander)                                     │   │
│   │  - Load + validate config (Config Loader)                     │   │
│   │  - Wire dependencies                                          │   │
│   │  - Exit code 0/1                                              │   │
│   └─────────────────────────┬────────────────────────────────────┘   │
└─────────────────────────────┼───────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────────┐
│                         Runner Layer                                   │
│  ┌──────────────────┐       ┌─────────────────────────────────────┐  │
│  │  TestRunner       │──────▶│  TestExecutor                        │  │
│  │  - Iterates tests │       │  - Cache-first strategy              │  │
│  │  - Calls Reporter │       │  - Retry loop (maxAttempts)          │  │
│  │  - Aggregates     │       │  - Routes to Cache or Agent          │  │
│  │    RunResult      │       │                                      │  │
│  └──────────────────┘       └────────────┬──────────────────────┘  │
└───────────────────────────────────────────┼─────────────────────────┘
                                            │
              ┌─────────────────────────────┼────────────────────────┐
              │                             │                         │
┌─────────────▼────────────┐   ┌───────────▼────────────────────────┐│
│      Cache Layer          │   │           Agent Layer               ││
│  ┌────────────────────┐  │   │  ┌──────────────────────────────┐  ││
│  │  CacheManager      │  │   │  │  AgentRunner                  │  ││
│  │  - SHA-256 hash key│  │   │  │  - Vercel AI SDK generateText │  ││
│  │  - Read/write JSON │  │   │  │  - System prompt builder      │  ││
│  │  - Bun file I/O    │  │   │  │  - Step recorder wrapper      │  ││
│  └────────────────────┘  │   │  └──────────────┬───────────────┘  ││
│  ┌────────────────────┐  │   │                 │                   ││
│  │  StepReplayer      │  │   │  ┌──────────────▼───────────────┐  ││
│  │  - Execute steps   │  │   │  │  ModelFactory                 │  ││
│  │    from cache      │  │   │  │  - Anthropic / OpenAI /       │  ││
│  │  - Detect stale    │  │   │  │    Gemini / OpenRouter        │  ││
│  └────────────────────┘  │   │  │  - Vercel AI SDK providers    │  ││
│  ┌────────────────────┐  │   │  └──────────────────────────────┘  ││
│  │  StepRecorder      │  │   │  ┌──────────────────────────────┐  ││
│  │  - Intercepts MCP  │  │   │  │  McpClientFactory             │  ││
│  │    tool calls      │  │   │  │  - Spawn @playwright/mcp via  │  ││
│  │  - Records to steps│  │   │  │    stdio                      │  ││
│  └────────────────────┘  │   │  │  - Expose tools to AI agent   │  ││
└──────────────────────────┘   │  └──────────────────────────────┘  ││
                               └────────────────────────────────────┘│
                                                                      │
┌─────────────────────────────────────────────────────────────────────┘
│                     External Processes (stdio)
│  ┌────────────────────────────┐   ┌─────────────────────────────┐
│  │  @playwright/mcp (child    │   │  curl MCP server (optional,  │
│  │  process, stdio transport) │   │  API testing)                │
│  └────────────────────────────┘   └─────────────────────────────┘
└─────────────────────────────────────────────────────────────────────
```

### Component Responsibilities

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `cli.ts` | Parse CLI args, wire all dependencies, set exit code | Config Loader, TestRunner, Reporter |
| `Config Loader` | Read YAML, validate with Zod, apply defaults | `cli.ts` only |
| `TestRunner` | Iterate tests sequentially, aggregate RunResult | TestExecutor, Reporter |
| `TestExecutor` | Cache-first execution decision, retry loop | CacheManager, AgentRunner |
| `CacheManager` | SHA-256 keyed JSON file store in `.superghost-cache/` | TestExecutor, StepRecorder, StepReplayer |
| `StepRecorder` | Intercept MCP tool calls during AI execution, record to steps array | AgentRunner (wraps tools) |
| `StepReplayer` | Re-execute cached steps via MCP client, detect staleness | TestExecutor, McpClientFactory |
| `AgentRunner` | Build system prompt, call `generateText` with tools, return result | ModelFactory, McpClientFactory, StepRecorder |
| `ModelFactory` | Instantiate Vercel AI SDK provider from config (model string + API keys) | AgentRunner |
| `McpClientFactory` | Spawn `@playwright/mcp` child process via stdio, expose tools | AgentRunner, StepReplayer |
| `Reporter` | Write status lines and summary to stdout | TestRunner |

## Recommended Project Structure

```
src/
├── cli.ts                   # Entry point, arg parsing, dependency wiring
├── index.ts                 # Public re-exports (programmatic API surface)
│
├── config/
│   ├── schema.ts            # Zod schema (ConfigSchema, TestCaseSchema)
│   ├── loader.ts            # YAML read + Zod validate + ConfigLoadError
│   └── types.ts             # Config, TestCase (inferred from Zod)
│
├── runner/
│   ├── test-runner.ts       # Sequential iteration over all tests
│   ├── test-executor.ts     # Cache-first logic + retry loop per test
│   └── types.ts             # TestResult, RunResult, TestStatus, TestSource
│
├── agent/
│   ├── agent-runner.ts      # generateText + tool loop (replaces LangGraph agent)
│   ├── model-factory.ts     # Vercel AI SDK provider instantiation
│   ├── mcp-client.ts        # createMCPClient (stdio transport to @playwright/mcp)
│   ├── prompt.ts            # System prompt builder (pure function)
│   └── types.ts             # AgentExecutionResult
│
├── cache/
│   ├── cache-manager.ts     # SHA-256 hashing, JSON read/write (Bun file API)
│   ├── step-recorder.ts     # MCP tool call interception + steps array
│   ├── step-replayer.ts     # Sequential step re-execution via MCP
│   └── types.ts             # CachedStep, CacheEntry
│
└── output/
    ├── reporter.ts          # ConsoleReporter (onTestStart, onTestComplete, onRunComplete)
    └── types.ts             # Reporter interface, ReportData
```

### Structure Rationale

- **`config/`:** Everything about reading and validating user intent. No business logic. Isolated so the CLI and future programmatic callers share the same loader.
- **`runner/`:** Pure orchestration. `TestRunner` knows nothing about AI or caching — it only iterates and delegates. `TestExecutor` owns the cache-or-AI decision tree.
- **`agent/`:** AI concerns only. The module boundary means you can swap Vercel AI SDK for another framework without touching the runner or cache. `mcp-client.ts` is separate from `agent-runner.ts` so the replayer can reuse MCP tool execution without an AI model.
- **`cache/`:** File I/O and serialization in one place. Uses Bun native file APIs for performance. `StepRecorder` and `StepReplayer` are symmetric: recorder writes, replayer reads.
- **`output/`:** Decoupled from all execution logic. Accepts events (start, complete, run summary) — easy to swap for JSON output or CI-specific formatting.

## Architectural Patterns

### Pattern 1: Cache-First with AI Fallback

**What:** Before invoking the AI model, attempt deterministic replay of cached MCP tool calls. Only invoke AI on cache miss or cache staleness (replay failure).

**When to use:** Every test execution. This is the core performance contract: fast by default, AI only when necessary.

**Trade-offs:** Eliminates AI cost and latency on warm runs. Cache can become stale silently — detection is reactive (replay fails), not proactive.

**Example:**
```typescript
async execute(testCase: string, baseUrl: string): Promise<TestResult> {
  const cached = await this.cacheManager.load(testCase, baseUrl);
  if (cached) {
    const replay = await this.replayFn(cached.steps);
    if (replay.success) return buildResult(testCase, "passed", "cache", start);
    // Fall through: cache is stale
  }
  return this.executeWithAgent(testCase, baseUrl, start);
}
```

### Pattern 2: Tool-Intercepting Step Recorder

**What:** Wrap each MCP tool function before passing it to the AI SDK. The wrapper records the tool name and input after successful execution. The AI agent never knows recording is happening.

**When to use:** Exclusively during AI-driven execution. The recorded steps become the cache entry on success.

**Trade-offs:** Clean separation — the agent code stays pure. The wrapper ordering matters: record AFTER success, not before, so failed tool calls are not cached.

**Example:**
```typescript
// Wrap tools before passing to generateText
const wrappedTools = Object.fromEntries(
  Object.entries(mcpTools).map(([name, tool]) => [
    name,
    {
      ...tool,
      execute: async (input: unknown) => {
        const result = await tool.execute(input);
        recorder.record(name, input as Record<string, unknown>);
        return result;
      },
    },
  ])
);
```

### Pattern 3: Vercel AI SDK generateText Agent Loop

**What:** Use `generateText` with `maxSteps` (or `stopWhen`) rather than a stateful agent class. The model calls MCP tools iteratively until it produces a terminal response (`TEST_PASSED:` or `TEST_FAILED:`).

**When to use:** For AI-driven test execution. Replaces LangGraph's `createReactAgent` from the reference implementation.

**Trade-offs:** Simpler dependency tree than LangGraph. `steps` array from `generateText` gives full tool call history for recording. No persistent state — each test gets a fresh call.

**Example:**
```typescript
const { text, steps } = await generateText({
  model: provider(config.model),
  tools: wrappedMcpTools,
  system: buildSystemPrompt(testCase, baseUrl),
  prompt: `Execute the test case: "${testCase}"`,
  maxSteps: config.maxSteps ?? 50,
});
const passed = text.includes("TEST_PASSED");
// steps contains all tool calls for recording
```

### Pattern 4: Per-Test MCP Client Isolation

**What:** Create a new MCP client (and thus a new `@playwright/mcp` child process) for each test case. Tear it down in `finally` after the test completes.

**When to use:** Always. Browser state must not leak between test cases.

**Trade-offs:** Startup overhead per test (~1-2s for browser launch). Isolation is guaranteed. Alternative (shared client with page reset) risks cross-test contamination.

## Data Flow

### First-Run Flow (Cache Miss — AI Path)

```
User: superghost --config tests.yaml
          |
          v
    Config Loader ─── YAML + Zod ──→ Config object
          |
          v
    TestRunner.run()
          |
          └── for each test:
                |
                v
          TestExecutor.execute(testCase, baseUrl)
                |
                v
          CacheManager.load() ──→ null (miss)
                |
                v
          McpClientFactory.create() ──→ spawn @playwright/mcp (stdio)
                |
                v
          StepRecorder wraps MCP tools
                |
                v
          generateText(model, wrappedTools, systemPrompt)
                |
                ├── [tool call] browser_navigate → MCP → Playwright
                │       ↑ recorder.record("browser_navigate", input)
                ├── [tool call] browser_snapshot → MCP → Playwright
                │       ↑ recorder.record("browser_snapshot", input)
                ├── [tool call] browser_click → MCP → Playwright
                │       ↑ recorder.record("browser_click", input)
                └── [final text] "TEST_PASSED: login successful"
                |
                v
          passed=true → CacheManager.save(testCase, baseUrl, steps)
                |
                v
          TestResult { status: "passed", source: "ai", durationMs }
                |
                v
          Reporter.onTestComplete()
```

### Subsequent-Run Flow (Cache Hit — Replay Path)

```
TestExecutor.execute(testCase, baseUrl)
      |
      v
CacheManager.load() ──→ CacheEntry { steps: [...] }
      |
      v
McpClientFactory.create() ──→ spawn @playwright/mcp (stdio)
      |
      v
StepReplayer.replay(steps)
      |
      ├── executor("browser_navigate", {url:"..."}) ──→ MCP ──→ Playwright
      ├── executor("browser_snapshot", {}) ──→ MCP ──→ Playwright
      └── executor("browser_click", {selector:"..."}) ──→ MCP ──→ Playwright
      |
      v
  success=true → TestResult { status: "passed", source: "cache" }
```

### Stale Cache Flow (Cache Hit — Replay Fails — AI Re-executes)

```
StepReplayer.replay(steps) ──→ ReplayResult { success: false, failedStep: 2 }
      |
      v
[fall through to AI path]
      |
      v
generateText(...) ──→ TEST_PASSED: ...
      |
      v
CacheManager.save() ──→ overwrites stale cache with new steps
```

### Key Data Flows

1. **Config → Runner → Executor:** Config object flows down as read-only dependency, never mutated after construction.
2. **MCP tool calls → StepRecorder → CacheEntry:** Tool invocations recorded as `{toolName, toolInput}` pairs, serialized to JSON. Input must be serializable — no functions or Buffers in tool inputs.
3. **CacheEntry → StepReplayer → MCP:** Deserialized steps re-executed in-order. The replayer is a pure sequential executor — no AI model involved.
4. **TestResult → Reporter:** Reporter receives events, not the raw TestResult, keeping output concerns decoupled from execution state.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| 1-20 tests | Sequential execution is fine. Single CLI process. |
| 20-100 tests | Sequential is the bottleneck. Consider test-level concurrency (independent browser contexts per worker). Cache I/O remains negligible. |
| 100+ tests | Parallel workers with shared cache directory (Bun.file writes are atomic on most OSes). AI calls naturally parallelize. Browser spawn becomes a pool concern. |

### Scaling Priorities

1. **First bottleneck:** AI execution latency (~10-60s per test). Cache hits eliminate this. Warm caches make 100-test suites run in under a minute.
2. **Second bottleneck:** Sequential test iteration. `TestRunner` is the natural parallelism boundary — add a worker pool wrapping `TestExecutor` without changing downstream components.

## Anti-Patterns

### Anti-Pattern 1: Sharing a Browser Context Across Tests

**What people do:** Reuse a single `@playwright/mcp` process for all tests to avoid spawn overhead.

**Why it's wrong:** Browser state (cookies, localStorage, page history) leaks between tests. A test that logs in contaminates the next test that expects an unauthenticated state. Failures become non-deterministic and hard to diagnose.

**Do this instead:** Spawn a fresh MCP client per test case. Accept the ~1-2s startup cost — it's dwarfed by AI execution time, and cache replay still starts a fresh browser (but runs in seconds).

### Anti-Pattern 2: Recording Tool Call Results in the Cache

**What people do:** Cache both the tool inputs AND the results (e.g., snapshot HTML, screenshots) to speed up replay.

**Why it's wrong:** Results contain dynamic content (timestamps, session tokens, pixel data) that invalidates on every run. The cache becomes a liability, not an asset. The reference implementation proves that replaying only inputs against a live browser is both correct and fast.

**Do this instead:** Cache only `{ toolName, toolInput }` pairs. Replay executes them against a real browser, getting fresh results each time. This is the reason cache replay is reliable even when the app changes slightly — tool inputs (selectors, URLs) are stable; results are not.

### Anti-Pattern 3: Using a Stateful Agent Framework (LangGraph Pattern)

**What people do:** Import LangChain/LangGraph to get a ReAct agent with built-in loop management, tool binding, and state graphs.

**Why it's wrong for SuperGhost:** Heavy dependency tree, Node.js-only assumptions, incompatible with Bun-native compilation target. LangGraph's graph state is overkill for a linear tool-calling loop. The reference implementation shows this: the entire agent is 100 lines of `createReactAgent` wrapping that Vercel AI SDK's `generateText` replaces with ~20 lines.

**Do this instead:** Use `generateText` from `ai` (Vercel AI SDK) with `maxSteps`. The `steps` array on the result gives the complete tool call history. No graph, no state machine, no LangChain.

### Anti-Pattern 4: Global Config Singleton

**What people do:** Export a global `config` object initialized at module load time, accessed directly by any module.

**Why it's wrong:** Breaks testability — you cannot inject different configs for unit tests without module-level hacks. Side effects at import time cause problems in Bun's module system.

**Do this instead:** Pass `Config` as a constructor argument or function parameter. The reference implementation demonstrates this correctly — every class accepts config in its constructor, making tests trivial.

### Anti-Pattern 5: Parsing AI Response with Regex

**What people do:** Search for `TEST_PASSED` anywhere in the response body, including in tool call outputs that get echoed back.

**Why it's wrong:** False positives. If a page contains the text "TEST_PASSED" in its HTML, the snapshot tool returns it, and the AI may echo it in reasoning before the final verdict.

**Do this instead:** Only inspect the final text message from `generateText`, not intermediate steps. The AI SDK's `text` return value contains only the model's final text output, not tool results.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| `@playwright/mcp` | Child process via stdio MCP transport | Spawned per test, killed on cleanup. Use `createMCPClient({ transport: { type: "stdio", command: "bunx", args: ["@playwright/mcp", "--headless"] } })` |
| Anthropic API | Vercel AI SDK `@ai-sdk/anthropic` provider | `ANTHROPIC_API_KEY` env var |
| OpenAI API | Vercel AI SDK `@ai-sdk/openai` provider | `OPENAI_API_KEY` env var |
| Google Gemini | Vercel AI SDK `@ai-sdk/google` provider | `GOOGLE_GENERATIVE_AI_API_KEY` env var |
| OpenRouter | Vercel AI SDK `@openrouter/ai-sdk-provider` | `OPENROUTER_API_KEY` env var |
| curl MCP server | Child process via stdio (same pattern as Playwright MCP) | For API test detection path; optional in MVP |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `cli.ts` ↔ `config/loader.ts` | Direct function call, throws `ConfigLoadError` | Loader never imports CLI |
| `runner/` ↔ `agent/` | Injected function (`executeTest`) — no direct import | Runner does not know about AI SDK |
| `runner/` ↔ `cache/` | Injected via `CacheManager` instance | Runner does not import cache directly |
| `agent/` ↔ `cache/StepRecorder` | Recorder passed into AgentRunner | Recorder is a collaborator, not a dependency |
| `cache/StepReplayer` ↔ `agent/mcp-client.ts` | `ToolExecutor` function type | Replayer gets a function, not an MCP client object |
| All modules ↔ `output/reporter.ts` | Reporter interface (event callbacks) | Concrete reporter injected at CLI level |

## Build Order Implications

Components have a strict dependency direction: `config` → `cache` → `agent` → `runner` → `cli`. Each layer depends only on layers below it, enabling bottom-up development and testing.

**Suggested build sequence:**

1. **`config/`** — Pure Zod schema + YAML loader. No external dependencies beyond `yaml` and `zod`. Testable immediately.
2. **`cache/`** — File I/O + hashing. Depends only on Bun APIs. `StepRecorder` and `StepReplayer` are the most testable units in the system.
3. **`output/`** — Console reporter. No dependencies. Can be built in parallel with cache.
4. **`agent/mcp-client.ts`** — MCP stdio transport setup. Depends on `ai` package. Manually testable against live `@playwright/mcp`.
5. **`agent/model-factory.ts`** + **`agent/prompt.ts`** — Pure functions. Testable in isolation.
6. **`agent/agent-runner.ts`** — Assembles model + MCP tools + recorder. Integration test with live AI.
7. **`runner/test-executor.ts`** — Wires cache + agent. Unit-testable with mocked agent and cache.
8. **`runner/test-runner.ts`** — Sequential iteration. Trivially testable with mock executor.
9. **`cli.ts`** — Wires everything. End-to-end testable last.

## Sources

- Vercel AI SDK MCP docs: https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools (HIGH confidence)
- Vercel AI SDK tool calling: https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling (HIGH confidence)
- Vercel AI SDK agents: https://sdk.vercel.ai/docs/foundations/agents (HIGH confidence)

---
*Architecture research for: AI-powered E2E browser testing CLI tool (SuperGhost)*
*Researched: 2026-03-10*
