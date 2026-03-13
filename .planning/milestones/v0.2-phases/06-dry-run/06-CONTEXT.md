# Phase 6: Dry-Run - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Add `--dry-run` flag that lists all test names with their cache/AI source and validates config (YAML parsing, Zod schema, API key presence) without launching a browser or spending AI tokens. Preflight baseUrl check is skipped in dry-run mode.

</domain>

<decisions>
## Implementation Decisions

### Output format
- Simple numbered list, not a table or icon-based format
- Each line: number, test name, source in parentheses — e.g. `1. Login flow               (cache)`
- Source labels: `cache` / `ai` (terse, matches internal terminology)
- Output goes to stdout (it's the result, not progress)
- Summary is a plain text line, not a bordered box — e.g. `4 tests, 2 cached`

### Header style
- Reuse normal run header with stacked annotation: same `superghost vX.X.X` + `Running N test(s)` format
- Add `(dry-run)` as a stacked annotation line, consistent with `(filtered by --only "...")` and `(cache disabled)` patterns from Phase 5

### Flag interactions
- `--dry-run` + `--only`: Apply filter first, then list only matching tests with sources. Header shows `Running X of Y test(s)` with both annotations stacked
- `--dry-run` + `--no-cache`: Silently ignore `--no-cache` — show true cache status. `--no-cache` affects execution behavior which doesn't happen in dry-run
- `--dry-run` + `--headed`: Silently ignore `--headed` — no browser launches in dry-run
- No flag combinations are rejected or warned about

### Summary & exit behavior
- Summary line: `N tests, M cached` — tells user how many would hit AI
- Exit 0 on successful dry-run (config valid, tests listable)
- Exit 2 on config errors (same as normal mode — dry-run never lies about whether a real run would succeed)

### API key handling
- Presence check only — verify env var exists and is non-empty, no live API call
- Full provider inference (provider→env-var mapping) runs same as normal mode to check the correct key
- Missing API key exits 2, same as normal mode — consistent with "never lies" principle

### Preflight
- Skip preflight baseUrl reachability check entirely in dry-run mode (per ROADMAP.md dependency note)

### Claude's Discretion
- Exact implementation of where dry-run branches in cli.ts (early return vs conditional blocks)
- Whether to create a separate dry-run output function or inline in the action handler
- Column alignment approach for test name + source padding
- Color/dim styling choices for the test list output

</decisions>

<specifics>
## Specific Ideas

- Annotation stacking pattern from Phase 5 scales naturally — `(dry-run)` just becomes another line in the stack
- The "4 tests, 2 cached" summary implicitly tells users "2 will need AI" without spelling it out

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CacheManager.load(testCase, baseUrl)`: Call per test to check cache status without replaying — returns `CacheEntry | null`
- `CacheManager.hashKey()`: Deterministic hash generation with v2 prefix and normalization
- Commander `.option()` pattern: Add `--dry-run` same way as `--headed`, `--only`, `--no-cache`
- `picocolors` (`pc`): Terminal color output with auto TTY detection
- `picomatch`: Already used for `--only` glob matching — reuse in dry-run + --only combo

### Established Patterns
- Boolean flags: `--headed` as `.option("--headed", ...)` → `options.headed?: boolean`
- Negated flags: `--no-cache` → `options.cache: boolean` (Commander convention)
- Error output: `Bun.write(Bun.stderr, pc.red("Error:") + ...)` then `process.exit(2)`
- Header annotations: `console.log(pc.dim("  (annotation text)"))` stacked after "Running N test(s)"
- Config validation: `loadConfig()` → Zod safeParse → ConfigLoadError on failure

### Integration Points
- `cli.ts` action handler: Add `dryRun?: boolean` to options type
- `cli.ts` lines 91-104: Wrap preflight check with `if (!options.dryRun)` guard
- `cli.ts` lines 106-161: Skip MCP init, model creation, TestExecutor, TestRunner when dry-run
- `cli.ts` lines 143-158: Add `(dry-run)` annotation to header
- CacheManager: Initialize cache subsystem to call `.load()` for source detection, but skip writes

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 06-dry-run*
*Context gathered: 2026-03-12*
