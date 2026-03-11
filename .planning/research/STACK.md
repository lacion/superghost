# Stack Research

**Domain:** AI-powered E2E browser testing CLI tool
**Researched:** 2026-03-11 (updated for v0.2 DX features)
**Confidence:** HIGH — all versions verified against npm and official docs as of today

---

## v0.2 Stack Additions

These are the *only new additions* required for the DX Polish + Reliability Hardening milestone. The existing v1.0 stack (Bun, Commander.js, Zod, nanospinner, picocolors, Vercel AI SDK, Playwright MCP) is unchanged.

### New Libraries Needed

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `picomatch` | ^4.0.3 | Pattern matching for `--only <pattern>` test filter | Zero dependencies, no-install footprint, fastest glob matcher available (4.4M ops/sec vs minimatch's 630K). Used by Jest, Astro, Rollup, chokidar, fast-glob. Pure JS so Bun-native. API: `isMatch(testName, pattern)` — one function call. |
| `@types/picomatch` | ^4.0.2 | TypeScript types for picomatch | picomatch ships no bundled types; DefinitelyTyped provides them. Active maintenance confirmed (updated July 2025). |

### No Other New Dependencies

Every other v0.2 feature is implementable with what's already installed:

| Feature | Approach | Uses |
|---------|---------|------|
| `--dry-run`, `--verbose`, `--no-cache` flags | Commander.js `.option()` — already in codebase | `commander@14.0.3` (existing) |
| `--only <pattern>` flag | Commander.js `.option('-o, --only <pattern>', ...)` + picomatch | `commander@14.0.3` + new `picomatch` |
| Preflight `baseUrl` reachability check | Bun-native `fetch()` with `AbortSignal.timeout()` | Bun built-in (no new dep) |
| Real-time step progress text | `nanospinner`'s `.update({ text })` method — already installed | `nanospinner@1.2.2` (existing) |
| Distinct exit codes (0/1/2) | `process.exitCode` assignment + `Commander.program.error()` | Bun built-in + `commander` (existing) |
| Cache key normalization | Normalize string before `Bun.CryptoHasher` hashing | Bun built-in (no new dep) |

---

## Commander.js Patterns for v0.2 Flags

All flags wire directly into the existing `program` definition in `src/cli.ts`. Commander.js 14 already in use — no API changes needed.

### Boolean flags

```typescript
program
  .option('--dry-run', 'Preview which tests would run without executing them')
  .option('--verbose', 'Show detailed step output during AI execution')
  .option('--no-cache', 'Bypass cache — force AI re-execution for all tests')
```

`--no-cache` uses Commander's built-in negatable option convention: defining `--no-cache` automatically sets `options.cache = false` when passed (Commander infers the positive default as `true`). No extra logic needed.

### Option with string argument

```typescript
program
  .option('--only <pattern>', 'Run only tests whose names match the glob pattern')
```

Accessed as `options.only` (string | undefined) in the `.action()` handler.

### Exit codes with Commander

```typescript
// Config/runtime errors → exit 2
program.error('Config error: ' + message, { exitCode: 2 })

// Test failures → exit 1 (already implemented)
// All pass → exit 0 (already implemented)
```

`program.error()` is the correct Commander.js API for emitting errors with custom exit codes. Confirmed in Commander.js docs: `program.error(message, { exitCode: 2, code: 'superghost.config.error' })`.

---

## picomatch Integration Pattern

```typescript
import { isMatch } from 'picomatch'

// In test-runner.ts, filter tests before executing
const testsToRun = options.only
  ? config.tests.filter(t => isMatch(t.name, options.only!))
  : config.tests

if (testsToRun.length === 0) {
  program.error(`No tests matched pattern: ${options.only}`, { exitCode: 2 })
}
```

`isMatch(string, pattern)` returns `boolean`. Pattern supports `*` (single segment), `**` (any depth), `?` (single char), and `{a,b}` alternation — sufficient for test name filtering.

---

## Preflight baseUrl Check Pattern

No new dependency. Use Bun-native `fetch()` with `AbortSignal.timeout()`:

```typescript
async function checkBaseUrlReachable(url: string, timeoutMs = 5000): Promise<void> {
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(timeoutMs),
    })
    // Accept any HTTP response (even 404) — we only care the server is reachable
    // A 404 from a live server is still reachable
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      program.error(`baseUrl unreachable (timeout after ${timeoutMs}ms): ${url}`, { exitCode: 2 })
    }
    program.error(`baseUrl unreachable: ${url} — ${(err as Error).message}`, { exitCode: 2 })
  }
}
```

`AbortSignal.timeout()` is a standard Web API — fully supported in Bun. No `axios`, no `got`, no `node-fetch`.

---

## Real-Time Step Progress

`nanospinner@1.2.2` already installed. The `.update({ text })` method on the running spinner is the correct API:

```typescript
// In agent-runner.ts or wherever step callbacks fire
spinner.update({ text: `[${stepIndex}/${totalSteps}] ${stepDescription}` })
```

The `.update()` call accepts the same options as `createSpinner()` — text, color, frames, interval. No spinner restart needed. This directly addresses the "real-time step progress output during AI execution" feature without adding any library.

---

## Cache Key Normalization

No new dependency. Normalize the test case string before hashing:

```typescript
// In cache-manager.ts, update hashKey()
static hashKey(testCase: string, baseUrl: string): string {
  // Normalize: collapse whitespace, trim, lowercase for consistent keys
  const normalizedCase = testCase.replace(/\s+/g, ' ').trim().toLowerCase()
  const normalizedUrl = baseUrl.trim().toLowerCase()
  const input = `${normalizedCase}|${normalizedUrl}`
  const hasher = new Bun.CryptoHasher('sha256')
  hasher.update(input)
  return hasher.digest('hex').slice(0, 16)
}
```

Pure string normalization — no library, no new Bun API. Breaking change: existing caches will produce different hashes. Document as cache-invalidating change in v0.2 release notes.

---

## Installation

```bash
# Single new production dependency for --only pattern matching
bun add picomatch

# TypeScript types for picomatch (dev dependency)
bun add -D @types/picomatch
```

That's it. All other v0.2 features use existing dependencies or Bun built-ins.

---

## Recommended Stack (Full, v0.2)

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Bun | >=1.2.0 | Runtime, package manager, test runner, bundler, binary compiler | Native TypeScript execution without transpilation. `bun build --compile` produces standalone binaries. Anthropic ships Claude Code as a Bun binary. `AbortSignal.timeout()` and `Bun.CryptoHasher` are built-in — no extra deps for preflight checks or hashing. |
| TypeScript | 5.x (via Bun) | Language | Strict mode; Bun runs `.ts` directly. Type-safe APIs with Zod catch config errors early. |
| Vercel AI SDK (`ai`) | 6.0.116 | LLM orchestration, agentic tool loops | SDK 6 ships stable `generateText` with `stopWhen`/`stepCountIs`. Single unified API across all providers. |
| Commander.js | 14.0.3 | CLI argument parsing | 118K+ dependents. `--no-cache` negatable option, `--only <pattern>` string option, and `program.error(msg, { exitCode: 2 })` for config errors all supported natively. |
| Zod | 4.3.6 | YAML config schema validation | v4 is 14x faster than v3. First-class TypeScript inference from schema. |
| `yaml` | 2.8.2 | YAML file parsing | Canonical YAML parser. No dependencies, ships own types. |
| `nanospinner` | 1.2.2 | Terminal spinner + real-time progress text | `.update({ text })` API allows dynamic step progress updates without restarting spinner. Auto-disables in non-TTY CI environments. |
| `picocolors` | 1.1.1 | Terminal color output | 3x smaller than chalk. No configuration needed — colors auto-disabled in non-TTY. |
| `picomatch` | ^4.0.3 | Glob pattern matching for `--only` flag | Zero dependencies, fastest JS glob (v0.2 addition). Used by Jest, Rollup, chokidar. |

### Provider Packages (unchanged from v1.0)

| Package | Version | Provider |
|---------|---------|---------|
| `@ai-sdk/anthropic` | ^3.0.58 | Anthropic (Claude) — default |
| `@ai-sdk/openai` | ^3.0.41 | OpenAI (GPT-4o, o3) |
| `@ai-sdk/google` | ^3.0.37 | Google Gemini |
| `@openrouter/ai-sdk-provider` | ^2.2.5 | OpenRouter (300+ models) |

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `picomatch` | `minimatch@10.x` | minimatch has active CVEs (CVE-2026-26996, a ReDoS via repeated wildcards). picomatch is 7x faster and zero-dep. For simple CLI test name filtering, picomatch is the correct level of tool. |
| `picomatch` | `micromatch@4.x` | micromatch wraps picomatch and adds brace expansion. For CLI test name matching we don't need file system operations or brace expansion. picomatch directly is the minimal, correct choice. |
| `picomatch` | Custom `RegExp` | Manual regex from user glob patterns is error-prone and a security risk (ReDoS). Use a battle-tested library. |
| Bun built-in `fetch()` | `axios`, `got`, `node-fetch` | Zero reason to add an HTTP client library for a single reachability check. Bun's `fetch` + `AbortSignal.timeout()` is standard, fast, and already available. |
| `nanospinner.update()` | `ora` (new dep) | `nanospinner` is already installed and has the `.update()` API needed. Adding `ora` would be redundant. |
| `commander.error()` with `exitCode` | Manual `process.exit(2)` | `program.error()` is the Commander.js-idiomatic way to emit errors with custom exit codes and lets tests override exit behavior. Prefer it over raw `process.exit()`. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `minimatch` | Has active ReDoS CVEs in 2026 (CVE-2026-26996, CVE-2026-27903, CVE-2026-27904). Slower (630K ops/sec) than picomatch (4.4M ops/sec). | `picomatch@^4.0.3` |
| `axios` / `got` for preflight check | These are HTTP client libraries. The preflight check is a single `fetch()` call with a timeout — Bun handles this natively. Adding an HTTP client for this is over-engineering. | `fetch()` with `AbortSignal.timeout()` |
| `glob` package | Designed for file system glob matching, not string matching. Overkill for matching test names against a CLI pattern. | `picomatch.isMatch()` |
| `dotenv` for env var loading | Bun 1.1.5+ loads `.env` automatically. No `dotenv` needed. | Bun built-in |

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `picomatch@4.0.3` | Bun 1.2+ | Pure JS, zero deps, ESM — works natively in Bun. |
| `@types/picomatch@4.0.2` | `picomatch@4.x` | Types updated July 2025 for picomatch 4.x API. |
| `commander@14.x` | Bun 1.2+ | Pure JS/TS, no native deps. Confirmed compatible. |
| `nanospinner@1.2.2` | Bun 1.2+ | Already shipping in v1.0, confirmed working. |
| `ai@6.x` | `@ai-sdk/mcp@1.x` | Both part of AI SDK v6 release train. Upgrade together. |
| `zod@4.x` | `ai@6.x` | AI SDK 6 supports Zod 4's Standard JSON Schema interface. |

---

## Sources

- [picomatch npm](https://www.npmjs.com/package/picomatch) — version 4.0.3 confirmed, zero dependencies, no bundled types
- [@types/picomatch npm](https://www.npmjs.com/package/@types/picomatch) — version 4.0.2, last updated July 2025
- [picomatch GitHub README](https://github.com/micromatch/picomatch) — `isMatch()` API, performance benchmarks
- [minimatch CVE-2026-26996](https://github.com/advisories/GHSA-3ppc-4f35-3m26) — ReDoS via repeated wildcards confirmed active
- [minimatch npm issues](https://github.com/npm/cli/issues/9037) — CVE-2026-27903, CVE-2026-27904 in minimatch 10.2.2
- [micromatch npm](https://www.npmjs.com/package/micromatch) — version 4.0.8, wraps picomatch, heavier than needed
- [nanospinner GitHub](https://github.com/usmanyunusov/nanospinner) — `.update({ text })` API confirmed for dynamic text updates, v1.2.2
- [Commander.js GitHub](https://github.com/tj/commander.js) — `program.error(msg, { exitCode })` API, negatable `--no-` options, string argument `<pattern>` syntax
- [Bun fetch docs](https://bun.com/docs/runtime/networking/fetch) — `AbortSignal.timeout()` support confirmed, HEAD request pattern

---

*Stack research for: SuperGhost v0.2 — DX Polish + Reliability Hardening*
*Researched: 2026-03-11*
