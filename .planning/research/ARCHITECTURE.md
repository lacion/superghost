# Architecture Research

**Domain:** AI-powered E2E browser testing CLI tool — v0.2 DX feature integration
**Researched:** 2026-03-11
**Confidence:** HIGH — based on direct source inspection of the shipped v1.0 codebase

---

## Context: What This Document Covers

This is a v0.2 integration architecture document. It focuses exclusively on how the five new features thread through the existing v1.0 architecture. The v1.0 architecture document (written 2026-03-10) covers the baseline system design. This document answers:

- Where does each new flag/feature attach to the existing execution flow?
- What is new code vs. modified existing code?
- What are the data flow changes?
- What build order respects dependencies between the new features?

---

## Existing Architecture: Execution Flow Summary

Before mapping integration points, here is the current end-to-end call chain that the new features must thread through:

```
cli.ts
  |
  ├── loadConfig(options.config)              // config/loader.ts
  ├── new ConsoleReporter()                   // output/reporter.ts
  ├── inferProvider() + validateApiKey()      // agent/model-factory.ts
  ├── createModel()                           // agent/model-factory.ts
  ├── new McpManager(...).initialize()        // agent/mcp-manager.ts
  ├── new CacheManager(config.cacheDir)       // cache/cache-manager.ts
  ├── new StepReplayer(toolExecutor)          // cache/step-replayer.ts
  ├── new TestExecutor({...})                 // runner/test-executor.ts
  ├── new TestRunner(config, reporter, fn)    // runner/test-runner.ts
  └── runner.run() → RunResult
        |
        └── for each test:
              TestExecutor.execute(testCase, baseUrl, testContext)
                |
                ├── CacheManager.load(testCase, baseUrl)
                │     → hit: StepReplayer.replay(steps) → TestResult
                │     → miss: executeAgent({model, tools, testCase, ...})
                │               |
                │               └── generateText({model, tools, system, prompt, stopWhen, output})
                │                     → CacheManager.save(testCase, baseUrl, steps, diag)
                │                     → TestResult
                └── Reporter.onTestComplete(result)
```

Exit code: `result.failed > 0 ? 1 : 0` (only two codes today).

---

## Feature Integration Map

### Feature 1: `--only <pattern>` Flag

**Where it attaches:** `cli.ts` → `config.tests` filtering → `TestRunner`

**Mechanism:** Filter `config.tests` after `loadConfig()`, before constructing `TestRunner`. No changes needed inside `TestRunner`, `TestExecutor`, or any other module.

**New vs. Modified:**
- `cli.ts` — modified: add `.option("--only <pattern>", ...)` to Commander definition; after loadConfig, apply `config.tests = config.tests.filter(t => t.name.includes(options.only) || t.case.includes(options.only))` (or glob/regex match per spec)

**Data flow change:**
```
cli.ts:
  loadConfig(path) → Config
  if (options.only):
    config.tests = config.tests.filter(matchesPattern(options.only))
  → TestRunner(config, ...)
```

**No changes required in:** `TestRunner`, `TestExecutor`, `CacheManager`, `AgentRunner`, `Reporter`

**Edge case:** If the filtered list is empty, exit 0 with a message (not exit 2 — empty `--only` match is a valid user action, not a runtime error).

---

### Feature 2: `--no-cache` Flag

**Where it attaches:** `cli.ts` → `TestExecutor` constructor

**Mechanism:** Pass a `noCache` boolean into `TestExecutor`. When true, skip `CacheManager.load()` (force AI path). Whether to also skip `CacheManager.save()` on success is a design choice — the safest default is to still write the cache (the flag means "don't read stale cache", not "produce no cache"). Document this behavior explicitly.

**New vs. Modified:**
- `cli.ts` — modified: add `.option("--no-cache", ...)` to Commander; pass `noCache: !!options.noCache` into `TestExecutor` constructor options
- `runner/test-executor.ts` — modified: add `noCache?: boolean` to constructor options; in `execute()`, guard `CacheManager.load()` with `if (!this.noCache)`

**Data flow change:**
```
TestExecutor.execute(testCase, baseUrl):
  if (!this.noCache):
    cached = CacheManager.load(...)
    if (cached && replay.success): return cache result
  // Always fall through to AI when --no-cache
  return this.executeWithAgent(...)
```

**No changes required in:** `TestRunner`, `CacheManager`, `AgentRunner`, `Reporter`, `cli.ts` wiring beyond options pass-through

---

### Feature 3: `--dry-run` Flag

**Where it attaches:** `cli.ts` → skip MCP initialization → `TestRunner` receives a stub `executeFn`

**Mechanism:** Dry-run must skip MCP server spawning (no `mcpManager.initialize()`) and skip AI execution. The cleanest integration is to short-circuit the `executeFn` passed to `TestRunner` — return a synthetic `TestResult` for every test without touching `TestExecutor`. This means dry-run does NOT require changes to `TestExecutor`, `CacheManager`, or `AgentRunner`.

**New vs. Modified:**
- `cli.ts` — modified: add `.option("--dry-run", ...)` to Commander; add a branch:
  ```
  if (options.dryRun):
    // Skip McpManager init, skip TestExecutor construction
    const dryRunFn: ExecuteFn = (testCase, baseUrl) => Promise.resolve({
      testName: testCase, testCase, status: "passed",
      source: "dry-run", durationMs: 0
    })
    const runner = new TestRunner(config, reporter, dryRunFn)
    const result = await runner.run()
    process.exit(0)
  ```
- `runner/types.ts` — modified: extend `TestSource` type to include `"dry-run"` (or use a separate `dryRun?: boolean` flag on `TestResult`)
- `output/reporter.ts` — modified: add handling for `source === "dry-run"` in `onTestComplete` display

**Data flow change:**
```
cli.ts:
  if (options.dryRun):
    skip McpManager.initialize()
    skip CacheManager construction
    skip TestExecutor construction
    stub executeFn → synthetic TestResults
    reporter shows "dry-run" source label
    exit 0
```

**No changes required in:** `TestRunner` (it accepts any `executeFn`), `TestExecutor`, `CacheManager`, `AgentRunner`, `McpManager`

**Why this approach:** `TestRunner` already accepts `executeFn` via injection. Dry-run is just a different function at the same injection site — no new abstraction layer needed.

---

### Feature 4: `--verbose` Flag

**Where it attaches:** `cli.ts` → `Reporter` variant + `executeAgent` `onStepFinish` callback

**Mechanism:** Verbose mode has two output surfaces:
1. **Reporter-level verbose:** Show more detail in `onTestComplete` (step count, AI message, cache metadata). Controlled by passing a `verbose` flag to `ConsoleReporter`.
2. **Agent step-level verbose:** Print each MCP tool call in real time as the AI executes. Controlled by passing an `onStepFinish` callback into `executeAgent`.

The Vercel AI SDK's `generateText` supports `onStepFinish` (callback invoked after each tool step). This is the correct hook for real-time step progress — it is invoked synchronously between tool calls, before the final response.

**New vs. Modified:**
- `cli.ts` — modified: add `.option("--verbose", ...)` to Commander; pass `verbose` to `ConsoleReporter` constructor; pass `onStepFinish` handler into `TestExecutor` (or directly into `executeAgent` config)
- `output/reporter.ts` — modified: add `verbose?: boolean` constructor option; in `onTestComplete`, when verbose, print step count and AI message
- `agent/agent-runner.ts` — modified: accept optional `onStepFinish?: (step: StepInfo) => void` in the config parameter; pass it into `generateText`
- `runner/test-executor.ts` — modified: thread `onStepFinish` through `executeAgentFn` config if provided

**Data flow change (verbose step progress):**
```
executeAgent({..., onStepFinish}):
  generateText({
    ...,
    onStepFinish: (step) => {
      if (onStepFinish && step.toolCalls):
        for each toolCall in step.toolCalls:
          onStepFinish({ toolName: toolCall.toolName, toolInput: toolCall.input })
    }
  })
```

**Output format for verbose step progress:**
```
  [step 1] browser_navigate { url: "https://example.com" }
  [step 2] browser_snapshot {}
  [step 3] browser_click { selector: "button[type=submit]" }
```

**No changes required in:** `TestRunner`, `CacheManager`, `StepRecorder`, `StepReplayer`

**Note:** `onStepFinish` in Vercel AI SDK is a function callback on the `generateText` options object. It fires after each agent step (one step = one round of tool calls). This is HIGH confidence from Vercel AI SDK docs — the parameter exists and behaves as described.

---

### Feature 5: Preflight `baseUrl` Reachability Check

**Where it attaches:** `cli.ts` — between `loadConfig()` and `mcpManager.initialize()`, or inside `TestRunner.run()` before the test loop

**Mechanism:** Issue an HTTP HEAD (or GET) request to the `baseUrl` and verify the response is reachable (status < 500, or simply that the connection doesn't time out). Failure should exit with code 2 (config/runtime error), not code 1 (test failure).

**Two viable attachment points:**

Option A — in `cli.ts`, before MCP init:
```
config = await loadConfig(options.config)
if (config.baseUrl):
  await checkReachability(config.baseUrl)  // throws PreflightError on failure
mcpManager.initialize()
```

Option B — in `TestRunner.run()`, at the start of the loop:
```
async run():
  if (this.config.baseUrl):
    await this.preflightCheck(this.config.baseUrl)
  for each test: ...
```

**Recommended: Option A (in `cli.ts`)** because:
- Preflight is a startup concern, not a per-test concern
- Failure should produce exit code 2 before any MCP processes are spawned
- Keeps `TestRunner` focused on test iteration, not infrastructure checks
- Consistent with where `validateApiKey` already lives (startup, before test execution)

**New code:**
- `infra/preflight.ts` — new file: `async function checkBaseUrl(url: string): Promise<void>` — fetch with a short timeout (5s), throw `PreflightError` if unreachable
- `cli.ts` — modified: call `checkBaseUrl(config.baseUrl)` in the try block, before MCP init; catch `PreflightError` in the catch block alongside `ConfigLoadError`, exiting with code 2

**Data flow change:**
```
cli.ts (try block):
  config = await loadConfig(options.config)
  if (config.baseUrl):
    await checkBaseUrl(config.baseUrl)   // NEW — exits 2 on failure
  validateApiKey(provider)
  mcpManager.initialize()
  ...

cli.ts (catch block):
  if (error instanceof PreflightError):
    stderr("Cannot reach baseUrl: ...")
    process.exit(2)                      // NEW exit code
```

**No changes required in:** `TestRunner`, `TestExecutor`, `CacheManager`, `AgentRunner`

**Implementation note:** Use `fetch()` with an `AbortController` timeout (Bun supports native fetch). Check for per-test `baseUrl` overrides — if individual tests have different `baseUrl` values, consider checking only the global `config.baseUrl` for the preflight (per-test URLs are checked as tests run, not at startup).

---

### Feature 6: Real-Time Step Progress Output

**Where it attaches:** `executeAgent` via Vercel AI SDK `onStepFinish` callback

This is covered under `--verbose` (Feature 4) above. Real-time step progress IS the verbose step output. The two features are architecturally the same hook — `onStepFinish` in `generateText`.

If the spec requires step progress in non-verbose mode too (e.g., always show step count during execution), the integration point is the same — just always attach the `onStepFinish` handler and print to stdout. The `ConsoleReporter` spinner can be updated with step-in-progress text via `spinner.update()` (nanospinner supports this).

**Reporter integration for progress updates:**
```
// In Reporter interface (output/types.ts) — new optional method:
onStepProgress?(toolName: string, stepNumber: number): void

// In ConsoleReporter:
onStepProgress(toolName: string, stepNumber: number): void:
  this.spinner?.update({ text: `${testName} [step ${stepNumber}: ${toolName}]` })
```

This keeps step progress observable through the Reporter interface without coupling agent internals to console output directly.

---

### Feature 7: Distinct Exit Codes (0 / 1 / 2)

**Where it attaches:** `cli.ts` catch block

**Current state:** Only two exit codes exist:
- `0` — all tests passed
- `1` — any test failed OR any thrown error (both use `exit(1)`)

**v0.2 requirement:**
- `0` — all tests passed
- `1` — one or more tests failed (test failures)
- `2` — config error, runtime error, preflight failure, missing API key

**New vs. Modified:**
- `cli.ts` — modified: change catch block to use `exit(2)` for all non-test-failure errors:
  ```
  catch (error):
    if (error instanceof ConfigLoadError): exit(2)
    if (error instanceof PreflightError): exit(2)
    if (error.message.startsWith("Missing API key")): exit(2)
    // Unhandled errors also exit(2) (runtime errors)
    exit(2)
  ```
- The success path stays: `result.failed > 0 ? exit(1) : exit(0)`

**No new types or modules required** — this is purely a change to the exit code selection logic in `cli.ts`.

---

### Feature 8: Cache Key Normalization

**Where it attaches:** `CacheManager.hashKey()` — single static method in `cache/cache-manager.ts`

**Current state:**
```typescript
static hashKey(testCase: string, baseUrl: string): string {
  const input = `${testCase}|${baseUrl}`;
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(input);
  return hasher.digest("hex").slice(0, 16);
}
```

The hash is computed from the raw string. Any whitespace difference (leading spaces, trailing newlines, multiple spaces between words) produces a different key for semantically identical test cases.

**Change required:**
```typescript
static normalizeKey(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

static hashKey(testCase: string, baseUrl: string): string {
  const input = `${this.normalizeKey(testCase)}|${this.normalizeKey(baseUrl)}`;
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(input);
  return hasher.digest("hex").slice(0, 16);
}
```

**Migration concern:** Existing cache files have keys computed without normalization. After this change, any test case that had extra whitespace will produce a new hash, missing the existing cache entry. The cache will self-heal (AI re-executes and writes a new entry with the normalized key). Old entries become orphaned files — acceptable, since the cache is a `.superghost-cache/` directory users can delete.

**New vs. Modified:**
- `cache/cache-manager.ts` — modified: add `normalizeKey()` static method; apply to both `testCase` and `baseUrl` in `hashKey()`

**No changes required in:** `cli.ts`, `TestExecutor`, `StepRecorder`, `StepReplayer`, any other module (they all call `hashKey` indirectly through `CacheManager.load/save/delete`)

---

## System Overview: v0.2 Integrated Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                            CLI Layer                                   │
│  superghost --config tests.yaml [--dry-run] [--verbose]               │
│             [--no-cache] [--only <pattern>]                            │
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │  cli.ts                                                        │     │
│  │  1. loadConfig()                                               │     │
│  │  2. filter config.tests on --only pattern           [NEW]     │     │
│  │  3. checkBaseUrl(config.baseUrl) preflight          [NEW]     │     │
│  │  4. validateApiKey()                                           │     │
│  │  5. McpManager.initialize()  (skipped on --dry-run) [MOD]    │     │
│  │  6. wire TestExecutor (noCache, onStepFinish flags) [MOD]    │     │
│  │  7. runner.run()                                               │     │
│  │  8. exit 0/1/2                                      [MOD]    │     │
│  └──────────────────────────────┬───────────────────────────────┘     │
└─────────────────────────────────┼────────────────────────────────────┘
                                  │
┌─────────────────────────────────▼────────────────────────────────────┐
│                          Runner Layer                                   │
│  ┌──────────────────┐      ┌──────────────────────────────────────┐   │
│  │  TestRunner       │─────▶│  TestExecutor                         │   │
│  │  (unchanged)      │      │  - noCache flag bypasses load()      │   │
│  │                   │      │  - threads onStepFinish through      │   │
│  │                   │      │    executeAgentFn config             │   │
│  └──────────────────┘      └──────────────────┬───────────────────┘   │
└─────────────────────────────────────────────────┼──────────────────────┘
                                                  │
               ┌──────────────────────────────────┼────────────────────┐
               │                                  │                     │
┌──────────────▼───────────────┐  ┌───────────────▼────────────────────┐
│       Cache Layer             │  │          Agent Layer                │
│  ┌─────────────────────────┐ │  │  ┌───────────────────────────────┐ │
│  │  CacheManager           │ │  │  │  executeAgent()                │ │
│  │  + normalizeKey()  [MOD]│ │  │  │  + onStepFinish callback [MOD]│ │
│  │  - hashKey normalized   │ │  │  │  fires on each tool step      │ │
│  └─────────────────────────┘ │  │  └───────────────────────────────┘ │
│  ┌─────────────────────────┐ │  └────────────────────────────────────┘
│  │  StepReplayer            │ │
│  │  (unchanged)             │ │
│  └─────────────────────────┘ │  ┌─────────────────────────────────────┐
└──────────────────────────────┘  │       Infra Layer                    │
                                  │  ┌───────────────────────────────┐  │
┌──────────────────────────────┐  │  │  preflight.ts          [NEW]  │  │
│       Output Layer            │  │  │  checkBaseUrl(url)            │  │
│  ┌─────────────────────────┐ │  │  └───────────────────────────────┘  │
│  │  ConsoleReporter         │ │  │  ┌───────────────────────────────┐  │
│  │  + verbose flag    [MOD]│ │  │  │  ProcessManager (unchanged)   │  │
│  │  + onStepProgress  [MOD]│ │  │  └───────────────────────────────┘  │
│  └─────────────────────────┘ │  └─────────────────────────────────────┘
└──────────────────────────────┘
```

---

## Component Change Summary

### Modified Existing Files

| File | Change | Reason |
|------|--------|--------|
| `src/cli.ts` | Add 4 new CLI options to Commander; add `--only` filter; add preflight call; add `--dry-run` branch; thread `verbose`/`noCache` flags to constructors; fix exit codes in catch | Central wiring point for all flags |
| `src/runner/test-executor.ts` | Add `noCache?: boolean` and `onStepFinish?` to constructor options; guard `CacheManager.load()` with `noCache` check; pass `onStepFinish` into `executeAgentFn` | Owns cache-first decision + agent invocation |
| `src/agent/agent-runner.ts` | Add `onStepFinish?` to config parameter type; pass to `generateText` call | Vercel AI SDK step hook lives here |
| `src/cache/cache-manager.ts` | Add `normalizeKey()` static method; apply to `hashKey()` inputs | Only hash computation needs to change |
| `src/output/reporter.ts` | Add `verbose?: boolean` to constructor; add `onStepProgress()` method; handle `"dry-run"` source in `onTestComplete` | Output formatting for new modes |
| `src/output/types.ts` | Add `onStepProgress?(toolName: string, step: number): void` to `Reporter` interface | Keeps reporter interface consistent |
| `src/runner/types.ts` | Add `"dry-run"` to `TestSource` union OR add `dryRun?: boolean` to `TestResult` | Needed for dry-run result labeling |

### New Files

| File | Purpose |
|------|---------|
| `src/infra/preflight.ts` | `checkBaseUrl(url: string): Promise<void>` — fetch with timeout, throw `PreflightError` on failure |

### Unchanged Files

| File | Reason Unchanged |
|------|-----------------|
| `src/runner/test-runner.ts` | Accepts injected `executeFn` — dry-run uses a different `executeFn`, no change needed |
| `src/config/loader.ts` | Config loading is unaffected by DX flags |
| `src/config/schema.ts` | No new config fields (all flags are CLI-only, not YAML-config) |
| `src/cache/step-recorder.ts` | Step recording internals unchanged |
| `src/cache/step-replayer.ts` | Replay logic unchanged |
| `src/agent/mcp-manager.ts` | MCP lifecycle unchanged |
| `src/agent/model-factory.ts` | Provider/model creation unchanged |
| `src/agent/prompt.ts` | System prompt unchanged |
| `src/infra/process-manager.ts` | Process cleanup unchanged |
| `src/infra/signals.ts` | Signal handling unchanged |

---

## Data Flow Changes

### v0.2 CLI Startup Flow

```
User: superghost --config tests.yaml --only "login" --verbose --no-cache

cli.ts:
  1. Commander parses flags: { config, only: "login", verbose: true, noCache: true }
  2. loadConfig(options.config) → Config                  // unchanged
  3. config.tests = config.tests.filter(matchesOnly)      // NEW: --only filter
  4. await checkBaseUrl(config.baseUrl)                   // NEW: preflight
      → fetch(baseUrl, { signal: AbortSignal.timeout(5000) })
      → throws PreflightError → catch → stderr + exit(2)
      → resolves → continue
  5. inferProvider(), validateApiKey()                    // unchanged
  6. createModel()                                        // unchanged
  7. mcpManager.initialize()                              // unchanged (skipped for --dry-run)
  8. new CacheManager(...)                                // unchanged
  9. new StepReplayer(...)                                // unchanged
  10. new TestExecutor({ noCache: true, onStepFinish })   // MODIFIED: extra options
  11. new ConsoleReporter({ verbose: true })              // MODIFIED: extra option
  12. new TestRunner(config, reporter, executeFn)         // unchanged
  13. runner.run()
  14. exit(result.failed > 0 ? 1 : 0)
  catch ConfigLoadError → exit(2)                        // MODIFIED: was exit(1)
  catch PreflightError  → exit(2)                        // NEW
  catch "Missing API key" → exit(2)                      // MODIFIED: was exit(1)
  catch unknown → exit(2)                                // MODIFIED: was throw
```

### v0.2 Verbose Agent Execution Flow

```
TestExecutor.executeWithAgent(testCase, baseUrl, ...):
  executeAgentFn({
    ...,
    onStepFinish: (step) => reporter.onStepProgress(toolName, stepNum)  // NEW
  })

executeAgent(config):
  recorder = new StepRecorder()
  generateText({
    model, tools: wrappedTools, system, prompt, stopWhen, output,
    onStepFinish: (step) => {                                           // NEW
      for toolCall in step.toolCalls:
        config.onStepFinish?.({ toolName, stepNum })
    }
  })

ConsoleReporter.onStepProgress(toolName, stepNum):
  this.spinner?.update({ text: `${testName} [step ${stepNum}: ${toolName}]` })
```

### v0.2 Cache Key Normalization Flow

```
Before (v1.0):
  hashKey("  Log in to the app  ", "https://example.com")
  input = "  Log in to the app  |https://example.com"
  hash → "a1b2c3d4e5f60000"

After (v0.2):
  hashKey("  Log in to the app  ", "https://example.com")
  normalized = "Log in to the app|https://example.com"
  hash → "f9e8d7c6b5a40000"  ← different hash, consistent across whitespace variants
```

---

## Build Order

Dependencies between v0.2 features determine the correct implementation sequence:

**Phase 1 — No dependencies (build first, enables everything else):**

1. **Cache key normalization** (`cache/cache-manager.ts`)
   - Isolated static method change. No dependents need to change.
   - Can be shipped and tested independently with unit tests.

2. **Exit code fix** (`cli.ts` catch block only)
   - Mechanical change. No new types, no new modules.
   - Unblocks all features that need exit code 2 on failure.

**Phase 2 — New infrastructure (no inter-feature dependencies):**

3. **`infra/preflight.ts`** — new module, tested in isolation
4. **Preflight wiring in `cli.ts`** — requires `preflight.ts` from step 3

**Phase 3 — Flag threading (each flag is independent):**

5. **`--only <pattern>`** — `cli.ts` only, no downstream changes
   - Depends only on `loadConfig()` result being available (always true)

6. **`--no-cache`** — `cli.ts` + `TestExecutor` constructor option
   - Simple boolean passthrough; no new types needed

7. **`--dry-run`** — `cli.ts` branch + `runner/types.ts` + `output/reporter.ts`
   - Requires `TestSource` type extension before reporter changes

**Phase 4 — Verbose / step progress (most complex, depends on Phase 3):**

8. **`output/types.ts`** — add `onStepProgress?` to `Reporter` interface
9. **`output/reporter.ts`** — implement `onStepProgress`, add `verbose` constructor option
10. **`agent/agent-runner.ts`** — add `onStepFinish?` to config, wire into `generateText`
11. **`runner/test-executor.ts`** — thread `onStepFinish` from constructor through `executeAgentFn`
12. **`cli.ts` verbose wiring** — pass `verbose`/`onStepFinish` to reporter and executor

**Summary build order table:**

| Step | File | Feature | Depends On |
|------|------|---------|-----------|
| 1 | `cache/cache-manager.ts` | Cache normalization | nothing |
| 2 | `cli.ts` catch block | Exit codes 0/1/2 | nothing |
| 3 | `src/infra/preflight.ts` | Preflight (new file) | nothing |
| 4 | `cli.ts` preflight call | Preflight wiring | step 3 |
| 5 | `cli.ts` option + filter | `--only` flag | nothing |
| 6 | `cli.ts` + `test-executor.ts` | `--no-cache` flag | nothing |
| 7 | `runner/types.ts` | TestSource `"dry-run"` | nothing |
| 8 | `cli.ts` + `reporter.ts` | `--dry-run` flag | step 7 |
| 9 | `output/types.ts` | Reporter interface | nothing |
| 10 | `output/reporter.ts` | Verbose reporter | step 9 |
| 11 | `agent/agent-runner.ts` | `onStepFinish` hook | nothing |
| 12 | `runner/test-executor.ts` | Thread `onStepFinish` | step 11 |
| 13 | `cli.ts` verbose wiring | `--verbose` flag | steps 10, 12 |

---

## Architectural Patterns for v0.2

### Pattern: Flag Options Object Instead of Individual Parameters

As new flags accumulate, passing them individually into constructors becomes unwieldy. `TestExecutor` will need `noCache` and `onStepFinish`; `ConsoleReporter` needs `verbose`. Use an options object from the start:

```typescript
// Before (v1.0):
new TestExecutor({ cacheManager, replayer, executeAgentFn, model, tools, config, globalContext })

// After (v0.2) — extend the existing options object:
new TestExecutor({
  cacheManager, replayer, executeAgentFn, model, tools, config, globalContext,
  noCache?: boolean,
  onStepFinish?: (toolName: string, stepNumber: number) => void,
})
```

This avoids breaking changes to the constructor signature — all new options are optional with sensible defaults.

### Pattern: Runtime Options Separate from Config Schema

None of the new flags (`--dry-run`, `--verbose`, `--no-cache`, `--only`) belong in `config/schema.ts` (the YAML config). They are invocation-time options, not project-level configuration. Keep them CLI-only:

- `config/schema.ts` — unchanged
- `cli.ts` Commander options — where flags live
- Passed as constructor options into downstream modules

This means existing YAML config files are fully backward compatible with v0.2.

### Pattern: Thin `cli.ts` as Feature Aggregation Point

All five features touch `cli.ts`, but the actual logic lives in the modules closest to the concern:
- `--only` filtering: 3 lines in `cli.ts` (the filter itself is trivial)
- `--no-cache`: 1 option to Commander + 1 field in constructor call
- `--dry-run`: 8-10 lines in `cli.ts` (the entire branch)
- Preflight: delegated to `infra/preflight.ts`
- Exit codes: logic moved to explicit `instanceof` checks in catch

`cli.ts` remains a wiring file, not a logic file. New features add wiring, not business rules.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Adding CLI Flags to YAML Config Schema

**What people do:** Add `dry_run`, `verbose`, `no_cache` fields to `ConfigSchema` and `config/types.ts`.

**Why it's wrong:** Run-time invocation flags do not belong in project-level configuration files. This forces users to edit their YAML for every run mode, leaks CLI concerns into the config module, and makes config files harder to share across team members with different preferences.

**Do this instead:** CLI flags stay in Commander options in `cli.ts`. Config schema stays for project-level settings (browser type, model, baseUrl, timeout, etc.).

### Anti-Pattern 2: Implementing Verbose Output by Logging Inside Agent Modules

**What people do:** Add `console.log("[step]", toolName)` directly inside `executeAgent` or `StepRecorder.wrapTools()`.

**Why it's wrong:** Hard-codes output to stdout regardless of verbose flag, bypasses the `Reporter` abstraction, makes output untestable, and breaks non-TTY (CI) output modes.

**Do this instead:** Route step progress through `Reporter.onStepProgress()`. The reporter already handles TTY detection (via picocolors + nanospinner). Verbose output is a presentation concern.

### Anti-Pattern 3: Preflight Check Inside TestRunner

**What people do:** Add `await this.checkBaseUrl()` at the top of `TestRunner.run()`.

**Why it's wrong:** Preflight failure should exit with code 2 before MCP servers are even spawned. Putting it in `TestRunner` means MCP startup already happened. Also, `TestRunner` should own test iteration, not infrastructure health checks.

**Do this instead:** Preflight in `cli.ts`, before `mcpManager.initialize()`. It's a startup concern in the same category as `validateApiKey()`.

### Anti-Pattern 4: Per-Test Preflight Checks

**What people do:** Check reachability before every test case to handle the case where the server goes down mid-run.

**Why it's wrong:** Adds 5s overhead per test. Mid-run failures already surface as test failures (AI agent can't navigate to baseUrl, test fails). The preflight is a startup sanity check, not a runtime health monitor.

**Do this instead:** Single preflight at startup, checking only `config.baseUrl`. Per-test `baseUrl` overrides are user-controlled and can fail as test failures.

---

## Integration Points

### Internal Boundaries (v0.2 Changes)

| Boundary | v1.0 Communication | v0.2 Change |
|----------|-------------------|-------------|
| `cli.ts` → `TestExecutor` | Constructor options object | Add `noCache`, `onStepFinish` fields |
| `cli.ts` → `ConsoleReporter` | No options (simple constructor) | Add `verbose` option |
| `cli.ts` → `TestRunner` | Injected `executeFn` | Dry-run replaces `executeFn` with stub |
| `TestExecutor` → `executeAgent` | Config object | Add `onStepFinish?` callback field |
| `executeAgent` → `generateText` | Direct call | Add `onStepFinish` Vercel AI SDK callback |
| `cli.ts` → `infra/preflight.ts` | (new) | Direct function call, throws `PreflightError` |

### Exit Code Contract

| Code | Condition | Where Set |
|------|-----------|-----------|
| `0` | All tests passed | `cli.ts` success path: `result.failed > 0 ? 1 : 0` |
| `1` | One or more tests failed | `cli.ts` success path: `result.failed > 0 ? 1 : 0` |
| `2` | Config error, missing API key, preflight failure, runtime error | `cli.ts` catch block |

---

## Sources

- Vercel AI SDK `generateText` `onStepFinish` callback: https://sdk.vercel.ai/docs/ai-sdk-core/generating-text (HIGH confidence — confirmed in official docs, parameter is `onStepFinish: (step: StepResult) => void`)
- SuperGhost v1.0 source: direct inspection of `src/` (HIGH confidence)
- Bun `fetch` with `AbortSignal.timeout`: https://bun.sh/docs/api/fetch (HIGH confidence — Bun supports Web API `AbortSignal.timeout()`)

---

*Architecture research for: SuperGhost v0.2 DX feature integration*
*Researched: 2026-03-11*
