# Phase 2: Core Engine - Research

**Researched:** 2026-03-11
**Domain:** AI agent orchestration, MCP tool integration, step caching, multi-provider LLM support
**Confidence:** HIGH

## Summary

Phase 2 replaces the Phase 1 stub test executor with a real AI agent that drives a browser via Playwright MCP and makes HTTP calls via curl MCP. The core engine has four subsystems: (1) an agent runner using Vercel AI SDK v6's `generateText` with `stopWhen` for multi-step tool-calling loops, (2) an MCP client layer connecting to `@playwright/mcp` and `@calibress/curl-mcp` via stdio transport, (3) a file-based step cache with SHA-256 keying and replay-based staleness detection, and (4) a model factory supporting four LLM providers (Anthropic, OpenAI, Google Gemini, OpenRouter) via their respective `@ai-sdk/*` packages.

SuperGhost's natural language E2E testing architecture uses Vercel AI SDK v6's `generateText` with `stopWhen: stepCountIs(n)` and `Output.object()` for structured pass/fail responses. The MCP client layer uses `@ai-sdk/mcp`'s `createMCPClient` with `StdioClientTransport` from `@modelcontextprotocol/sdk`.

**Primary recommendation:** Use `generateText` with `Output.object()` for structured `{ passed, message }` responses, `stopWhen: stepCountIs(recursionLimit)` for loop control, and `createMCPClient` with `StdioClientTransport` from `@modelcontextprotocol/sdk` (not the Node-only `Experimental_StdioMCPTransport` from `@ai-sdk/mcp`). Share MCP server processes across the test suite, but create fresh browser contexts per test using `@playwright/mcp`'s `--isolated` flag.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Structured JSON output via Vercel AI SDK -- agent returns `{ passed: boolean, message: string }`, no text marker parsing
- Failure diagnostics: actionable 1-2 sentence summary explaining what went wrong and what the page showed -- no step-by-step log in default output
- User-provided `context` field (global and per-test) appended to the system prompt -- allows app-specific hints (shadow DOM, cookie consent modals, test credentials)
- Recursion limit hit: counts as a failed attempt toward maxAttempts, with clear message ("Agent exceeded 500 step limit -- test case may be too complex or the agent is stuck in a loop")
- Replay verification: execute all cached MCP tool calls in sequence; if all execute without errors, test passes from cache (~50ms)
- Self-healing trigger: any step error during replay = entire cache is stale; fall through to full AI re-execution (not partial resume from failed step)
- Cache update: AI re-execution succeeds -> update cache with new steps; AI re-execution fails -> delete stale cache
- Self-heal indicator in CLI output: `PASS (ai, self-healed, 9.1s)` with note "Cache was stale -- re-executed and updated"
- Cache file format: steps + diagnostics metadata -- includes `model`, `provider`, `stepCount`, `aiMessage`, `durationMs` alongside `testCase`, `baseUrl`, `steps`, `createdAt`, `updatedAt`
- Explicit `type` field in test config: `type: browser | api`, defaults to `browser` when omitted
- `type: api` tests execute via curl MCP server for HTTP calls
- Both Playwright MCP and curl MCP servers launched for every test regardless of type -- agent has all tools available
- MCP servers shared across the test suite (not restarted per test); fresh browser context per test for isolation (AGNT-03)
- API key validation: check for required env var at startup before any tests run -- fail with clear message and exit code 1 if missing
- Standard SDK env var names: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `OPENROUTER_API_KEY`
- Auto-load `.env` file from project root (Bun native support, no extra dependency)
- AI call errors (rate limit, network, timeout): retry within maxAttempts, same as test failures -- consistent retry model
- Error messages include the specific env var name and how to set it

### Claude's Discretion
- Vercel AI SDK agent loop implementation details
- System prompt engineering (structure, ordering, few-shot examples)
- MCP client lifecycle management
- Cache file versioning strategy
- Retry backoff timing (if any)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AGNT-01 | AI agent executes browser test cases via Playwright MCP | `createMCPClient` + `StdioClientTransport` spawning `@playwright/mcp` with `--headless --isolated`; tools passed to `generateText` with `stopWhen` |
| AGNT-02 | AI agent executes API test cases via curl MCP | `@calibress/curl-mcp` spawned via stdio alongside Playwright MCP; agent has both tool sets and chooses autonomously |
| AGNT-03 | Each test gets independent browser context | `--isolated` flag on `@playwright/mcp` gives in-memory profile; MCP servers shared but browser context reset per test |
| AGNT-04 | Agent retries failed test cases up to maxAttempts | TestExecutor retry loop pattern from reference; recursion limit hit counts as failed attempt |
| AGNT-05 | Failed tests include diagnostic AI error message | `Output.object()` with `{ passed: boolean, message: string }` schema; message contains actionable diagnostic |
| CACH-01 | Successful AI steps recorded to `.superghost-cache/<hash>.json` | StepRecorder wraps MCP tools, records `{ toolName, toolInput }` pairs; CacheManager saves on success |
| CACH-02 | Cache key is SHA-256 hash of `(testCase + baseUrl)` | `Bun.CryptoHasher("sha256")` for native hashing; deterministic across runs |
| CACH-03 | Cached steps replay instantly (~50ms) without AI | StepReplayer executes cached steps against live MCP tools; no model invocation |
| CACH-04 | When cached replay fails, AI re-executes automatically | TestExecutor cache-first strategy; replay failure triggers full AI re-execution path |
| CACH-05 | On successful AI re-execution after stale cache, cache updated | CacheManager.save() overwrites stale entry with new steps |
| CACH-06 | On failed AI re-execution after stale cache, cache deleted | CacheManager.delete() removes stale entry; test marked failed |
| CACH-07 | Cache files are human-readable JSON with metadata | Extended CacheEntry type with `model`, `provider`, `stepCount`, `aiMessage`, `durationMs`, timestamps |
| PROV-01 | Anthropic (Claude) as AI provider | `@ai-sdk/anthropic` v3.x; `anthropic("claude-sonnet-4-6")`; `ANTHROPIC_API_KEY` env var |
| PROV-02 | OpenAI as AI provider | `@ai-sdk/openai` v3.x; `openai("gpt-4o")`; `OPENAI_API_KEY` env var |
| PROV-03 | Google Gemini as AI provider | `@ai-sdk/google` v3.x; `google("gemini-2.5-flash")`; `GOOGLE_GENERATIVE_AI_API_KEY` env var |
| PROV-04 | OpenRouter as AI provider | `@openrouter/ai-sdk-provider` v2.x; `openrouter("anthropic/claude-3-5-sonnet")`; `OPENROUTER_API_KEY` env var |
| PROV-05 | Provider auto-inferred from model name | Model factory maps model name prefixes to providers; `createProviderRegistry` or custom mapping function |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ai | ^6.0.116 | `generateText`, `Output.object()`, `stepCountIs`, agent loop | Vercel AI SDK v6 is the current stable; unified tool calling + structured output API |
| @ai-sdk/mcp | ^1.0.25 | `createMCPClient` for MCP server connections | Official AI SDK MCP integration; auto-converts MCP tools to AI SDK tool format |
| @modelcontextprotocol/sdk | ^1.x | `StdioClientTransport` for stdio MCP connections | Official MCP TypeScript SDK; Bun-compatible stdio transport (unlike `Experimental_StdioMCPTransport`) |
| @ai-sdk/anthropic | ^3.0.58 | Anthropic Claude model provider | Official Vercel AI SDK provider; reads `ANTHROPIC_API_KEY` env var |
| @ai-sdk/openai | ^3.0.41 | OpenAI model provider | Official Vercel AI SDK provider; reads `OPENAI_API_KEY` env var |
| @ai-sdk/google | ^3.0.37 | Google Gemini model provider | Official Vercel AI SDK provider; reads `GOOGLE_GENERATIVE_AI_API_KEY` env var |
| @openrouter/ai-sdk-provider | ^2.2.5 | OpenRouter model provider | Official community provider; reads `OPENROUTER_API_KEY` |
| @playwright/mcp | latest | Playwright browser automation MCP server | Official Microsoft MCP server for browser testing; stdio transport |
| @calibress/curl-mcp | latest | HTTP/curl MCP server for API testing | Provides `curl_request` tool with all HTTP methods; stdio transport |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | ^4.3.6 | Schema for structured agent output (`Output.object()`) | Already installed from Phase 1; used for `{ passed, message }` output schema |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `StdioClientTransport` (MCP SDK) | `Experimental_StdioMCPTransport` (@ai-sdk/mcp) | AI SDK's version is Node.js only; MCP SDK version works with Bun |
| `@calibress/curl-mcp` | `@247arjun/mcp-curl` | Both work; calibress has cleaner single-tool API (`curl_request`) vs multiple tools |
| `Output.object()` structured output | Text marker parsing (`TEST_PASSED:`) | CONTEXT.md locks structured JSON output; no text marker parsing |
| `createProviderRegistry` | Custom switch/case factory | Registry is cleaner for 4+ providers; but custom factory is simpler for explicit mapping |
| `generateText` with `stopWhen` | `ToolLoopAgent` class | `generateText` is more flexible and lower-level; ToolLoopAgent wraps it but adds indirection |

**Installation:**
```bash
bun add ai@^6.0.116 @ai-sdk/mcp@^1.0.25 @modelcontextprotocol/sdk @ai-sdk/anthropic@^3.0.58 @ai-sdk/openai@^3.0.41 @ai-sdk/google@^3.0.37 @openrouter/ai-sdk-provider@^2.2.5
```

Note: `@playwright/mcp` and `@calibress/curl-mcp` are spawned via `bunx`/`npx` as child processes, not imported as dependencies. They do not need to be in `package.json` unless you want to pin versions.

## Architecture Patterns

### Recommended Project Structure (Phase 2 additions to Phase 1)
```
src/
  agent/
    agent-runner.ts      # generateText + tool loop, structured output, step recording
    model-factory.ts     # Provider registry: model string -> AI SDK provider instance
    mcp-manager.ts       # MCP server lifecycle: spawn, share, cleanup
    prompt.ts            # System prompt builder (pure function)
    types.ts             # AgentExecutionResult, AgentConfig
  cache/
    cache-manager.ts     # SHA-256 keyed JSON file store, load/save/delete
    step-recorder.ts     # MCP tool call interception during AI execution
    step-replayer.ts     # Sequential step re-execution for cache validation
    types.ts             # CachedStep, CacheEntry (extended with diagnostics)
  runner/
    test-executor.ts     # Cache-first strategy + retry loop (replaces Phase 1 stub)
  config/
    schema.ts            # Extended: add `type` and `context` fields to TestCaseSchema
```

### Pattern 1: MCP Server Lifecycle Manager
**What:** A single McpManager class that spawns Playwright MCP and curl MCP servers once, shares them across all tests, and provides tool sets for agent execution and cache replay.
**When to use:** Always -- spawning MCP servers per test is wasteful since they support shared connections.
**Example:**
```typescript
// Source: Adapted from reference + @ai-sdk/mcp docs
import { createMCPClient } from "@ai-sdk/mcp";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Config } from "../config/types.ts";

export class McpManager {
  private playwrightClient: Awaited<ReturnType<typeof createMCPClient>> | null = null;
  private curlClient: Awaited<ReturnType<typeof createMCPClient>> | null = null;

  constructor(private readonly config: Config) {}

  async initialize(): Promise<void> {
    // Spawn Playwright MCP server
    this.playwrightClient = await createMCPClient({
      transport: new StdioClientTransport({
        command: "bunx",
        args: [
          "@playwright/mcp@latest",
          "--headless",
          "--isolated",
          `--browser=${this.config.browser}`,
        ],
      }),
    });

    // Spawn curl MCP server
    this.curlClient = await createMCPClient({
      transport: new StdioClientTransport({
        command: "bunx",
        args: ["@calibress/curl-mcp"],
      }),
    });
  }

  async getTools(): Promise<Record<string, unknown>> {
    const playwrightTools = await this.playwrightClient!.tools();
    const curlTools = await this.curlClient!.tools();
    return { ...playwrightTools, ...curlTools };
  }

  async close(): Promise<void> {
    await Promise.allSettled([
      this.playwrightClient?.close(),
      this.curlClient?.close(),
    ]);
  }
}
```

### Pattern 2: Agent Runner with Structured Output
**What:** Use `generateText` with `Output.object()` for structured pass/fail JSON output, combined with MCP tools and `stopWhen` for loop control. No text marker parsing.
**When to use:** Every AI-driven test execution.
**Example:**
```typescript
// Source: Vercel AI SDK v6 docs (ai-sdk.dev)
import { generateText, Output, stepCountIs } from "ai";
import { z } from "zod";
import type { StepRecorder } from "../cache/step-recorder.ts";

const TestResultSchema = z.object({
  passed: z.boolean().describe("Whether the test case passed"),
  message: z.string().describe("Brief diagnostic: what happened and what the page showed"),
});

export async function executeAgent(
  model: Parameters<typeof generateText>[0]["model"],
  tools: Record<string, unknown>,
  systemPrompt: string,
  testCase: string,
  recursionLimit: number,
  recorder: StepRecorder,
): Promise<{ passed: boolean; message: string }> {
  // Note: structured output generation counts as one step
  const { output, steps } = await generateText({
    model,
    tools: recorder.wrapTools(tools),
    system: systemPrompt,
    prompt: `Execute the test case: "${testCase}"`,
    stopWhen: stepCountIs(recursionLimit),
    output: Output.object({ schema: TestResultSchema }),
  });

  if (!output) {
    return { passed: false, message: "Agent did not produce a structured result" };
  }

  return output;
}
```

### Pattern 3: Model Factory with Provider Registry
**What:** Map model name strings to the correct AI SDK provider instance. Support auto-inference from model name prefix when `modelProvider` is not set.
**When to use:** At startup, before test execution begins.
**Example:**
```typescript
// Source: Vercel AI SDK v6 provider docs
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

type ProviderName = "anthropic" | "openai" | "google" | "openrouter";

const ENV_VARS: Record<ProviderName, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

// Auto-inference rules: model name prefix -> provider
const MODEL_PREFIX_MAP: Array<[RegExp, ProviderName]> = [
  [/^claude-/, "anthropic"],
  [/^gpt-/, "openai"],
  [/^o\d/, "openai"],         // o1, o3, etc.
  [/^gemini-/, "google"],
  [/\//, "openrouter"],       // contains "/" -> openrouter (e.g., "anthropic/claude-3-5-sonnet")
];

export function inferProvider(modelName: string): ProviderName {
  for (const [pattern, provider] of MODEL_PREFIX_MAP) {
    if (pattern.test(modelName)) return provider;
  }
  return "anthropic"; // default fallback
}

export function validateApiKey(provider: ProviderName): void {
  const envVar = ENV_VARS[provider];
  if (!process.env[envVar]) {
    throw new Error(
      `Missing API key for ${provider}.\n` +
      `  Set the ${envVar} environment variable:\n` +
      `    export ${envVar}=your-key-here\n` +
      `  Or add it to your .env file.`
    );
  }
}

export function createModel(modelName: string, providerName: ProviderName) {
  switch (providerName) {
    case "anthropic":
      return anthropic(modelName);
    case "openai":
      return openai(modelName);
    case "google":
      return google(modelName);
    case "openrouter": {
      const openrouter = createOpenRouter({
        apiKey: process.env.OPENROUTER_API_KEY!,
      });
      return openrouter.chat(modelName);
    }
  }
}
```

### Pattern 4: Cache-First TestExecutor with Self-Healing
**What:** The TestExecutor checks for a cached entry, attempts replay, and falls back to AI on miss/staleness. Adds `self-healed` source indicator.
**When to use:** Every test execution in Phase 2.
**Example:**
```typescript
// Source: SuperGhost src/runner/test-executor.ts
// Extended with self-healing source tracking and diagnostics metadata
export class TestExecutor {
  async execute(testCase: TestCase, baseUrl: string): Promise<TestResult> {
    const start = Date.now();
    const cached = await this.cacheManager.load(testCase.case, baseUrl);

    if (cached) {
      const replay = await this.replayer.replay(cached.steps);
      if (replay.success) {
        return buildResult(testCase.name, "passed", "cache", start);
      }
      // Cache stale -- fall through to AI with self-heal tracking
      const aiResult = await this.executeWithAgent(testCase, baseUrl, start);
      if (aiResult.status === "passed") {
        aiResult.source = "ai"; // Reporter can check selfHealed flag
        aiResult.selfHealed = true;
      }
      return aiResult;
    }

    return this.executeWithAgent(testCase, baseUrl, start);
  }
}
```

### Pattern 5: Step Recorder with Tool Wrapping
**What:** Wrap MCP tools before passing to `generateText` so that every successful tool call is recorded. Record AFTER success, not before.
**When to use:** During AI-driven execution only (not during cache replay).
**Example:**
```typescript
// Source: SuperGhost src/cache/step-recorder.ts
import type { CachedStep } from "./types.ts";

export class StepRecorder {
  private steps: CachedStep[] = [];

  record(toolName: string, toolInput: Record<string, unknown>): void {
    this.steps.push({ toolName, toolInput });
  }

  getSteps(): CachedStep[] {
    return [...this.steps];
  }

  clear(): void {
    this.steps = [];
  }

  /** Wrap a tools object for use with generateText */
  wrapTools(tools: Record<string, any>): Record<string, any> {
    return Object.fromEntries(
      Object.entries(tools).map(([name, tool]) => [
        name,
        {
          ...tool,
          execute: async (...args: any[]) => {
            const result = await tool.execute(...args);
            this.record(name, args[0] as Record<string, unknown>);
            return result;
          },
        },
      ])
    );
  }
}
```

### Anti-Patterns to Avoid
- **Spawning MCP servers per test:** Context says MCP servers shared across the suite. Only browser context is per-test (via `--isolated`).
- **Using `Experimental_StdioMCPTransport` from `@ai-sdk/mcp`:** It is Node.js only. SuperGhost targets Bun. Use `StdioClientTransport` from `@modelcontextprotocol/sdk` instead.
- **Parsing text markers from AI response:** Context locks structured JSON output via `Output.object()`. Never parse `TEST_PASSED:` from text.
- **Using `generateObject` for structured output:** Deprecated in AI SDK v6. Use `generateText` with `Output.object()` instead.
- **Caching tool call results:** Only cache `{ toolName, toolInput }` pairs. Results contain dynamic content (timestamps, session tokens) that change every run.
- **Partial cache resume on stale step:** Context says any step failure = entire cache stale, full re-execution. No partial resume.
- **Using `maxSteps` parameter:** Renamed to `stopWhen: stepCountIs(n)` in AI SDK v5/v6. `maxSteps` is deprecated.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| MCP tool integration | Custom MCP protocol client | `createMCPClient` from `@ai-sdk/mcp` + `StdioClientTransport` | Protocol negotiation, tool schema conversion, transport lifecycle are complex |
| Multi-provider LLM support | Custom HTTP clients per provider | `@ai-sdk/anthropic`, `@ai-sdk/openai`, `@ai-sdk/google`, `@openrouter/ai-sdk-provider` | Each provider has different auth, request format, streaming, rate limiting |
| Agent tool-calling loop | Custom while loop with LLM calls | `generateText` with `stopWhen: stepCountIs(n)` | Handles message history accumulation, tool result injection, finish reason detection |
| Structured AI response | Regex/text parsing of AI output | `Output.object({ schema })` on `generateText` | Provider-specific structured output modes (JSON mode, tool-based, etc.); validates with Zod |
| SHA-256 hashing | Import `node:crypto` | `Bun.CryptoHasher("sha256")` | Bun-native, faster; no need for Node.js compatibility layer |
| Browser automation MCP | Custom Playwright integration | `@playwright/mcp` via stdio | Full MCP tool surface, accessibility snapshots, element interaction without screenshots |
| HTTP testing MCP | Custom fetch/curl wrapper | `@calibress/curl-mcp` via stdio | Structured responses with timing, status, headers; cookie persistence; redirect handling |

**Key insight:** The entire AI agent subsystem is built on three layers of composition: AI SDK provides the model loop, MCP provides the tool surface, and the cache layer sits orthogonally recording/replaying tool calls. None of these should be custom-built.

## Common Pitfalls

### Pitfall 1: Structured Output Counts as a Step
**What goes wrong:** Agent exhausts step limit and never produces structured output.
**Why it happens:** `Output.object()` generation counts as one step in the `stopWhen` budget. If `recursionLimit` is 500 and the agent uses exactly 500 tool-calling steps, there is no step left for structured output.
**How to avoid:** Use `stopWhen: stepCountIs(recursionLimit)` where recursionLimit is the user's configured value. The agent will use up to `recursionLimit - 1` steps for tools and the final step for structured output. Document this clearly.
**Warning signs:** Agent returns `null` output with `finishReason: "stop-count"`.

### Pitfall 2: Experimental_StdioMCPTransport Is Node.js Only
**What goes wrong:** MCP client fails to spawn child processes when running on Bun.
**Why it happens:** `Experimental_StdioMCPTransport` from `@ai-sdk/mcp/mcp-stdio` explicitly states "only supported in Node.js environments."
**How to avoid:** Use `StdioClientTransport` from `@modelcontextprotocol/sdk/client/stdio.js` instead. This works with Bun (the MCP TypeScript SDK supports Node.js, Bun, and Deno).
**Warning signs:** Import errors or subprocess spawn failures at runtime on Bun.

### Pitfall 3: OpenRouter Model Name Format Differs
**What goes wrong:** OpenRouter API returns 404 or model not found errors.
**Why it happens:** OpenRouter uses `vendor/model-name` format (e.g., `anthropic/claude-3-5-sonnet`) whereas other providers use just the model name (e.g., `claude-sonnet-4-6`).
**How to avoid:** The model factory should detect the `/` in model names and route to OpenRouter. Document this format difference.
**Warning signs:** Model names that work with direct Anthropic API fail when routed through OpenRouter.

### Pitfall 4: MCP Server Startup Latency
**What goes wrong:** First test takes 5-15 seconds due to MCP server spawning.
**Why it happens:** `@playwright/mcp` needs to download and launch a browser. `bunx` may need to fetch the package on first run.
**How to avoid:** Initialize MCP servers before the test loop starts (in the CLI action, after config load). The startup cost is amortized across all tests since servers are shared. Consider pre-installing `@playwright/mcp` as a dependency if cold-start matters.
**Warning signs:** First test dramatically slower than subsequent tests even on AI path.

### Pitfall 5: Google Gemini Tool Call Response Shape
**What goes wrong:** Tool calling works with Anthropic/OpenAI but fails with Gemini.
**Why it happens:** Different providers may format tool responses differently. Gemini has specific safety settings and content filtering that can interfere with tool calling.
**How to avoid:** Use the Vercel AI SDK abstraction layer (never call provider APIs directly). Test with all four providers during integration testing. If Gemini blocks content, configure safety settings via `providerOptions`.
**Warning signs:** Tests pass with Claude/GPT but fail with Gemini on identical test cases.

### Pitfall 6: Cache Replay Without Live MCP Tools
**What goes wrong:** Cache replay attempts to call tools that don't exist because MCP servers weren't started.
**Why it happens:** Optimization attempt: "skip MCP spawn for cached tests." But replay needs to execute tool calls against a real browser to verify the cache is still valid.
**How to avoid:** Always start MCP servers before any test execution, even for cached tests. The replay path executes real tool calls, not simulated ones.
**Warning signs:** Cache tests fail with "tool not found" errors.

### Pitfall 7: Race Condition on Cache Write After Self-Heal
**What goes wrong:** Cache file written with incomplete or corrupted data.
**Why it happens:** If the process is interrupted during cache save after a successful self-heal, the JSON may be partially written.
**How to avoid:** Write to a temporary file first, then atomically rename. Bun's `Bun.write()` is not guaranteed atomic on all filesystems. Use write-then-rename pattern: `Bun.write(tmpPath, data)` then `fs.rename(tmpPath, finalPath)`.
**Warning signs:** Cache files with truncated JSON that cause parse errors on next run.

### Pitfall 8: API Key Validated for Wrong Provider
**What goes wrong:** Missing API key error at startup even though the key is set.
**Why it happens:** Provider auto-inference maps to wrong provider, or `modelProvider` config does not match the actual model.
**How to avoid:** Validate the API key for the inferred/specified provider AFTER resolving which provider to use. Include both the model name and provider name in the error message.
**Warning signs:** Error says "Missing OPENAI_API_KEY" when using a Claude model.

## Code Examples

### createMCPClient with StdioClientTransport (Bun-compatible)
```typescript
// Source: Vercel AI SDK v6 docs (ai-sdk.dev/docs/ai-sdk-core/mcp-tools)
// Using @modelcontextprotocol/sdk transport instead of Node-only Experimental_StdioMCPTransport
import { createMCPClient } from "@ai-sdk/mcp";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const playwrightClient = await createMCPClient({
  transport: new StdioClientTransport({
    command: "bunx",
    args: ["@playwright/mcp@latest", "--headless", "--isolated", "--browser=chromium"],
  }),
});

const tools = await playwrightClient.tools();
// tools is a Record<string, Tool> compatible with generateText
```

### generateText with Output.object() and MCP Tools
```typescript
// Source: Vercel AI SDK v6 docs (ai-sdk.dev/docs/ai-sdk-core/generating-structured-data)
import { generateText, Output, stepCountIs } from "ai";
import { z } from "zod";

const TestResultSchema = z.object({
  passed: z.boolean().describe("Whether the test case passed or failed"),
  message: z.string().describe(
    "1-2 sentence diagnostic: what happened and what the page showed"
  ),
});

const { output, steps, totalUsage } = await generateText({
  model: anthropic("claude-sonnet-4-6"),
  tools: mcpTools,
  system: systemPrompt,
  prompt: `Execute the test case: "${testCase}"`,
  stopWhen: stepCountIs(500), // recursionLimit from config
  output: Output.object({ schema: TestResultSchema }),
});

// output is typed as { passed: boolean; message: string } | null
if (output) {
  console.log(output.passed ? "PASS" : "FAIL", output.message);
}
```

### Provider Setup (All Four Providers)
```typescript
// Source: AI SDK provider docs (ai-sdk.dev/providers/)
import { anthropic } from "@ai-sdk/anthropic";    // ANTHROPIC_API_KEY
import { openai } from "@ai-sdk/openai";           // OPENAI_API_KEY
import { google } from "@ai-sdk/google";            // GOOGLE_GENERATIVE_AI_API_KEY
import { createOpenRouter } from "@openrouter/ai-sdk-provider"; // OPENROUTER_API_KEY

// Each provider reads its API key from env vars automatically (except OpenRouter)
const models = {
  anthropic: anthropic("claude-sonnet-4-6"),
  openai: openai("gpt-4o"),
  google: google("gemini-2.5-flash"),
  openrouter: createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY!,
  }).chat("anthropic/claude-3-5-sonnet"),
};
```

### Bun-Native SHA-256 Hashing for Cache Keys
```typescript
// Source: Bun docs (bun.sh/docs/runtime/hashing)
function hashKey(testCase: string, baseUrl: string): string {
  const input = `${testCase}|${baseUrl}`;
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(input);
  return hasher.digest("hex").slice(0, 16);
}
```

### System Prompt Builder with Context
```typescript
// SuperGhost src/agent/agent-factory.ts
// Extended with user-provided context field
function buildSystemPrompt(
  testCase: string,
  baseUrl: string,
  context?: string,
): string {
  const lines = [
    "You are a QA automation agent. Execute the following test case and determine if it passes or fails.",
    "",
    `Test case: "${testCase}"`,
    `Base URL: "${baseUrl}"`,
    "",
    "You have access to both browser automation tools and HTTP/curl tools.",
    "Choose the appropriate tools based on the test case.",
    "",
    "For browser/UI tests:",
    "- Navigate to the base URL first",
    "- Use browser_snapshot to understand page state before acting",
    "- Use browser_click, browser_type for interactions",
    "",
    "For API tests:",
    "- Use the curl_request tool to make HTTP requests",
    "- Check status codes, headers, and response body",
    "",
    "Instructions:",
    "1. Analyze the test case and decide which tools to use.",
    "2. Execute the actions needed to verify the test case.",
    "3. Be methodical. If something doesn't work, try alternative approaches before declaring failure.",
    "4. When finished, provide your verdict as structured output with passed (boolean) and message (brief diagnostic).",
  ];

  if (context) {
    lines.push("", "Additional context from the user:", context);
  }

  return lines.join("\n");
}
```

### Extended CacheEntry Type with Diagnostics
```typescript
// SuperGhost src/cache/types.ts
// Per CONTEXT.md: includes diagnostics metadata
export interface CachedStep {
  toolName: string;
  toolInput: Record<string, unknown>;
}

export interface CacheEntry {
  version: 1;
  testCase: string;
  baseUrl: string;
  steps: CachedStep[];
  // Diagnostics metadata (from CONTEXT.md)
  model: string;
  provider: string;
  stepCount: number;
  aiMessage: string;
  durationMs: number;
  // Timestamps
  createdAt: string;
  updatedAt: string;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `maxSteps` parameter | `stopWhen: stepCountIs(n)` | AI SDK v5 (July 2025) | More flexible loop control; default changed from 1 to 20 steps |
| `generateObject` for structured output | `generateText` with `Output.object()` | AI SDK v6 (Dec 2025) | Unified API; `generateObject` deprecated |
| `Experimental_Agent` class | `ToolLoopAgent` class | AI SDK v6 (Dec 2025) | Renamed; `system` -> `instructions`; default 20 steps |
| LangChain `createReactAgent` | Vercel AI SDK `generateText` with tools | Project decision | Simpler dependency tree; better TypeScript; Bun-compatible |
| `@langchain/mcp-adapters` | `@ai-sdk/mcp` `createMCPClient` | Project decision | Native AI SDK integration; auto tool conversion |
| `node:crypto` createHash | `Bun.CryptoHasher` | Bun 1.0+ | Native Bun API; faster; no Node.js polyfill needed |
| Per-test MCP server spawn | Shared MCP servers with `--isolated` browser | CONTEXT.md decision | Performance; MCP spawn is expensive (~2-5s) |

**Deprecated/outdated:**
- `generateObject` / `streamObject`: Deprecated in AI SDK v6. Use `generateText`/`streamText` with `Output.object()`.
- `maxSteps` parameter: Replaced by `stopWhen: stepCountIs(n)` in AI SDK v5.
- `Experimental_Agent`: Renamed to `ToolLoopAgent` in AI SDK v6.
- `Experimental_StdioMCPTransport`: Marked experimental and Node.js only. Use `StdioClientTransport` from `@modelcontextprotocol/sdk`.
- `convertToCoreMessages`: Renamed to `convertToModelMessages` (async) in AI SDK v6.
- `CoreMessage` type: Renamed to `ModelMessage` in AI SDK v6.

## Open Questions

1. **Bun + StdioClientTransport performance**
   - What we know: `@modelcontextprotocol/sdk` claims Bun support. A Bun issue (#22396) reports SSE transport being 100x slower on Bun, but that issue is about SSE, not stdio.
   - What's unclear: Whether stdio transport has similar performance issues on Bun.
   - Recommendation: Test during Wave 0 integration testing. If stdio is slow on Bun, consider using `node` as the spawn command for MCP servers (Bun can spawn Node.js processes) or switching to HTTP transport with `--port` flag.

2. **Fresh browser context per test with shared MCP server**
   - What we know: `--isolated` flag gives in-memory profiles. CONTEXT.md says MCP servers shared, fresh browser context per test.
   - What's unclear: How to reset the browser context between tests when the MCP server is shared. `@playwright/mcp` may not expose a "new context" tool -- the `--isolated` flag may only apply at server start.
   - Recommendation: Test whether calling `browser_navigate` to `about:blank` or a similar reset action between tests is sufficient, or whether the MCP server needs to be restarted per test despite the CONTEXT.md decision. If shared servers cannot provide per-test isolation, fall back to per-test MCP spawn with the understanding of startup cost.

3. **OpenRouter API key env var auto-read**
   - What we know: `@ai-sdk/anthropic`, `@ai-sdk/openai`, and `@ai-sdk/google` auto-read their API keys from env vars. `@openrouter/ai-sdk-provider` requires explicit `apiKey` in `createOpenRouter()`.
   - What's unclear: Whether newer versions of `@openrouter/ai-sdk-provider` auto-read `OPENROUTER_API_KEY`.
   - Recommendation: Explicitly pass `process.env.OPENROUTER_API_KEY` to `createOpenRouter()`. This is the documented pattern and works regardless of version.

4. **`Output.object()` compatibility across all four providers**
   - What we know: AI SDK v6 supports structured output with Anthropic (native for Claude Sonnet 4.5+), OpenAI (strictJsonSchema), and Google (structuredOutputs). OpenRouter support depends on the underlying model.
   - What's unclear: Whether structured output works reliably via OpenRouter with all model types.
   - Recommendation: Integration test with all four providers. If a provider fails structured output, fall back to text parsing as a degraded path (but log a warning).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in, Jest-compatible) |
| Config file | bunfig.toml (optional; no config needed for defaults) |
| Quick run command | `bun test` |
| Full suite command | `bun test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AGNT-01 | AI agent executes browser tests via Playwright MCP | integration | `bun test tests/integration/agent-browser.test.ts -x` | Wave 0 |
| AGNT-02 | AI agent executes API tests via curl MCP | integration | `bun test tests/integration/agent-api.test.ts -x` | Wave 0 |
| AGNT-03 | Independent browser context per test | integration | `bun test tests/integration/browser-isolation.test.ts -x` | Wave 0 |
| AGNT-04 | Retry failed tests up to maxAttempts | unit | `bun test tests/unit/runner/test-executor.test.ts -x` | Wave 0 |
| AGNT-05 | Diagnostic error message on failure | unit | `bun test tests/unit/agent/agent-runner.test.ts -x` | Wave 0 |
| CACH-01 | Steps recorded to `.superghost-cache/<hash>.json` | unit | `bun test tests/unit/cache/cache-manager.test.ts -x` | Wave 0 |
| CACH-02 | SHA-256 hash key from testCase+baseUrl | unit | `bun test tests/unit/cache/cache-manager.test.ts -x` | Wave 0 |
| CACH-03 | Cached steps replay without AI | unit | `bun test tests/unit/cache/step-replayer.test.ts -x` | Wave 0 |
| CACH-04 | Stale cache triggers AI re-execution | unit | `bun test tests/unit/runner/test-executor.test.ts -x` | Wave 0 |
| CACH-05 | Cache updated after successful self-heal | unit | `bun test tests/unit/runner/test-executor.test.ts -x` | Wave 0 |
| CACH-06 | Cache deleted after failed self-heal | unit | `bun test tests/unit/runner/test-executor.test.ts -x` | Wave 0 |
| CACH-07 | Cache files human-readable with metadata | unit | `bun test tests/unit/cache/cache-manager.test.ts -x` | Wave 0 |
| PROV-01 | Anthropic provider works | unit | `bun test tests/unit/agent/model-factory.test.ts -x` | Wave 0 |
| PROV-02 | OpenAI provider works | unit | `bun test tests/unit/agent/model-factory.test.ts -x` | Wave 0 |
| PROV-03 | Google Gemini provider works | unit | `bun test tests/unit/agent/model-factory.test.ts -x` | Wave 0 |
| PROV-04 | OpenRouter provider works | unit | `bun test tests/unit/agent/model-factory.test.ts -x` | Wave 0 |
| PROV-05 | Provider auto-inferred from model name | unit | `bun test tests/unit/agent/model-factory.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test`
- **Per wave merge:** `bun test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/cache/cache-manager.test.ts` -- covers CACH-01, CACH-02, CACH-07 (hash generation, save/load/delete, metadata)
- [ ] `tests/unit/cache/step-recorder.test.ts` -- covers CACH-01 (tool wrapping, step recording)
- [ ] `tests/unit/cache/step-replayer.test.ts` -- covers CACH-03 (sequential replay, error detection)
- [ ] `tests/unit/runner/test-executor.test.ts` -- covers AGNT-04, CACH-04, CACH-05, CACH-06 (cache-first strategy, retry loop, self-heal)
- [ ] `tests/unit/agent/model-factory.test.ts` -- covers PROV-01 through PROV-05 (provider creation, auto-inference, API key validation)
- [ ] `tests/unit/agent/agent-runner.test.ts` -- covers AGNT-05 (structured output, diagnostic messages)
- [ ] `tests/unit/agent/prompt.test.ts` -- covers system prompt building with context field
- [ ] `tests/integration/agent-browser.test.ts` -- covers AGNT-01 (live browser test, requires MCP server)
- [ ] `tests/integration/agent-api.test.ts` -- covers AGNT-02 (live API test, requires curl MCP)
- [ ] `tests/integration/browser-isolation.test.ts` -- covers AGNT-03 (two sequential tests, verify no state leak)

## Sources

### Primary (HIGH confidence)
- Vercel AI SDK v6 migration guide (ai-sdk.dev/docs/migration-guides/migration-guide-6-0) -- breaking changes, `maxSteps` -> `stopWhen`, `generateObject` deprecation
- Vercel AI SDK MCP tools docs (ai-sdk.dev/docs/ai-sdk-core/mcp-tools) -- `createMCPClient`, transport options, tool discovery
- Vercel AI SDK structured output docs (ai-sdk.dev/docs/ai-sdk-core/generating-structured-data) -- `Output.object()`, combining with tool calling
- Vercel AI SDK agent loop control (ai-sdk.dev/docs/agents/loop-control) -- `stopWhen`, `stepCountIs`, `prepareStep`, custom stop conditions
- Vercel AI SDK `createMCPClient` reference (ai-sdk.dev/docs/reference/ai-sdk-core/create-mcp-client) -- full API, transport config, error handling
- AI SDK provider docs: Anthropic (ai-sdk.dev/providers/ai-sdk-providers/anthropic), OpenAI (/openai), Google (/google-generative-ai)
- OpenRouter provider (ai-sdk.dev/providers/community-providers/openrouter) -- setup, model name format
- Playwright MCP GitHub (github.com/microsoft/playwright-mcp) -- CLI flags, --isolated, --headless, browser context modes
- @calibress/curl-mcp GitHub (github.com/calibress/curl-mcp) -- `curl_request` tool, stdio transport, HTTP methods

### Secondary (MEDIUM confidence)
- AI SDK Node.js MCP cookbook (ai-sdk.dev/cookbook/node/mcp-tools) -- working example with StdioClientTransport
- Bun CryptoHasher docs (bun.sh/docs/runtime/hashing) -- SHA-256 hashing API
- Bun issue #22396 (github.com/oven-sh/bun/issues/22396) -- MCP SSE transport slow on Bun (open, but SSE-specific, not stdio)

### Tertiary (LOW confidence)
- OpenRouter `OPENROUTER_API_KEY` env var name -- inferred from code examples, not explicitly documented as auto-read default
- Bun + StdioClientTransport performance -- untested; SSE issue exists but may not apply to stdio

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages verified via official docs, npm registry, and GitHub
- Architecture: HIGH -- patterns adapted from working reference implementation with AI SDK v6 equivalents verified
- Pitfalls: HIGH -- verified against AI SDK v6 migration guide, MCP docs, and Bun compatibility reports
- Provider integration: MEDIUM -- individual providers verified, but cross-provider structured output interop with OpenRouter needs integration testing

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (AI SDK v6 stable; provider packages actively updated but API stable)
