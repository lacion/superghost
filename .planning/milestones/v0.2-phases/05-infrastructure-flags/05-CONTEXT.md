# Phase 5: Infrastructure + Flags - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Three CLI features: test filtering (`--only <pattern>`), cache bypass (`--no-cache`), and preflight baseUrl reachability check. Users can filter tests, bypass cache, and get fast failure on unreachable servers before wasting time on AI execution.

</domain>

<decisions>
## Implementation Decisions

### Filtered test reporting
- Summary shows skipped count: "3 passed, 0 failed, 7 skipped"
- Header shows "Running 3 of 10 test(s)" with pattern annotation line: `(filtered by --only "login*")`
- Single pattern only — one `--only` flag per run (users can use glob alternation `{login,checkout}*` for multi-pattern)
- Pattern matching is case-insensitive (test names are natural language)
- Zero-match exits 2 with bulleted list of available test names, same `pc.red("Error:")` style as other exit-2 errors

### Cache bypass feedback
- Header shows `(cache disabled)` annotation line when `--no-cache` is active
- `--no-cache` skips cache reads but still writes cache entries on success
- All tests show source as `(ai)` when cache is bypassed — no "cache skipped" annotation
- When combined with `--only`, annotations stack on separate lines:
  ```
  (filtered by --only "login*")
  (cache disabled)
  ```

### Preflight reachability check
- Runs after config load + API key validation, before MCP server init — fastest possible failure
- Checks global baseUrl only (per-test baseUrl preflight is out of scope per REQUIREMENTS.md)
- If no global baseUrl configured, skip preflight silently — API-only test suites proceed directly
- Error message: `Error: baseUrl unreachable: {url}` followed by suggestion to check server/URL
- Exits 2 on unreachable, consistent with other config/runtime errors

### Flag interaction and ordering
- `--only` filter applied before preflight — if zero tests match, exit 2 immediately without checking baseUrl
- All flag combinations are valid: `--only + --no-cache`, `--only + --headed`, `--no-cache + --headed`, all three together
- No combinations blocked or warned about
- Full startup order with all flags:
  1. Parse CLI args
  2. Load + validate config
  3. Validate API key
  4. Apply `--only` filter (exit 2 if zero matches)
  5. Preflight baseUrl check (if global baseUrl exists)
  6. Initialize MCP server
  7. Run tests

### Claude's Discretion
- Preflight HTTP method, timeout duration, and redirect-following behavior
- Glob matching library choice (picomatch, minimatch, or manual)
- Exact preflight error message wording beyond the decided format
- Internal flag plumbing (how flags flow from CLI to TestRunner/TestExecutor)

</decisions>

<specifics>
## Specific Ideas

- Header annotation lines should stack vertically (one per active flag) — this pattern scales to future flags like `--verbose` and `--dry-run` in Phases 6-7
- The "Running X of Y test(s)" format (showing both matched and total) provides immediate context about filter scope

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `cli.ts:29-41`: Commander setup with `exitOverride` — add `--only` and `--no-cache` as `.option()` calls
- `TestRunner.run()` (test-runner.ts:29-49): Iterates `config.tests` — filtering happens before this loop or early in it
- `TestExecutor.execute()` (test-executor.ts:58-84): Cache-first strategy — `--no-cache` skips the `cacheManager.load()` call at line 66
- `ConsoleReporter` (output/reporter.ts): Handles test output — needs skipped count support

### Established Patterns
- Error output: `Bun.write(Bun.stderr, ...)` with `pc.red("Error:")` prefix, then `process.exit(2)`
- Commander `exitOverride` catches parse errors and re-exits with code 2
- `baseUrl` resolution: `test.baseUrl ?? config.baseUrl ?? ""` in test-runner.ts:34
- Header banner: `console.log()` with `pc.bold("superghost")` in cli.ts:105-107

### Integration Points
- `cli.ts:42`: Action handler receives options — add `only?: string` and `noCache?: boolean`
- `cli.ts:105-107`: Header print — insert annotation lines for active flags
- `cli.ts:54-58`: After config load, before MCP init — insert preflight check and --only filter
- `RunResult` type (runner/types.ts): Needs `skipped` count field
- `TestExecutor` constructor: Needs `noCache` option to skip cache reads

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-infrastructure-flags*
*Context gathered: 2026-03-12*
