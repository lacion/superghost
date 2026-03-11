# Pitfalls Research

**Domain:** DX Polish + Reliability Hardening for existing AI-powered CLI testing tool (SuperGhost v0.2)
**Researched:** 2026-03-11
**Confidence:** HIGH

---

## Critical Pitfalls

### Pitfall 1: Exit Code 2 Breaks Existing CI Scripts That Treat Any Non-Zero as "Test Failed"

**What goes wrong:**
The current system emits `exit 0` (all pass) or `exit 1` (any fail). Adding `exit 2` for config/runtime errors is semantically correct but is a breaking change for CI scripts that use `|| echo "tests failed"` or `if [ $? -ne 0 ]` patterns. Those scripts currently interpret `1` and `2` identically. But scripts that use `case $?` or that pass `--exit-code-from superghost` in Docker Compose, or that compare `$status -eq 1` explicitly, will silently swallow config errors that now return `2` instead of `1`.

**Why it happens:**
The existing exit code contract (`0` = pass, `1` = fail) is implicitly assumed by any CI wrapper the user has written. The migration pitfall is that `exit 1` currently covers both "tests failed" and "something went wrong" — because there is only one failure code. When `exit 2` is introduced for the second class, scripts that previously relied on `exit 1` for that case will silently receive a different code and may behave incorrectly (e.g., not retry, not send an alert, not write to the failure artifact).

**How to avoid:**
- Do not change what produces `exit 1`. Keep `exit 1` for test failures only. Add `exit 2` for all new error categories (config parse errors, missing API keys, preflight failures, bad `--only` pattern with zero matches).
- The current `cli.ts` already exits `1` for `ConfigLoadError` and missing API key. Those must be migrated to `exit 2` — but this is the expected breaking change. Document it in the changelog.
- Add a `--strict` flag if users need old behavior (`1` for everything) for backward compatibility.
- Write a CHANGELOG entry calling out the behavior change explicitly so users who pin CI scripts know to update them.
- In the error output written to stderr, always include the exit code that will be used: `Error (exit 2): config file not found`.

**Warning signs:**
- CI pipeline shows "success" after a config parse error (script checked `$? -eq 1` instead of `$? -ne 0`)
- Alert not triggered because the monitoring tool only watches for `exit 1`
- Docker Compose `--exit-code-from` propagating `2` where the downstream expects `1`

**Phase to address:** Exit code refactor (any phase that introduces the `exit 2` path) — this must be the first change implemented, before preflight or `--only`, so that every subsequent error path uses the new taxonomy from the start.

---

### Pitfall 2: `--no-cache` Flag Gets Silently Ignored Because Commander.js --no- Prefix Has Implicit Default Behavior

**What goes wrong:**
Commander.js gives special treatment to flags starting with `--no-`. When you declare `.option('--no-cache', 'Bypass cache')`, Commander automatically sets `options.cache = true` as the implicit default (without you asking it to). This means `options.cache` is always `true` unless the flag is passed — but the property name is `cache`, not `noCache`. Code that checks `options.noCache` (the natural camelCase expectation) will always be `undefined`, effectively making `--no-cache` inoperative. The bug is silent: passing `--no-cache` sets `options.cache = false` correctly, but omitting it sets `options.cache = true` rather than `undefined`, which is unexpected if the code uses `if (options.noCache)` guards.

**Why it happens:**
Commander's `--no-` prefix convention is designed for toggling features that are "on by default." For `--no-cache`, the underlying feature (caching) _is_ on by default, which makes this the appropriate pattern — but the generated property name trips up developers who expect `options.noCache`. The Commander.js issue tracker has a confirmed historical bug (pre-v3.0) where adding `--no-foo` alongside `--foo` caused `foo` to silently default to `true` even when neither flag was passed.

**How to avoid:**
- Use `.option('--no-cache', ...)` and read `options.cache` (boolean, `true` = use cache, `false` = skip cache). Do NOT check `options.noCache`.
- Alternatively, avoid the `--no-` prefix entirely: use `.option('--bypass-cache', ...)` and check `options.bypassCache === true`.
- Write a unit test that invokes the CLI without `--no-cache` and asserts the cache path is taken, and invokes it with `--no-cache` and asserts the cache path is skipped.
- Verify Commander version is >= 3.0 (the version that fixed the combined `--foo` / `--no-foo` default behavior conflict).

**Warning signs:**
- `--no-cache` passed on CLI but AI agent still replays from cache
- `options.cache` is always `true` regardless of flag
- Reading `options.noCache` in code returns `undefined` every time

**Phase to address:** CLI flags implementation — the phase that adds `--dry-run`, `--verbose`, `--no-cache`, `--only`.

---

### Pitfall 3: Real-Time Progress Output Corrupts Piped/Redirected Output and CI Logs

**What goes wrong:**
Adding step-by-step progress output (e.g., "Step 3: clicking login button...") to stdout during AI execution corrupts any downstream consumer that expects parseable output. In CI, the test logs become interleaved with ANSI escape codes from spinners or progress lines. When users pipe output (`superghost --config tests.yaml | tee results.log`), the log file contains spinner control sequences (`\r`, `\x1b[K`, `\x1b[2K`) that break parsing. The existing `nanospinner` library in the project does not document explicit TTY detection or CI environment handling — its behavior in non-TTY contexts is not guaranteed by its README.

**Why it happens:**
Progress output is designed for interactive terminals where ANSI codes render cleanly. When stdout is piped or redirected, it is no longer a TTY (`process.stdout.isTTY` is `undefined`/`false`). Libraries that do not explicitly check `isTTY` before writing animation frames emit control sequences into the byte stream. `nanospinner` uses `process.stdout` by default but its source shows minimal CI detection. The Vercel AI SDK's `onStepFinish` callback provides a clean hook for step progress that does not need to use spinner animation at all.

**How to avoid:**
- Route ALL progress output (step events, "running AI...") to `process.stderr`, not `process.stdout`. Reserve stdout for parseable, pipeline-safe output only.
- Before emitting any ANSI or spinner output, check `process.stderr.isTTY`. If false (piped, redirected, CI), emit plain-text lines without escape codes.
- Check `process.env.CI`, `process.env.NO_COLOR`, and `process.env.TERM === 'dumb'` as additional signals to disable animation.
- Use the `onStepFinish` callback in `generateText` to receive step events, then conditionally format them (spinner update in TTY, plain log line in non-TTY).
- Never write progress to stdout — it creates silent interoperability failures that are hard to debug after the fact.

**Warning signs:**
- `superghost ... | grep "PASSED"` returns no matches because progress lines are interleaved in stdout
- CI log viewer shows garbled output with `^[[2K` or `\r` characters
- Tailing a log file shows "spinning" characters in the file contents
- `--json` output (if added later) contains progress lines embedded in the JSON stream

**Phase to address:** Real-time progress output implementation. Must be addressed before this feature ships — it cannot be an afterthought.

---

### Pitfall 4: Dry-Run Diverges from Real Execution Due to Wiring Differences

**What goes wrong:**
`--dry-run` is supposed to show "what would happen" without actually running tests. The natural implementation — checking `if (options.dryRun) { logPlan(); return; }` early in the flow — means the dry-run code path never exercises config validation, MCP initialization, API key validation, or baseUrl reachability. Users see a clean dry-run output but then get a startup failure when they actually run the tests. The more the dry-run path diverges from the real path, the less useful it becomes. Users trust dry-run and are surprised when the real run fails.

**Why it happens:**
Dry-run implementations naturally start as a simple "print config and exit" addition. Every added shortcut (skip MCP init, skip API key check, skip preflight) makes the dry-run faster but less accurate. The critical missing feature: dry-run should still validate that all the inputs are correct; it should only skip the AI execution steps.

**How to avoid:**
- Dry-run must still run: `loadConfig()`, Zod schema validation, API key presence check (not validity, just presence), and baseUrl reachability preflight check.
- Dry-run skips only: `mcpManager.initialize()`, `executeAgent()`, and `cacheManager.save()`.
- Output for dry-run: print the full test plan (test names, base URLs, which would use cache, which would run AI), then exit 0.
- Clearly document in the help text: "validates config and previews test plan without running AI or browser."
- If `--dry-run` is combined with `--no-cache`, the output should note which tests would normally hit cache but will be forced to run AI.

**Warning signs:**
- Dry-run completes successfully but `--config` with a typo in the path also completes successfully (config was never loaded)
- Dry-run shows "3 tests would run" but the real run shows "config error: invalid baseUrl"
- Users file bugs "dry-run lied to me about the config"

**Phase to address:** CLI flags implementation, specifically the `--dry-run` path.

---

### Pitfall 5: Preflight HTTP Check Adds Latency and Produces False Negatives on Slow Servers

**What goes wrong:**
A HEAD request to `baseUrl` before tests run is the right pattern, but naive implementation introduces two failure modes: (1) the timeout is too short — a server that responds in 3s fails the 1s default check, blocking valid test runs; (2) the timeout is too long — a server that never responds hangs the CLI for 30s before tests can start. There is also a semantic problem: a slow server that responds with `502 Bad Gateway` at the load balancer during a rolling deploy is "reachable" (returns HTTP) but the tests will fail. A correct preflight checks connectivity, not deployment health.

**Why it happens:**
Developers reach for `fetch(baseUrl)` with a default timeout or no timeout at all. Bun's `fetch` has had documented timeout issues — a default `idleTimeout` of 10 seconds was added in v1.1.26 and then the default changed to `0` (disabled). Without an explicit `AbortController` timeout, a hanging server will block the CLI indefinitely. Additionally, the preflight check is typically added as a full GET request against the root URL, which can trigger expensive server-side operations (authentication redirects, analytics tracking, etc.) that a HEAD request would avoid.

**How to avoid:**
- Use `HEAD` not `GET` for the preflight check — it avoids response body overhead and sidesteps many server-side behaviors.
- Set a configurable timeout via `AbortController` with a sensible default (5 seconds). Do not rely on Bun's `fetch` default timeout behavior across versions.
- On timeout or connection refused: print a clear warning, not an error. Give the user the option to continue anyway with `--skip-preflight` or equivalent.
- On any non-2xx/non-3xx status: still warn but do not block. A 404 at the root is still connectivity confirmed. Only treat connection refused and timeout as "server may be down."
- Skip the preflight check in dry-run mode (since no actual tests will run).
- Make the preflight timeout configurable in the YAML config (`preflightTimeout: 5000`).

**Warning signs:**
- `superghost` hangs for 30+ seconds before printing any output
- Tests are blocked by preflight even when the server is running (slow cold start)
- `fetch` call in preflight triggers rate limiting or auth redirect on the target server
- Tests with per-test `baseUrl` overrides skip the global preflight and the per-test URL is never checked

**Phase to address:** Preflight check implementation phase.

---

### Pitfall 6: Cache Key Normalization Breaks Existing Cache Files

**What goes wrong:**
The current `CacheManager.hashKey()` hashes `${testCase}|${baseUrl}` verbatim. If v0.2 adds normalization (trim whitespace, lowercase, collapse multiple spaces), all existing cache files become unreachable — their keys were computed without normalization. On the first run after the upgrade, every test re-runs via AI, users see no cache hits, and the experience regresses. Worse: if normalization is applied inconsistently (only in `hashKey` but the stored `testCase` field in the JSON is the raw form), there is a permanent mismatch between the stored key and how future lookups will compute the hash.

**Why it happens:**
Cache key normalization is an in-place change to the hashing function. There is no migration path for existing cache files, and no cache schema version bump to signal "old cache = invalid." The atomic-write-then-rename pattern protects against corruption but does nothing about hash function changes.

**How to avoid:**
- Normalize consistently: apply normalization in `hashKey()` and normalize `testCase` before passing it to `hashKey()` everywhere (both save and load paths).
- Include the normalization strategy version in the hash input: `v2|${normalizedCase}|${baseUrl}` — this causes a clean break with v1 keys rather than a silent mismatch.
- When incrementing the cache version (from `version: 1` to `version: 2` in `CacheEntry`), delete or ignore any cache entry that does not match the current version.
- Document in the release notes: "v0.2 normalizes cache keys — your `.superghost-cache/` will be invalidated on first run. All tests re-run via AI once, then cache as normal."
- Consider adding a `superghost --clear-cache` command so users can explicitly purge rather than discovering stale cache by accident.

**Warning signs:**
- After upgrading to v0.2, all tests show `source: "ai"` instead of `source: "cache"` even for tests that were previously cached
- Cache directory has doubled in file count (old v1 hashes AND new v2 hashes both present)
- `load()` always returns `null` for tests that have cache files on disk

**Phase to address:** Cache key normalization phase. The version bump and migration strategy must be designed before implementation begins.

---

### Pitfall 7: Unicode Edge Cases Create Silent Cache Mismatches

**What goes wrong:**
JavaScript strings can represent the same visible character via multiple Unicode code point sequences (Unicode equivalence). For example, `"café"` can be encoded as NFC (precomposed: `\u0063\u0061\u0066\u00E9`) or NFD (decomposed: `\u0063\u0061\u0066\u0065\u0301`). A test case description pasted from a macOS text editor may use NFD (macOS normalizes to NFD by default), while the same description typed in a Linux editor may use NFC. Both look identical on screen. SHA-256 hashing is byte-exact — they produce different hashes, causing a cache miss on a logically identical test case. This is not a theoretical edge case for a multilingual user base.

**Why it happens:**
Bun's `CryptoHasher` operates on raw bytes. JavaScript's `String.prototype.normalize()` is not called automatically. YAML parsing preserves the byte sequence from the file. macOS file I/O frequently uses NFD; Linux and Windows use NFC. A test suite developed on Mac and run in a Linux CI container can experience cache miss on every run even when tests pass, because all hash lookups miss.

**How to avoid:**
- Call `testCase.normalize("NFC")` before hashing. NFC is the recommended normalization form for storage and comparison (per Unicode Consortium UAX #15).
- Apply normalization in `hashKey()` before any other processing, so it is impossible to bypass.
- Also trim leading/trailing whitespace and collapse internal runs of whitespace to single spaces as part of the same normalization step.
- The cache JSON's `testCase` field should store the normalized form (not the original), so the stored key and the lookup key always match.

**Warning signs:**
- Tests cached on macOS miss on Linux CI
- `load()` returns `null` for tests that look exactly right in the YAML
- Cache files exist on disk but are never used (hash prefix in filename doesn't match computed hash)

**Phase to address:** Cache key normalization phase — handle Unicode in the same commit as whitespace normalization.

---

### Pitfall 8: `--only` Pattern With Zero Matches Silently Exits 0

**What goes wrong:**
`superghost --only "login"` should filter to tests whose name matches the pattern. If no tests match (typo in pattern, wrong case, wrong format), the intuitive behavior is an error. The naive implementation runs `config.tests.filter(t => t.name.includes(pattern))` and passes an empty array to `TestRunner`. `TestRunner.run()` iterates an empty array, `aggregateResults([])` returns `{ passed: 0, failed: 0 }`, the reporter prints "0 tests run," and the process exits `0`. A CI pipeline sees `exit 0` and reports success when in fact the user's intent was to run specific tests and nothing ran.

**Why it happens:**
An empty test suite is not an error condition in the current `TestRunner` design — it is a degenerate case that was never considered. The Zod schema requires `tests.min(1)` in the config file, but the `--only` filter operates after config validation, so it can produce an empty set without Zod catching it.

**How to avoid:**
- After applying the `--only` filter, check if the result is empty. If empty, exit `2` with an error message: `"No tests matched pattern: 'login'. Available test names: [...]"`.
- This is not a test failure (exit 1) or a config error — it is a user input error, which correctly maps to exit 2.
- Print the available test names in the error message to help the user correct the pattern.
- For `--only`, use case-insensitive substring matching by default (most intuitive for quick filtering). Document the exact match semantics.
- Support both substring and glob patterns if feasible; if implementing glob, be explicit about case sensitivity.

**Warning signs:**
- CI passes but no tests ran (exit 0 with "0 tests" output)
- User complains "my tests aren't running" but the exit code is 0
- Test output shows "Passed: 0, Failed: 0" but the user intended to run specific tests

**Phase to address:** CLI flags implementation, `--only` path.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip config validation in `--dry-run` | Faster dry-run implementation | Dry-run becomes unreliable; users lose trust in the feature | Never — always run validation |
| Log progress to stdout instead of stderr | Simpler single-stream output | Breaks piping, JSON output, log parsing forever | Never |
| Hardcode preflight timeout to 5000ms | No new config surface | Breaks users on slow local servers; no tuning option | Never — make it configurable from the start |
| Normalize cache keys in `hashKey()` without version bump | Smaller diff | Existing cache files silently stop working; mysterious cache misses | Never |
| Apply `--only` filter after cache lookup | Simpler code flow | Cache is still read for tests that will be filtered out | Never — filter before any I/O |
| Use `process.stdout.write` for progress even when not TTY | Easy implementation | ANSI pollution in pipes, CI logs | Never |
| Keep `exit 1` for config errors in the new scheme | No breaking change | Defeats the purpose of exit code taxonomy | Never — commit to the new taxonomy |

---

## Integration Gotchas

Common mistakes when connecting the new flags to the existing system.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `--no-cache` + `CacheManager` | Pass a `noCache: boolean` prop through many layers | Add a `disableCache` flag to `TestExecutor` constructor; `CacheManager` stays unchanged |
| `--only` + `TestRunner` | Filter inside `TestRunner.run()` | Filter `config.tests` in `cli.ts` before constructing `TestRunner`; runner does not need to know about patterns |
| `--dry-run` + `McpManager` | Skip `McpManager.initialize()` entirely | Skip it — but still run all validation before the `if (dryRun) return;` guard |
| Preflight check + per-test `baseUrl` | Only check `config.baseUrl` | Collect all unique baseUrls (global + per-test overrides), check each once before running any tests |
| `onStepFinish` progress + `ConsoleReporter` spinner | Both try to write to stdout simultaneously | Progress output from `onStepFinish` must be routed through the reporter; reporter manages all output |
| Exit code `2` + `ConfigLoadError` path in `catch` | The catch block still calls `process.exit(1)` | Update the catch block to call `process.exit(2)` for config/infra errors; keep `process.exit(1)` for test failures only |
| `--verbose` flag + nanospinner spinner | Spinner overwrites verbose lines on same line via `\r` | Suppress spinner entirely in `--verbose` mode; use plain sequential log lines instead |

---

## Performance Traps

Patterns that work at small scale but cause problems as the test suite grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Preflight check per test (not per unique baseUrl) | 10-test suite does 10 HTTP checks at startup | De-duplicate baseUrls; check each unique URL once | Suites with 5+ unique baseUrls |
| Reading all cache files to check for `--only` matches | Slow startup on large cache dirs | `--only` filter operates on config, not cache; cache is read lazily during execution | Cache dirs with 100+ entries |
| Verbose output buffered and dumped at end | Logs arrive too late to be useful during long runs | Stream verbose output in real-time to stderr; do not buffer | Any run > 30 seconds |
| Preflight check blocks suite startup during CI cold start | Tests fail because server hasn't warmed up | Configure a retry count (2-3 retries with 1s backoff) before failing preflight | Any server with >2s cold-start |

---

## UX Pitfalls

Common user experience mistakes when adding DX flags.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| `--verbose` dumps raw tool call JSON | Output is unreadable; too much noise | Format tool calls as human-readable summaries: "browser_click: selector=#submit-btn" |
| Dry-run output format identical to real run output | User can't tell if they ran dry-run or real tests | Prefix every dry-run output line with `[DRY RUN]`; add a banner at start and end |
| Preflight error is fatal with no override | Users testing locally with slow dev servers are blocked | Make preflight a warning, not a hard stop; allow `--skip-preflight` override |
| `--only` is case-sensitive substring match | User types `--only Login` but test is named `login flow` | Use case-insensitive matching by default |
| Progress output shows tool call names like `browser_snapshot` | Non-technical users confused by internal tool names | Map tool names to human descriptions: "browser_snapshot" → "capturing page state" |
| `--no-cache` runs silently with no indication cache was bypassed | User unsure if flag took effect | Print "(cache bypassed)" in the per-test output line when `--no-cache` is active |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Exit code 2:** Often missing — verify that `ConfigLoadError`, missing API key, preflight failure, and zero-match `--only` ALL exit `2`, not `1`. Check the existing catch blocks in `cli.ts` are updated.
- [ ] **`--no-cache` flag:** Often missing — verify `options.cache` (not `options.noCache`) is read, and that the flag actually skips both cache read AND cache write (not just one).
- [ ] **Preflight check with per-test baseUrls:** Often missing — verify tests that override `baseUrl` at the test level also get their URL checked, not just the global config `baseUrl`.
- [ ] **Dry-run config validation:** Often missing — verify `loadConfig()` and Zod validation still run in dry-run mode; typo in config path should still produce an error.
- [ ] **Progress output in non-TTY:** Often missing — verify that running `superghost ... > output.txt` produces clean text in the file, not ANSI escape sequences.
- [ ] **`--only` zero-match error:** Often missing — verify that a pattern matching no tests exits `2` with an informative message, not `0` with "0 tests run."
- [ ] **Cache key Unicode normalization consistency:** Often missing — verify that `save()` and `load()` both normalize via the same path; they must call the same `hashKey()` function.
- [ ] **`--verbose` + spinner conflict:** Often missing — verify that spinner animation does not overwrite verbose output lines in TTY mode; they must not share the same output stream simultaneously.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Exit code 1 used for config errors in prod (breaks CI taxonomy) | MEDIUM | Add `exit 2` paths, document breaking change in release notes, provide `--legacy-exit-codes` flag if needed |
| Cache invalidated by normalization change (all cache misses) | LOW | Document expected behavior in release notes; cache rebuilds automatically on next run |
| Progress output polluting a production log file | MEDIUM | Hotfix: gate all progress output on `process.stderr.isTTY`; deploy; affected log files must be manually cleaned |
| Preflight false-negatives blocking CI | LOW | Add `--skip-preflight` flag as an override; reduce default timeout; add retry logic |
| `--only` zero-match silent success in CI | HIGH | Audit pipeline logs for "0 tests run" patterns; add exit code check; fix the bug; re-run any CI runs that may have passed with zero tests |
| `--no-cache` not working (always using cache) | MEDIUM | Identify which side (read or write) was missed; verify Commander.js property name; add integration test |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Exit code 2 breaking existing scripts | Phase 1 (CLI flags + exit codes) | Integration test: assert `exit 1` for test fail, `exit 2` for config error, `exit 0` for pass |
| `--no-cache` Commander.js prefix trap | Phase 1 (CLI flags) | Unit test: invoke CLI without flag → cache is used; invoke with `--no-cache` → cache bypassed |
| Progress output corrupts pipes | Phase 2 (real-time progress) | Pipe test: `superghost ... | cat` and verify no ANSI codes in output file |
| Dry-run diverges from real execution | Phase 1 (CLI flags) | Dry-run test: introduce deliberate config error, verify dry-run also catches it |
| Preflight latency / false negatives | Phase 3 (preflight check) | Test: point at slow server, verify configurable timeout and graceful warning |
| Cache normalization breaks existing cache | Phase 4 (cache normalization) | Test: create cache with old key format, verify new run does not find it, verifies re-execution |
| Unicode cache mismatches | Phase 4 (cache normalization) | Test: hash same string in NFC and NFD, verify `hashKey()` produces identical output |
| `--only` zero-match silent exit 0 | Phase 1 (CLI flags) | Unit test: `--only nonexistent-pattern` must exit `2` with error message |

---

## Sources

- Commander.js issue #979 — `--no-` prefix implicit default behavior: https://github.com/tj/commander.js/issues/979
- Vercel AI SDK — `onStepFinish` callback for step progress: https://ai-sdk.dev/docs/ai-sdk-core/generating-text
- Bun fetch timeout issues: https://github.com/oven-sh/bun/issues/13392
- nanospinner npm — TTY behavior undocumented: https://www.npmjs.com/package/nanospinner
- Unicode normalization UAX #15: https://www.unicode.org/reports/tr15/
- MDN String.prototype.normalize(): https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize
- Linux exit code conventions: https://www.baeldung.com/linux/status-codes
- TTY detection and progress output in CLI tools: https://github.com/forcedotcom/cli/issues/327
- In praise of --dry-run (Hacker News discussion on implementation pitfalls): https://news.ycombinator.com/item?id=27263136
- kubectl dry-run pitfalls: https://thelinuxcode.com/kubectl-dry-run/

---
*Pitfalls research for: SuperGhost v0.2 DX Polish + Reliability Hardening*
*Researched: 2026-03-11*
