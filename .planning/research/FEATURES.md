# Feature Research

**Domain:** AI-powered E2E browser + API testing CLI tool — DX Polish (v0.2)
**Researched:** 2026-03-11
**Confidence:** HIGH (competitor CLIs inspected via official docs; existing codebase read directly; UX conventions verified across Jest, Vitest, Playwright, Cypress)

---

## Context: What This File Is

This FEATURES.md is an **addendum** for the v0.2 milestone. v1.0 features are already implemented and documented in the previous research file. This file focuses exclusively on the five DX polish features in the current milestone:

1. CLI flags: `--dry-run`, `--verbose`, `--no-cache`, `--only <pattern>`
2. Preflight `baseUrl` reachability check
3. Real-time step progress output during AI execution
4. Distinct exit codes: 0 = pass, 1 = test failure, 2 = config/runtime error
5. Cache key normalization (whitespace/formatting-insensitive)

---

## Feature Landscape

### Table Stakes (Users Expect These)

These are UX behaviors users of CLI testing tools take for granted. Absence makes SuperGhost feel like a prototype.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| `--dry-run` flag (list tests, no execution) | Every serious test CLI has a way to preview what will run without running it. Jest `--listTests`, Playwright `--list`, Vitest `vitest list` all do this. Users expect it for large suites or pipeline debugging. | LOW | Output: numbered list of test names + their type (browser/api). No MCP spawn, no AI call, no cache read. Exit code 0. Works with `--only` filter. |
| `--verbose` flag (detailed step-level output) | Debugging a failing AI test with only a spinner + final result is opaque. Users need to see what the AI is doing. Playwright `--reporter=verbose`, Jest `--verbose`, Vitest `--reporter=verbose` all increase output fidelity. | MEDIUM | In verbose mode: print each MCP tool call as it happens (tool name + truncated args), print AI model, print cache hit/miss before each test, print full error trace on failure. nanospinner already present — falls back to plain-text line-per-step in verbose mode (spinners conflict with multi-line output). |
| `--no-cache` flag (bypass all cache) | Docker `docker build --no-cache`, npm `npm ci --no-cache`, Turborepo `--no-cache` — the convention is universal. Users expect this for debugging stale behavior or forcing a fresh AI run. | LOW | Skip `CacheManager.load()` entirely; do not skip `CacheManager.save()` after successful AI run (so the next run re-populates cache). This distinction matters: `--no-cache` means "don't read from cache this run," not "never cache again." |
| `--only <pattern>` filter (subset of tests) | Jest `-t "pattern"`, Playwright `--grep pattern`, Vitest `-t pattern` — all use a pattern (string or regex) to select which tests run. Users with 20+ tests need this to iterate on one failing test. | LOW | Pattern matches against `test.name` (the display name field in YAML). Substring match is sufficient — no need for full regex unless users request it. Print "Skipping X tests (--only filter)" before running. Exit code 2 if pattern matches zero tests (misconfiguration, not test failure). |
| Preflight `baseUrl` reachability check | Playwright's `webServer` config pings baseUrl before starting tests. Cypress recommends `wait-on` in CI. Users expect the tool to fail fast with a clear error if the server is down, rather than spending 10+ seconds on AI calls that all fail with connection errors. | LOW | HTTP GET with short timeout (5s). Check once before any tests start. If unreachable: print actionable error (`baseUrl https://... is not reachable — is your server running?`), exit code 2. Skip check if no `baseUrl` configured. |
| Real-time progress during AI execution | The existing spinner only shows test name. For a 30-second AI run, there is no feedback on what the agent is doing. Playwright shows each step in verbose mode; Vitest shows assertions as they pass. Users feel anxious watching a static spinner for 30s. | MEDIUM | Print each tool call as it happens (before result): `  > navigate(url=...)`, `  > snapshot()`, `  > click(...)`. Requires hooking into the agent's tool execution callback. The Vercel AI SDK `onStepFinish` callback is the right integration point. |
| Distinct exit code for config errors | POSIX convention: exit 2 = bad usage/invalid arguments. Bash itself uses exit 2. curl uses exit 2 for init failures. Tools that use exit 1 for both test failures and config errors make CI pipelines impossible to instrument (you can't distinguish "tests failed, re-run" from "your pipeline is broken"). | LOW | Currently: `ConfigLoadError` → exit 1. Missing API key → exit 1. Same code as test failure. Change: all pre-execution failures (config load error, missing API key, zero tests matched by filter, baseUrl unreachable) → exit 2. Test failures remain exit 1. |
| Cache key normalization | A test case written as `"  Check that login  works "` should hit the same cache as `"Check that login works"`. Whitespace differences from copy-paste or editor formatting causing cache misses is a paper-cut that erodes trust. | LOW | Normalize cache key input: `testCase.trim().replace(/\s+/g, ' ')` before hashing. Apply same normalization to `baseUrl` (trim only). Update `CacheManager.hashKey()`. Existing cache entries are compatible if normalized — no migration needed for new entries. |

---

### Differentiators (Competitive Advantage)

Features that are not universal expectations but give SuperGhost a better UX than competitors in specific scenarios.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `--dry-run` combined with `--only` filter | Playwright and Jest support these independently but their interaction is not always well-defined. SuperGhost's dry-run should respect `--only` — show exactly what would run given the current filter. | LOW | Compose naturally: filter tests by pattern first, then list. Prevents "I thought --only would run 3 tests" surprises. |
| Verbose mode that falls back gracefully in non-TTY | Tools like Jest use raw `console.log` in non-TTY (CI pipes). SuperGhost should detect non-TTY and emit clean, structured lines (no ANSI codes via picocolors auto-disable, no spinner via nanospinner auto-disable). Verbose mode in CI should produce parseable per-step lines. | LOW | Already handled: picocolors disables ANSI when stdout is not a TTY. nanospinner disables animation in non-TTY. The verbose output lines just need to be `console.log` calls. |
| Preflight error that names the test it would have blocked | Rather than just "baseUrl is unreachable," list which tests were going to use that baseUrl. Helps users understand scope of failure in suites with mixed baseUrls. | MEDIUM | Only worth doing if per-test baseUrl overrides exist (they do — schema supports `test.baseUrl`). Check per-test baseUrls too, not just global. Report unique set of unreachable URLs with count of tests affected. |
| `--no-cache` re-populates cache after fresh AI run | Most tools treat `--no-cache` as "this run is ephemeral." SuperGhost's cache is a long-term test maintenance artifact. Refreshing it on `--no-cache` runs is correct behavior — you want the cache accurate after a forced fresh run. | LOW | This is an opinionated distinction from Docker/npm. Make it explicit in CLI help text: "Skips reading cache; still writes on success." |
| Exit code 2 for zero test matches on `--only` | Jest exits 0 if no tests match a pattern (produces a warning). Playwright exits 0 if `--grep` matches nothing. This is silently wrong in CI — your filter regex has a typo and no tests run, pipeline goes green. SuperGhost should exit 2. | LOW | Check: if `--only` is specified and matched tests array is empty → exit 2 with error message. This is the right behavior that tools like Jest get wrong. |

---

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem like natural next steps for this milestone but should be deferred or avoided.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| `--watch` mode | "Re-run tests on config change." | Watch mode requires a file watcher loop, signal handling for restart, TTY manipulation for re-draw. This is a separate feature of similar complexity to this entire milestone. | v2 milestone. Use `nodemon --exec "superghost --config tests.yaml"` as a workaround in the meantime. |
| `--bail` / fail-fast after N failures | Jest `--bail`, Playwright `--max-failures`. Users with 50 tests don't want to wait for all failures. | Bail logic interacts badly with cache — a bailed run leaves the cache partially populated. For a 5-feature DX milestone, bail adds cross-cutting complexity to the runner. | Sequential execution already fails fast implicitly (each test blocks the next). For now, exit 1 after all tests run. |
| JSON/JUnit output mode (`--output json`) | CI reporting, piping to dashboards. | JSON output is a reporter refactor, not a DX flag. It changes the output contract for all consumers. The current human-readable format already has CI-useful exit codes. | Defer to a "reporting" milestone. The summary box output is already parseable for humans. |
| Full regex matching for `--only` | "I want complex test selection with lookaheads." | Regex in CLI args causes shell quoting hell. Most users want substring match, not regex. Jest uses `--testNamePattern` with regex but it's frequently misused (users forget to escape). | Substring match covers 95% of use cases. Document clearly. If regex is needed, users can quote patterns appropriately since JavaScript `String.includes()` is the default. |
| `--clear-cache` as a separate flag | "I want to delete all cached test results." | This is a destructive operation on what may be committed CI artifacts. It's better as a one-time `rm -rf .superghost-cache/` than a built-in flag that could accidentally nuke a shared cache. | Documented in README. `--no-cache` covers the "force fresh run" use case without deleting files. |
| Preflight check for API test endpoints | "Check if each API baseUrl is reachable." | API tests may use dynamic endpoints or may test error states (intentionally unreachable endpoints). A preflight check on API test URLs would produce false positives. | Only preflight-check `config.baseUrl` (global browser test base). Let per-test API failures surface as test failures with clear error messages. |
| Token/cost tracking in verbose output | "Show how many tokens this run used." | Requires Vercel AI SDK usage tracking per `generateText` call, plus per-provider cost tables that drift over time. This is a full "observability" feature, not a DX polish item. | Defer. Track `usage.totalTokens` from `generateText` result and surface it post-v0.2. |

---

## Feature Dependencies

```
[--dry-run flag]
    └──requires──> [config loader] (must parse YAML to list test names)
    └──enhances──> [--only filter] (dry-run respects filter, shows what would run)
    └──conflicts──> [MCP spawn] (dry-run must NOT start Playwright MCP)

[--only <pattern> filter]
    └──requires──> [config loader] (needs test list to filter)
    └──enhances──> [TestRunner.run()] (runner skips non-matching tests)
    └──enhances──> [--dry-run] (filter applied before listing)

[--no-cache flag]
    └──requires──> [CacheManager] (bypasses CacheManager.load(), keeps CacheManager.save())
    └──conflicts──> [--dry-run] (dry-run never reads cache either, but for different reason)

[--verbose flag]
    └──requires──> [agent step hooks] (needs onStepStart/onStepFinish callbacks from agent-runner)
    └──enhances──> [ConsoleReporter] (adds per-step lines between spinner events)
    └──conflicts──> [nanospinner] (spinner animation must be suppressed in verbose mode — multi-line output breaks spinner redraw)

[Preflight baseUrl check]
    └──requires──> [config loader] (needs baseUrl from config before running)
    └──requires──> [--dry-run exclusion] (preflight should NOT run in dry-run mode)
    └──enhances──> [exit code 2] (unreachable baseUrl is a config/runtime error, not a test failure)

[Real-time step progress]
    └──requires──> [agent-runner onStepFinish hook] (needs callback from executeAgent)
    └──requires──> [--verbose flag] (only visible in verbose mode; default mode keeps spinner-only)
    └──enhances──> [ConsoleReporter] (reporter needs a new onStepComplete(step) method)

[Exit code 2 for config errors]
    └──requires──> [ConfigLoadError distinction] (already thrown, needs different exit path)
    └──enhances──> [preflight check] (unreachable URL exits 2, not 1)
    └──enhances──> [--only with zero matches] (zero match is exit 2)

[Cache key normalization]
    └──requires──> [CacheManager.hashKey()] (normalize input before hashing)
    └──no conflicts] (pure function change; cache entries with old keys become orphaned but not incorrect)
```

### Dependency Notes

- **`--verbose` conflicts with nanospinner:** The current `ConsoleReporter` uses nanospinner for a per-test spinner. Spinners work by overwriting the current terminal line. If verbose mode prints multiple lines per test, the spinner will corrupt the output. Solution: when `--verbose` is active, skip spinner creation and use `console.log` with a prefix symbol instead.

- **Real-time step progress requires agent hook:** The `executeAgent` function in `agent-runner.ts` currently runs a full `generateText` call. To emit per-step output, the `onStepFinish` callback in Vercel AI SDK must be used. This callback fires after each AI "step" (tool call + result cycle). The callback signature is `onStepFinish({ toolCalls, toolResults })`.

- **Preflight must not run in dry-run mode:** `--dry-run` is supposed to be safe to run without a server. Preflight check must be conditional on actual execution mode.

- **`--only` zero-match → exit 2, not 1:** This is counterintuitive (it feels like "nothing failed"), but exit 2 is correct because it signals a usage/configuration error — the user passed a pattern that matches nothing, which is almost certainly a mistake. Exit 1 reserved for actual test failures.

- **Cache key normalization is non-breaking:** Existing cache files are keyed by the old (non-normalized) hash. When normalization is applied, old keys become unreachable. The effect is a one-time cold start for any test whose key changes. Self-healing handles this transparently — the AI re-runs and saves under the new normalized key.

---

## v0.2 Milestone Scope

### Build Now (v0.2)

These are the five feature areas in the current milestone. All are LOW–MEDIUM complexity and compose cleanly with the existing architecture.

- [ ] `--dry-run` flag — List tests that would run, exit 0. Works with `--only`. Does NOT start MCP, does NOT read cache.
- [ ] `--verbose` flag — Per-step tool call output during AI execution. Suppresses nanospinner. Uses `onStepFinish` callback from Vercel AI SDK.
- [ ] `--no-cache` flag — Bypasses `CacheManager.load()`, keeps `CacheManager.save()`. Self-documents: "skips reading cache; still writes on success."
- [ ] `--only <pattern>` filter — Substring match on `test.name`. Exit 2 if no tests match. Print skipped-test count at run start.
- [ ] Preflight `baseUrl` HTTP check — GET request with 5s timeout before any test runs. Exit 2 if unreachable. Skip in `--dry-run` mode. Check per-test baseUrls that differ from global.
- [ ] Real-time step progress — Print `  > toolName(truncated_args)` for each AI step. Gated on `--verbose`. Integrated via `onStepFinish` in agent-runner.
- [ ] Exit codes 0/1/2 — 0 = all pass, 1 = any test fails, 2 = config error / missing API key / unreachable baseUrl / zero tests matched by filter.
- [ ] Cache key normalization — `testCase.trim().replace(/\s+/g, ' ')` before SHA-256 hash in `CacheManager.hashKey()`.

### Defer to Later Milestones

- [ ] `--watch` mode — v3 or later (separate feature of comparable complexity to v0.2)
- [ ] `--bail` / fail-fast — v0.3 or later (cross-cuts runner + cache lifecycle)
- [ ] JSON/JUnit output — "Reporting" milestone (reporter refactor)
- [ ] Token/cost tracking — "Observability" milestone

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Exit codes 0/1/2 | HIGH | LOW | P1 — changes 3 lines in cli.ts |
| Cache key normalization | MEDIUM | LOW | P1 — changes 1 function in cache-manager.ts |
| `--no-cache` flag | HIGH | LOW | P1 — one boolean in TestExecutor.execute() |
| `--only <pattern>` filter | HIGH | LOW | P1 — filter before TestRunner.run() |
| `--dry-run` flag | HIGH | LOW | P1 — list tests and exit before MCP spawn |
| Preflight `baseUrl` check | HIGH | LOW | P1 — single HTTP GET before test loop |
| Real-time step progress | MEDIUM | MEDIUM | P2 — requires agent hook integration |
| `--verbose` with suppressed spinner | MEDIUM | MEDIUM | P2 — reporter mode switch + verbose lines |

**Priority key:**
- P1: Implement first, independent of other P1 features
- P2: Implement after P1 features are wired; depends on P1 reporter and agent hook work

---

## Competitor CLI Behavior Reference

This table documents the exact behaviors used as reference for SuperGhost's v0.2 DX conventions. These are verified against official documentation.

| Behavior | Jest | Playwright | Vitest | Cypress | SuperGhost v0.2 |
|----------|------|------------|--------|---------|-----------------|
| Dry-run / list | `--listTests` (file names only, exits 0) | `--list` (test names + file, exits 0) | `vitest list` (test names, exits 0) | No built-in | `--dry-run`: test names + type, exits 0 |
| Verbose output | `--verbose` (full test tree hierarchy) | `--reporter=verbose` (per-test steps) | `--reporter=verbose` (per-test output) | No `--verbose`; use `--reporter` | `--verbose`: per-step AI tool calls |
| Test filtering | `-t "pattern"` (regex on test name) | `--grep pattern` (regex) | `-t pattern` (regex) | `--spec glob` (file-level) | `--only pattern` (substring on test.name) |
| Cache bypass | N/A (Jest has no step cache) | N/A | N/A | N/A | `--no-cache` (skip read, keep write) |
| Exit: all pass | 0 | 0 | 0 | 0 | 0 |
| Exit: test failure | 1 | 1 | 1 | N (number of failures, or 1 with `--posix-exit-codes`) | 1 |
| Exit: config error | 1 (same as test failure) | 1 | 1 | 1 | **2** (distinct from test failure) |
| Exit: no tests match filter | 0 (warning printed) | 0 | 0 | 1 | **2** (explicit misconfiguration signal) |
| Server/preflight check | No | `webServer` option with ping-until-ready | No | `wait-on` pattern (external) | Preflight GET before test loop |
| Progress during execution | Spinner per test | Step counter per test | Progress bar | Per-test spinner | Per-step tool calls in verbose mode |
| Non-TTY output | Plain text, no spinner | Plain text | Plain text | Plain text | Auto-detected via picocolors/nanospinner |

**Key divergence from convention:** SuperGhost uses `--only` instead of `--grep`/`-t` because:
1. SuperGhost test "names" are human-written display names, not function-call identifiers. Substring match (`includes`) is more appropriate than regex for natural-language names.
2. `--grep` implies regex, which causes shell quoting friction. `--only` is explicit about its purpose.
3. If users need regex they can always write a regex that works as a substring match (e.g., `--only "login"`).

**Key divergence from convention:** Exit code 2 for zero-match `--only` filter. Jest and Playwright exit 0 for empty filter results. This is a known footgun — green pipelines when your filter typo matches nothing. SuperGhost takes the stricter, more correct position.

---

## Implementation Notes for Roadmap

### cli.ts Changes (Low Risk)

`cli.ts` is the integration point for all five flags. The Commander.js program definition gets four new options:
- `.option('--dry-run', 'List tests without executing')`
- `.option('--verbose', 'Show AI step-level output during execution')`
- `.option('--no-cache', 'Skip cache reads (still writes on AI success)')`
- `.option('--only <pattern>', 'Only run tests matching pattern (substring)')`

The options object propagates through to TestRunner and TestExecutor.

### Agent Hook Integration (MEDIUM Risk)

`agent-runner.ts` calls `generateText` from Vercel AI SDK. The `onStepFinish` callback is the correct hook for per-step progress. The callback receives `{ toolCalls: ToolCall[], toolResults: ToolResult[], stepType }`. This needs to be passed into `executeAgent` as an optional callback.

Signature change: `executeAgent(config: { ..., onStepFinish?: (step: StepInfo) => void })`

ConsoleReporter gets a new optional method: `onAgentStep(testName: string, toolName: string, truncatedArgs: string): void`

### Exit Code Changes (Low Risk)

Current: `process.exit(1)` for both test failures and config errors.

Change: introduce an `ExitCode` enum or constants:
```typescript
const EXIT = { PASS: 0, TEST_FAIL: 1, ERROR: 2 } as const;
```

Apply `EXIT.ERROR` to: `ConfigLoadError`, missing API key, baseUrl unreachable, zero tests matched by `--only`.

Apply `EXIT.TEST_FAIL` to: `result.failed > 0`.

### Cache Manager Change (Low Risk)

One-line change in `CacheManager.hashKey()`:
```typescript
static hashKey(testCase: string, baseUrl: string): string {
  const normalizedCase = testCase.trim().replace(/\s+/g, ' ');
  const normalizedUrl = baseUrl.trim();
  const input = `${normalizedCase}|${normalizedUrl}`;
  // ... rest unchanged
}
```

---

## Sources

- [Jest CLI Options (official)](https://jestjs.io/docs/cli) — `--listTests`, `--verbose`, `--testNamePattern`, exit codes
- [Playwright CLI reference (official)](https://playwright.dev/docs/test-cli) — `--list`, `--grep`, `--dry-run`, `--reporter`
- [Vitest CLI reference (official)](https://vitest.dev/guide/cli) — `vitest list`, `--reporter=verbose`, `-t pattern`
- [Cypress CLI reference (official)](https://docs.cypress.io/app/references/command-line) — `--spec`, exit codes (0, n failures, 1), `--posix-exit-codes`
- [Evil Martians CLI UX best practices](https://evilmartians.com/chronicles/cli-ux-best-practices-3-patterns-for-improving-progress-displays) — spinner vs X-of-Y vs progress bar; TTY-compatible output
- [POSIX exit code conventions](https://www.gnu.org/s/libc/manual/html_node/Exit-Status.html) — 0 = success, 1 = failure, 2 = usage error
- [Playwright webServer preflight behavior](https://playwright.dev/docs/test-webserver) — ping-until-ready pattern before test start
- [nanospinner (npm)](https://www.npmjs.com/package/nanospinner) — already in use; auto-disables in non-TTY
- [picocolors (npm)](https://www.npmjs.com/package/picocolors) — already in use; auto-disables ANSI in non-TTY
- Existing codebase: `src/cli.ts`, `src/output/reporter.ts`, `src/runner/test-runner.ts`, `src/cache/cache-manager.ts`, `src/runner/test-executor.ts`

---

*Feature research for: SuperGhost v0.2 DX Polish + Reliability Hardening*
*Researched: 2026-03-11*
