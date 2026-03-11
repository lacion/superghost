# Project Research Summary

**Project:** SuperGhost v0.2 — DX Polish + Reliability Hardening
**Domain:** AI-powered E2E browser testing CLI tool
**Researched:** 2026-03-11
**Confidence:** HIGH

## Executive Summary

SuperGhost v0.2 is a focused DX polish milestone layered on top of a fully working v1.0 CLI. The existing architecture is clean and well-factored — a thin `cli.ts` wiring layer, dependency-injected `TestRunner`/`TestExecutor`, a Vercel AI SDK `generateText` loop with MCP tool execution, and a `CacheManager` that hashes test cases against replay logs. All eight v0.2 features integrate into this existing skeleton without structural changes: they are additive wiring, not architectural redesigns. The one new file is `src/infra/preflight.ts`; every other change modifies an existing file. Only one new production dependency is required: `picomatch@^4.0.3` for `--only` glob pattern filtering.

The recommended implementation approach is a strict build-order that frontloads foundational changes (exit code taxonomy, cache key normalization) before adding user-facing CLI flags (`--only`, `--no-cache`, `--dry-run`), then wires the most complex feature (real-time verbose step progress via Vercel AI SDK `onStepFinish`) last. This sequencing is dictated by concrete code-level dependencies identified through direct source inspection of the v1.0 codebase. The YAML config schema is untouched — all new flags are invocation-time CLI options only, preserving full backward compatibility for existing YAML config files.

The primary risks are behavioral, not architectural. Three pitfalls in particular will produce silent, hard-to-diagnose production bugs if not addressed: (1) `--only` matching zero tests and exiting 0 instead of 2 in CI, (2) progress output written to stdout instead of stderr corrupting pipes and log files, and (3) Commander.js generating `options.cache` not `options.noCache` for the `--no-cache` flag — code checking `options.noCache` will always read `undefined`. Each is a one-to-three line mistake detectable only by targeted integration tests. Cache key normalization also requires Unicode NFC normalization in addition to whitespace trimming, or macOS-developed tests will miss the cache on Linux CI due to NFD vs NFC encoding differences.

---

## Key Findings

### Recommended Stack

The v0.2 stack adds exactly one new production dependency. The existing v1.0 stack (Bun, TypeScript, Commander.js 14, Vercel AI SDK 6, Zod 4, nanospinner, picocolors) handles every v0.2 feature directly. `picomatch@^4.0.3` is the sole addition, used for the `--only <pattern>` glob filter via `isMatch(testName, pattern)`. It was chosen over `minimatch` (active ReDoS CVEs in 2026: CVE-2026-26996, CVE-2026-27903, CVE-2026-27904) and `micromatch` (wraps picomatch but adds filesystem overhead not needed for string matching). All other v0.2 features use Bun built-ins, existing Commander.js `.option()` API, and `nanospinner`'s already-available `.update({ text })` method.

**Core technologies:**
- `picomatch@^4.0.3` — glob pattern matching for `--only` flag; zero deps, 4.4M ops/sec, used by Jest/Rollup/chokidar; `@types/picomatch@^4.0.2` for TypeScript types
- `commander@14.0.3` (existing) — all four new flags use `.option()` API; `--no-cache` uses built-in `--no-` negatable prefix convention, generating `options.cache` (not `options.noCache`)
- `nanospinner@1.2.2` (existing) — `.update({ text })` method supports real-time step text updates without restarting the spinner
- Bun `fetch()` + `AbortSignal.timeout()` (built-in) — preflight reachability check with no additional HTTP library
- `Bun.CryptoHasher` (built-in) — cache key normalization is a pure string transform applied before the existing hash call

### Expected Features

All eight features in scope are table stakes. The competitor analysis across Jest, Playwright, Vitest, and Cypress confirms these are universal CLI testing tool expectations. Absence makes SuperGhost feel like a prototype.

**Must have (table stakes):**
- `--dry-run` flag — lists tests without executing; every serious test CLI has this (Jest `--listTests`, Playwright `--list`, Vitest `vitest list`)
- `--verbose` flag — per-step AI tool call output; debugging a 30s AI run with only a spinner is opaque
- `--no-cache` flag — bypass cache reads; universal convention (Docker, npm, Turborepo); must still write cache after successful AI run
- `--only <pattern>` filter — test subset selection; maps to Jest `-t`, Playwright `--grep`, Vitest `-t`
- Preflight `baseUrl` reachability check — fail fast with a clear error before spending 30s on AI calls that will all fail against a downed server
- Real-time step progress output — users feel anxious watching a static spinner for 30s; map tool names to human descriptions
- Distinct exit codes 0/1/2 — without exit 2 for config errors, CI pipelines cannot distinguish "tests failed, retry" from "your pipeline is misconfigured"
- Cache key normalization — whitespace-insensitive keys prevent trust-eroding cache misses from copy-paste formatting differences

**Competitive differentiators:**
- Exit code 2 for zero-match `--only` filter — Jest and Playwright both exit 0 for empty filter results (silent CI footgun); SuperGhost takes the stricter, correct position
- `--no-cache` still writes cache after a fresh AI run — most tools treat `--no-cache` as ephemeral; SuperGhost's cache is a long-term maintenance artifact that should be refreshed, not discarded
- Verbose mode gracefully degrades in non-TTY — `picocolors` and `nanospinner` auto-disable; verbose output emits clean structured lines in CI pipes without any extra work

**Defer to later milestones:**
- `--watch` mode — comparable complexity to this entire milestone; `nodemon --exec "superghost --config tests.yaml"` is the interim workaround
- `--bail` / fail-fast — cross-cuts runner and cache lifecycle; adds complex edge cases when a run is bailed with partially-populated cache
- JSON/JUnit output (`--output json`) — full reporter refactor, not a DX flag; defer to a "reporting" milestone
- Token/cost tracking — "observability" feature requiring per-provider cost tables that drift over time

### Architecture Approach

All five v0.2 features thread through `cli.ts` as the aggregation point, with actual logic delegated to the module closest to the concern. The key insight is that `TestRunner` already accepts an injected `executeFn` — `--dry-run` is simply a different function passed at the same injection site, requiring no new abstraction. `--only` filtering is 3 lines in `cli.ts` (filter `config.tests` before constructing `TestRunner`; `TestRunner` never needs to know about patterns). Verbose step progress uses the Vercel AI SDK's existing `onStepFinish` callback in `generateText`, threaded from `cli.ts` through `TestExecutor` into `agent-runner.ts`. The YAML config schema is entirely unchanged — all new flags are invocation-time options, not project-level configuration.

**Major components and their v0.2 changes:**
1. `src/cli.ts` — primary wiring point; adds 4 Commander options, `--only` filter, preflight call, `--dry-run` branch, threads `verbose`/`noCache` flags to constructors, fixes exit code taxonomy in catch block
2. `src/infra/preflight.ts` — **new file only**; `checkBaseUrl(url): Promise<void>` using `fetch()` + `AbortSignal.timeout(5000)`, throws `PreflightError`; placed in startup sequence before MCP initialization, after config load
3. `src/cache/cache-manager.ts` — adds `normalizeKey()` static method: `s.normalize("NFC").trim().replace(/\s+/g, " ")`; applied to both `testCase` and `baseUrl` inputs before SHA-256 hashing
4. `src/agent/agent-runner.ts` — accepts optional `onStepFinish?` callback in config; passes it to `generateText` for real-time tool call events
5. `src/runner/test-executor.ts` — accepts `noCache?: boolean` and `onStepFinish?` as constructor options; guards `CacheManager.load()` with `noCache` check; threads callback to `executeAgentFn`
6. `src/output/reporter.ts` — adds `verbose?: boolean` constructor option; adds `onStepProgress()` method; handles `"dry-run"` source in `onTestComplete`; suppresses spinner entirely in verbose mode

**Unchanged files (confirmed):** `test-runner.ts`, `config/loader.ts`, `config/schema.ts`, `cache/step-recorder.ts`, `cache/step-replayer.ts`, `agent/mcp-manager.ts`, `agent/model-factory.ts`, `agent/prompt.ts`, `infra/process-manager.ts`, `infra/signals.ts`

### Critical Pitfalls

1. **`--only` zero-match silently exits 0** — After filtering, explicitly check `if (testsToRun.length === 0)` and call `program.error(msg, { exitCode: 2 })`. Print available test names in the error. A CI pipeline reporting green with zero tests run is a latent disaster.

2. **Progress output written to stdout corrupts pipes** — Route ALL progress lines through `process.stderr`, not `process.stdout`. Reserve stdout for parseable output. Before emitting ANSI or spinner output, check `process.stderr.isTTY`. Also gate on `process.env.CI`, `NO_COLOR`, and `TERM=dumb`. ANSI pollution in pipes (`\r`, `\x1b[2K`) produces silent interoperability failures that are difficult to diagnose after the fact.

3. **Commander.js `--no-cache` property name trap** — Declaring `.option('--no-cache', ...)` generates `options.cache` (boolean), NOT `options.noCache`. Code checking `options.noCache` always reads `undefined`. Read `options.cache === false` to detect the flag. Write a unit test for both the flagged and unflagged invocations.

4. **Cache normalization without Unicode NFC** — Whitespace trimming alone is insufficient. macOS file I/O uses NFD encoding; Linux uses NFC. The same test case description looks identical on screen but produces different SHA-256 hashes across platforms, causing every cache lookup to miss in CI. Apply `testCase.normalize("NFC")` before any other normalization. Include a version prefix in the hash input (`v2|${normalized}|${baseUrl}`) for a clean break with v1 keys.

5. **Dry-run diverges from real execution** — Dry-run must still run `loadConfig()`, Zod schema validation, and API key presence check. It only skips `mcpManager.initialize()`, `executeAgent()`, and `cacheManager.save()`. A dry-run that does not catch config errors "lies" to the user and erodes trust. Document in CLI help text: "validates config and previews test plan without running AI or browser."

---

## Implications for Roadmap

Based on the build-order dependencies in ARCHITECTURE.md and the pitfall-to-phase mapping in PITFALLS.md, the recommended implementation sequence has 4 phases.

### Phase 1: Foundation (Exit Codes + Cache Normalization)

**Rationale:** These two changes have zero feature dependencies. Exit code taxonomy must be locked before any subsequent feature can correctly emit exit 2 — implement it first so every subsequent error path uses the new taxonomy from the start. Cache normalization is a self-contained pure-function change that should land early and be documented as a breaking change in release notes.

**Delivers:** Correct POSIX exit code taxonomy (0/1/2); whitespace-insensitive and Unicode-insensitive cache keys; consistent cache hits between macOS developers and Linux CI

**Addresses:** Exit codes 0/1/2 feature; cache key normalization feature

**Avoids:** Exit code 2 breaking existing CI scripts (lock taxonomy before any other feature introduces exit 2 paths); cache invalidation without version prefix; macOS/Linux NFD vs NFC hash mismatch

**Files changed:** `src/cli.ts` (catch block only), `src/cache/cache-manager.ts`

### Phase 2: New Infrastructure + Flags (Preflight + --only + --no-cache)

**Rationale:** These three features are independent of each other but all depend on Phase 1's exit code taxonomy. `preflight.ts` is a new module that can be developed and unit-tested in isolation. `--only` and `--no-cache` are thin wiring additions. No Reporter or Agent layer changes yet.

**Delivers:** Fail-fast baseUrl reachability check before any AI calls; test subset selection via glob pattern; cache bypass for forced fresh AI runs that still re-populate the cache on success

**Addresses:** `--only <pattern>` feature; `--no-cache` feature; preflight `baseUrl` check feature

**Avoids:** `--only` zero-match silent exit 0 (check `testsToRun.length === 0` and exit 2 with list of available names); Commander.js `--no-cache` property name trap (read `options.cache`, not `options.noCache`); preflight hanging on slow servers (use `AbortSignal.timeout(5000)`, accept any HTTP response including 4xx as "reachable" — a 404 from a live server is still connectivity confirmed); per-test `baseUrl` check scope (only check global `config.baseUrl` at startup; per-test overrides surface as test failures)

**Files changed:** `src/infra/preflight.ts` (new), `src/cli.ts` (preflight call + `--only` filter + `--no-cache` wiring), `src/runner/test-executor.ts` (`noCache` constructor option + cache-load guard)

### Phase 3: Dry-Run Flag

**Rationale:** `--dry-run` is slightly more complex than the Phase 2 flags because it touches the Reporter (needs `"dry-run"` source label) and requires a type extension, but most importantly it must walk the same validation path as a real run — making its validation contract explicit requires focused attention. Isolating it here prevents the "dry-run lies about config errors" anti-pattern from being introduced alongside other Reporter changes.

**Delivers:** Safe test plan preview without AI execution or browser launch; still validates config, Zod schema, and API key presence before listing what would run

**Addresses:** `--dry-run` feature

**Avoids:** Dry-run diverging from real execution (must still call `loadConfig()` + Zod + API key presence check; only skips `mcpManager.initialize()` and `executeAgent()`); preflight check running in dry-run mode (preflight must be gated on actual execution mode); `[DRY RUN]` prefix on all output lines to clearly distinguish from real run output

**Files changed:** `src/runner/types.ts` (add `"dry-run"` to `TestSource` union), `src/output/reporter.ts` (handle dry-run source label), `src/cli.ts` (dry-run branch before MCP init)

### Phase 4: Verbose Mode + Real-Time Step Progress

**Rationale:** This is the most complex feature because it spans four files and threads a callback from `cli.ts` through `TestExecutor` into `generateText` in `agent-runner.ts`. It is the last phase because it depends on the Reporter changes from Phase 3 and because the verbose/spinner conflict requires careful handling: when `--verbose` is active, the nanospinner must be suppressed entirely — spinners overwrite lines via `\r` and will corrupt sequential verbose output.

**Delivers:** Per-step AI tool call output during execution with step numbers; real-time feedback for long-running tests; clean non-TTY behavior in CI via auto-detected output routing

**Addresses:** `--verbose` flag feature; real-time step progress feature

**Avoids:** Progress output corrupting pipes (all progress to stderr, gate on `isTTY`, check `CI`/`NO_COLOR` env vars); verbose mode and nanospinner conflicting (suppress spinner entirely in verbose mode; use sequential `console.error` lines instead); agent internals bypassing Reporter abstraction (route all step events through `Reporter.onStepProgress()` — the reporter already owns TTY detection)

**Files changed:** `src/output/types.ts` (add `onStepProgress?` to Reporter interface), `src/output/reporter.ts` (implement verbose mode and step progress), `src/agent/agent-runner.ts` (add `onStepFinish?` callback to config, pass to `generateText`), `src/runner/test-executor.ts` (thread `onStepFinish` through to `executeAgentFn`), `src/cli.ts` (verbose flag wiring)

### Phase Ordering Rationale

- **Phase 1 before everything:** Exit code taxonomy must be locked so every subsequent `program.error(..., { exitCode: 2 })` call uses the correct taxonomy from the first commit. Cache normalization is a breaking change that should be isolated and documented before user-facing flags build on top of it.
- **Phase 2 before Phase 3:** `--only` and `--no-cache` have no Reporter dependencies; establishing them early means Phase 3 can focus entirely on the dry-run validation contract without also juggling flag wiring.
- **Phase 3 before Phase 4:** Phase 4 modifies `reporter.ts`; having the dry-run source label already in place means the verbose reporter changes are additive and non-conflicting.
- **Phase 4 last:** The `onStepFinish` callback chain is the only multi-file threading operation in the milestone. Isolating it to the final phase means every other feature is stable and testable before the most complex integration begins.

### Research Flags

Phases with well-documented patterns (skip deep research-phase during planning):
- **Phase 1:** Pure function changes to existing code — no external API dependencies; all patterns are fully known from v1.0
- **Phase 2:** `infra/preflight.ts` uses Bun `fetch()` + `AbortSignal.timeout()` which is verified in official Bun docs; `picomatch.isMatch()` is a single well-documented function call
- **Phase 3:** `TestRunner` dependency injection pattern already works in v1.0; dry-run is wiring, not new design

Phases that may benefit from a targeted spike before detailed planning:
- **Phase 4:** The Vercel AI SDK `onStepFinish` callback field names for individual tool calls (`toolCalls[n].toolName`, `toolCalls[n].input`) should be verified against the exact installed SDK version (`ai@6.0.116`) before implementation. SDK 6 changed several callback signatures relative to SDK 3. This is a low-risk gap — if the field names differ, the fix is a 2-line change.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against npm registry as of 2026-03-11; picomatch CVE comparison verified against GitHub Advisory database; Bun `AbortSignal.timeout()` confirmed in official Bun docs |
| Features | HIGH | Verified against official CLI documentation for Jest, Playwright, Vitest, and Cypress; POSIX exit code conventions confirmed; all competitor CLI behavior claims are from official reference docs |
| Architecture | HIGH | Based on direct source inspection of the shipped v1.0 codebase; Vercel AI SDK `onStepFinish` callback confirmed in official SDK docs; component change summary validated against actual file structure |
| Pitfalls | HIGH | Commander.js `--no-` property name behavior confirmed in issue tracker (#979); Unicode NFD/NFC cross-platform issue is documented OS behavior; all other pitfalls are direct architectural consequences of identified implementation choices |

**Overall confidence:** HIGH

### Gaps to Address

- **Vercel AI SDK `onStepFinish` exact field names:** Research confirms the callback exists and its general shape, but the exact field names on individual tool call objects within `step.toolCalls[n]` should be verified against `ai@6.0.116` source before Phase 4 begins. Low risk — a 2-line fix if wrong.
- **Per-test `baseUrl` override preflight scope:** PITFALLS.md recommends checking all unique per-test `baseUrl` overrides at startup; the recommended resolution is to check only the global `config.baseUrl` at startup and let per-test URL failures surface as test failures. This design decision should be made explicit in Phase 2 planning and documented in CLI help text.
- **`--no-cache` write semantics:** The research is consistent that `--no-cache` should skip reads but still write on success ("refresh the cache"). This is intentionally different from Docker's read-only semantics. The help text must say "Skips reading cache; still writes on success" to prevent user confusion.

---

## Sources

### Primary (HIGH confidence)

- Commander.js GitHub — `program.error()` with `exitCode` option, `--no-` prefix property name convention, Commander v14 `.option()` patterns; issue #979 for historical `--no-` default behavior
- Vercel AI SDK official docs (`ai-sdk.dev`) — `generateText` `onStepFinish` callback signature and behavior; confirmed parameter is `onStepFinish: (step: StepResult) => void`
- Bun official docs — `fetch()` + `AbortSignal.timeout()` support, `CryptoHasher`, native `.env` loading, `Bun.file`/`Bun.write`
- picomatch npm registry + GitHub README — `isMatch()` API, performance benchmarks (4.4M ops/sec), zero-dependency confirmation, last updated July 2025
- @types/picomatch npm — version 4.0.2, updated July 2025 for picomatch 4.x API
- Jest CLI reference (official) — `--listTests`, `--verbose`, `--testNamePattern`, exit code behavior
- Playwright CLI reference (official) — `--list`, `--grep`, `--dry-run`, `--reporter`, `webServer` preflight ping behavior
- Vitest CLI reference (official) — `vitest list`, `--reporter=verbose`, `-t pattern`
- Cypress CLI reference (official) — exit codes, `--posix-exit-codes`, `--spec`
- POSIX exit code conventions — 0 = success, 1 = failure, 2 = usage/configuration error
- Unicode Consortium UAX #15 — NFC as recommended normalization form for storage and comparison
- SuperGhost v1.0 source (direct inspection) — `src/cli.ts`, `src/runner/test-runner.ts`, `src/cache/cache-manager.ts`, `src/runner/test-executor.ts`, `src/agent/agent-runner.ts`, `src/output/reporter.ts`

### Secondary (MEDIUM confidence)

- minimatch CVE-2026-26996 (GitHub Advisory) — ReDoS via repeated wildcards; active in minimatch 10.x; also CVE-2026-27903, CVE-2026-27904 per npm issue #9037
- Bun fetch timeout GitHub issue #13392 — documents changed default timeout behavior across Bun versions; basis for recommending explicit `AbortSignal.timeout()` rather than relying on Bun defaults
- nanospinner npm — TTY auto-disable behavior; partially documented; auto-disable in non-TTY confirmed by analogy with picocolors which documents this explicitly

### Tertiary (LOW confidence)

- Evil Martians CLI UX best practices — spinner vs. progress display patterns; TTY-compatible output recommendations; used for verbose output format guidance
- TTY detection CLI issue tracker (forcedotcom/cli #327) — production example of ANSI pollution in CI logs; confirms routing progress to stderr as correct mitigation

---

*Research completed: 2026-03-11*
*Ready for roadmap: yes*
