# Phase 5: Infrastructure + Flags - Research

**Researched:** 2026-03-12
**Domain:** CLI flag implementation, glob matching, HTTP preflight checks
**Confidence:** HIGH

## Summary

Phase 5 adds three independent CLI features to superghost: test filtering via `--only <pattern>`, cache bypass via `--no-cache`, and a preflight baseUrl reachability check. All three are well-understood problems with clear implementation paths in the existing codebase.

The codebase is well-structured for these additions. Commander.js 14.0.3 already handles `--no-cache` natively (boolean negation sets `cache: false`). Glob matching requires adding picomatch as a dependency (4.0.x, zero dependencies, supports `nocase` for case-insensitive matching). The preflight check uses Bun's native `fetch` with `AbortSignal.timeout` -- no additional dependencies needed. All three features integrate at well-defined points in `cli.ts` and touch minimal existing code.

**Primary recommendation:** Implement all three features in a single plan -- they are independent but share the same integration surface (cli.ts action handler, startup sequence). Use picomatch 4.x for glob matching. Use native `fetch` with HEAD method and 5-second timeout for preflight. Wire `--no-cache` through TestExecutor constructor option to skip cache reads.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Summary shows skipped count: "3 passed, 0 failed, 7 skipped"
- Header shows "Running 3 of 10 test(s)" with pattern annotation line: `(filtered by --only "login*")`
- Single pattern only -- one `--only` flag per run (users can use glob alternation `{login,checkout}*` for multi-pattern)
- Pattern matching is case-insensitive (test names are natural language)
- Zero-match exits 2 with bulleted list of available test names, same `pc.red("Error:")` style as other exit-2 errors
- Header shows `(cache disabled)` annotation line when `--no-cache` is active
- `--no-cache` skips cache reads but still writes cache entries on success
- All tests show source as `(ai)` when cache is bypassed -- no "cache skipped" annotation
- When combined with `--only`, annotations stack on separate lines
- Runs after config load + API key validation, before MCP server init -- fastest possible failure
- Checks global baseUrl only (per-test baseUrl preflight is out of scope per REQUIREMENTS.md)
- If no global baseUrl configured, skip preflight silently -- API-only test suites proceed directly
- Error message: `Error: baseUrl unreachable: {url}` followed by suggestion to check server/URL
- Exits 2 on unreachable, consistent with other config/runtime errors
- `--only` filter applied before preflight -- if zero tests match, exit 2 immediately without checking baseUrl
- All flag combinations are valid: `--only + --no-cache`, `--only + --headed`, `--no-cache + --headed`, all three together
- No combinations blocked or warned about
- Full startup order with all flags: Parse CLI args -> Load + validate config -> Validate API key -> Apply `--only` filter (exit 2 if zero matches) -> Preflight baseUrl check (if global baseUrl exists) -> Initialize MCP server -> Run tests

### Claude's Discretion
- Preflight HTTP method, timeout duration, and redirect-following behavior
- Glob matching library choice (picomatch, minimatch, or manual)
- Exact preflight error message wording beyond the decided format
- Internal flag plumbing (how flags flow from CLI to TestRunner/TestExecutor)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FLAG-04 | User can run `--only <pattern>` to filter tests by glob pattern, with exit 2 if zero tests match | picomatch 4.x with `nocase: true`; filter in cli.ts after config load; zero-match error with bulleted test names list |
| FLAG-03 | User can run `--no-cache` to bypass cache reads while still writing cache on success | Commander `--no-cache` sets `cache: false` natively; pass `noCache` option to TestExecutor; skip `cacheManager.load()` call |
| ERR-02 | CLI performs preflight HTTP reachability check on baseUrl before AI execution, exiting 2 with clear message if unreachable | Bun native `fetch` with HEAD + `AbortSignal.timeout(5000)`; insert between API key validation and MCP init |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| picomatch | ^4.0.3 | Glob pattern matching for `--only` filter | Zero dependencies, 4.5M+ weekly npm downloads, supports `nocase` option, blazing fast (4.4M ops/sec), used by Jest/Astro/Rollup/Vite |
| commander | 14.0.3 (existing) | CLI flag parsing | Already in project; natively handles `--no-*` boolean negation |
| picocolors | 1.1.1 (existing) | Colored error output | Already in project; used for `pc.red("Error:")` pattern |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @types/picomatch | ^4.0.2 | TypeScript type definitions for picomatch | picomatch 4.x ships as CJS without bundled types |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| picomatch | minimatch | minimatch is simpler but 7-26x slower, has CVE-2022-3517 (ReDoS), and no `nocase` option by default |
| picomatch | manual regex | Would miss edge cases in glob syntax (braces, extglobs, escaping); picomatch is battle-tested |
| picomatch | Bun.Glob | Bun.Glob is designed for filesystem operations, not string matching; API mismatch |

**Installation:**
```bash
bun add picomatch @types/picomatch
```

## Architecture Patterns

### Integration Point Map

All three features integrate into the existing `cli.ts` action handler. No new files needed -- the changes are surgical.

```
src/
├── cli.ts                    # Add --only/--no-cache options, filter logic, preflight check, header annotations
├── runner/
│   ├── test-executor.ts      # Add noCache option to skip cacheManager.load()
│   └── types.ts              # Add 'skipped' count to RunResult
└── output/
    └── reporter.ts           # Add skipped count to summary output
```

### Pattern 1: Commander `--no-*` Boolean Flag

**What:** Commander.js natively supports `--no-<name>` as a boolean negation flag. Defining `.option('--no-cache', 'description')` creates an option where `cache` defaults to `true` and is set to `false` when `--no-cache` is passed.

**When to use:** Any boolean flag where the default is "on" and the user wants to turn it "off."

**Example:**
```typescript
// Verified: Commander 14.0.3 tested locally
// Defining --no-cache alone (without --cache) makes cache default to true
program
  .option('--no-cache', 'Bypass cache reads (still writes on success)')
```
Result: `options.cache === true` by default, `options.cache === false` when `--no-cache` passed.

**CRITICAL:** The option name in code is `cache` (not `noCache`). Commander strips the `no-` prefix and inverts the boolean. The action handler receives `{ cache: boolean }`.

### Pattern 2: Pre-Execution Filter in CLI Action

**What:** Apply `--only` filter to `config.tests` array before passing to TestRunner. This is cleaner than filtering inside TestRunner because the filter is a CLI concern, not a runner concern.

**When to use:** When a CLI flag needs to reduce the set of tests before execution begins.

**Example:**
```typescript
import picomatch from 'picomatch';

// Filter tests by --only pattern (case-insensitive)
if (options.only) {
  const isMatch = picomatch(options.only, { nocase: true });
  const filtered = config.tests.filter(t => isMatch(t.name));

  if (filtered.length === 0) {
    const names = config.tests.map(t => `  - ${t.name}`).join('\n');
    await Bun.write(Bun.stderr,
      `${pc.red("Error:")} No tests match pattern "${options.only}"\n\nAvailable tests:\n${names}\n`
    );
    setTimeout(() => process.exit(2), 100);
    return;
  }

  // Track original count for header display
  const totalTests = config.tests.length;
  config.tests = filtered;
}
```

### Pattern 3: Preflight HTTP Check with Timeout

**What:** A HEAD request to the global baseUrl with a short timeout, placed between API key validation and MCP server init in the startup sequence.

**When to use:** Before expensive operations (MCP init, AI execution) to fail fast on obviously-broken configurations.

**Example:**
```typescript
// Verified: Bun fetch with AbortSignal.timeout tested locally
async function checkBaseUrlReachable(url: string): Promise<void> {
  try {
    await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
      redirect: 'follow',
    });
  } catch {
    await Bun.write(Bun.stderr,
      `${pc.red("Error:")} baseUrl unreachable: ${url}\n` +
      `  Check that the server is running and the URL is correct.\n`
    );
    setTimeout(() => process.exit(2), 100);
    return; // Needed because setTimeout is non-blocking
  }
}
```

**Note on method choice:** HEAD is preferred over GET because it avoids downloading response bodies. Some servers don't support HEAD, but for a reachability check, any response (even 405 Method Not Allowed) proves the server is reachable. The check should only fail on network errors (connection refused, DNS failure, timeout), not on HTTP status codes.

### Pattern 4: noCache Flag Plumbing Through TestExecutor

**What:** Pass a `noCache` boolean to TestExecutor constructor. When true, skip the `cacheManager.load()` call in `execute()` and go directly to the AI agent path.

**When to use:** When `--no-cache` is active, all tests should bypass cache reads.

**Example:**
```typescript
// In TestExecutor constructor options
interface TestExecutorOpts {
  // ... existing fields ...
  noCache?: boolean;
}

// In execute() method
async execute(testCase: string, baseUrl: string, testContext?: string): Promise<TestResult> {
  const start = Date.now();

  // Phase 1: Try cache replay (unless noCache)
  if (!this.noCache) {
    const cached = await this.cacheManager.load(testCase, baseUrl);
    if (cached) {
      const replay = await this.replayer.replay(cached.steps);
      if (replay.success) {
        return { /* cache result */ };
      }
      return this.executeWithAgent(testCase, baseUrl, start, true, testContext);
    }
  }

  // Phase 2: Direct to AI
  return this.executeWithAgent(testCase, baseUrl, start, false, testContext);
}
```

### Anti-Patterns to Avoid
- **Filtering inside TestRunner:** The `--only` flag is a CLI concern. Filtering should happen in cli.ts before TestRunner sees the tests. TestRunner should remain oblivious to filtering.
- **Checking HTTP status codes in preflight:** The goal is reachability, not health. A 500 response still proves the server is reachable. Only network-level failures (connection refused, timeout, DNS) should cause exit 2.
- **Using `cache` as both the option name and a concept:** Commander's `--no-cache` produces `options.cache: boolean`. When passing to TestExecutor, rename to `noCache: boolean` for clarity (invert the boolean).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Glob pattern matching | Custom regex from glob string | picomatch | Glob syntax has dozens of edge cases (braces, extglobs, POSIX brackets, escaping); picomatch handles all of them |
| `--no-*` flag parsing | Manual string manipulation | Commander's native `--no-*` support | Commander already does this correctly, including default value management |
| HTTP timeout | Manual `setTimeout` + `AbortController` | `AbortSignal.timeout()` | Built-in to Bun/web standards; cleaner than manual controller setup |

## Common Pitfalls

### Pitfall 1: Commander `--no-cache` Produces `cache`, Not `noCache`

**What goes wrong:** Expecting `options.noCache` when Commander actually sets `options.cache` (inverted boolean).
**Why it happens:** Commander strips the `no-` prefix and inverts the value. `--no-cache` means `cache = false`.
**How to avoid:** Access via `options.cache` in the action handler, then pass as `noCache: !options.cache` to TestExecutor.
**Warning signs:** `undefined` when checking `options.noCache`.

### Pitfall 2: Process.exit Inside setTimeout + Return Statement

**What goes wrong:** Code after `setTimeout(() => process.exit(2), 100)` continues executing because `process.exit` is deferred.
**Why it happens:** The existing pattern uses `setTimeout` to allow stderr to flush, but the function continues after.
**How to avoid:** Always `return` immediately after `setTimeout(() => process.exit(2), 100)` in the action handler. This is the established pattern in the codebase (see cli.ts lines 124-126, 130-131).
**Warning signs:** MCP server initialization running after a preflight failure.

### Pitfall 3: Picomatch Matching Against Wrong Field

**What goes wrong:** Matching against `test.case` (the test description) instead of `test.name` (the display name).
**Why it happens:** Both fields are strings on the test config object.
**How to avoid:** The `--only` pattern matches against `test.name` per the CONTEXT.md decision. The zero-match error should list `test.name` values.
**Warning signs:** Pattern `"login*"` not matching a test named "Login Flow" (but would match if case-insensitive and matching the right field).

### Pitfall 4: Preflight Check Failing on HTTP Error Status Codes

**What goes wrong:** Treating a 404 or 500 response as "unreachable."
**Why it happens:** Confusing "reachability" with "health." A server returning 500 is still reachable.
**How to avoid:** Only catch network-level exceptions from `fetch()`. Any successful HTTP response (any status code) means the server is reachable. The `catch` block handles: connection refused, DNS failure, timeout.
**Warning signs:** Tests failing with "baseUrl unreachable" when the server is actually running but returning error pages.

### Pitfall 5: RunResult.skipped Missing from Aggregation

**What goes wrong:** Adding `skipped` field to RunResult type but forgetting to compute it in `aggregateResults()`.
**Why it happens:** The skipped count is actually the difference between total configured tests and filtered tests -- it's computed at the CLI level, not in the runner.
**How to avoid:** Pass the skipped count from cli.ts (where filtering happens) to the runner/reporter. Options: (a) set it on RunResult before printing, or (b) pass to the header print directly since the skipped count is known at filter time.
**Warning signs:** Summary always showing "0 skipped."

### Pitfall 6: Preflight Running When No Global baseUrl Exists

**What goes wrong:** Preflight check throws on empty string or undefined URL.
**Why it happens:** `config.baseUrl` is optional and defaults to undefined. `fetch("")` or `fetch(undefined)` throws.
**How to avoid:** Guard with `if (config.baseUrl) { await checkBaseUrlReachable(config.baseUrl); }`. Skip silently for API-only test suites.
**Warning signs:** Crash with "Invalid URL" error for configs without baseUrl.

## Code Examples

### Complete CLI Option Registration
```typescript
// In cli.ts, add to the Commander chain before .action()
program
  .option('--only <pattern>', 'Run only tests matching glob pattern')
  .option('--no-cache', 'Bypass cache reads (still writes on success)')
```

The action handler type becomes:
```typescript
.action(async (options: { config: string; headed?: boolean; only?: string; cache: boolean }) => {
  // cache defaults to true, set to false by --no-cache
```

### Complete Header Output with Annotations
```typescript
// After filtering and before runner.run()
const totalTests = originalTestCount; // saved before filtering
const runningTests = config.tests.length;

let header = `\n${pc.bold("superghost")} v${pkg.version} / Running ${runningTests}`;
if (options.only) {
  header += ` of ${totalTests}`;
}
header += ` test(s)...\n`;
console.log(header);

if (options.only) {
  console.log(pc.dim(`  (filtered by --only "${options.only}")`));
}
if (!options.cache) {
  console.log(pc.dim(`  (cache disabled)`));
}
if (options.only || !options.cache) {
  console.log(''); // blank line after annotations
}
```

### Complete Summary with Skipped Count
```typescript
// In reporter.ts onRunComplete, add skipped to output
console.log(`    Skipped: ${data.skipped}`);
```

### Startup Sequence with All Features
```typescript
// Inside action handler, after config load and API key validation:

// 1. Apply --only filter
let totalTestCount = config.tests.length;
if (options.only) {
  const isMatch = picomatch(options.only, { nocase: true });
  config.tests = config.tests.filter(t => isMatch(t.name));

  if (config.tests.length === 0) {
    const names = /* all test names from original config */;
    await Bun.write(Bun.stderr, `${pc.red("Error:")} No tests match pattern "${options.only}"\n\nAvailable tests:\n${names}\n`);
    setTimeout(() => process.exit(2), 100);
    return;
  }
}

// 2. Preflight baseUrl check (only if global baseUrl configured)
if (config.baseUrl) {
  try {
    await fetch(config.baseUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
      redirect: 'follow',
    });
  } catch {
    await Bun.write(Bun.stderr,
      `${pc.red("Error:")} baseUrl unreachable: ${config.baseUrl}\n` +
      `  Check that the server is running and the URL is correct.\n`
    );
    setTimeout(() => process.exit(2), 100);
    return;
  }
}

// 3. Print header with annotations
// ...

// 4. Initialize MCP server (expensive operation -- only after preflight passes)
mcpManager = new McpManager({ /* ... */ });
await mcpManager.initialize();

// 5. Create TestExecutor with noCache option
const executor = new TestExecutor({
  /* existing opts */
  noCache: !options.cache,
});

// 6. Run tests
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| minimatch for glob | picomatch (or micromatch) | 2023+ | 7-26x faster, no ReDoS vulnerability |
| AbortController + setTimeout | AbortSignal.timeout() | Web standard, Bun native | Cleaner timeout handling, one-liner |
| Manual `--no-*` parsing | Commander native `--no-*` | Commander 7+ | Zero custom code for negated booleans |

## Open Questions

1. **Should preflight accept any HTTP status or only 2xx/3xx?**
   - What we know: The goal is reachability, not health. Connection refused, DNS failure, and timeout clearly mean unreachable.
   - What's unclear: Should a server returning 403 Forbidden be considered "reachable"?
   - Recommendation: Accept any HTTP response as reachable. Only catch network exceptions. A 403 proves the server is running. This is the simplest and most correct approach -- preflight is not a health check.

2. **Should the preflight timeout be configurable?**
   - What we know: 5 seconds is a reasonable default for reachability checks.
   - What's unclear: Users with slow networks or distant servers might need longer.
   - Recommendation: Hardcode 5 seconds for now. This is a preflight check, not a production health monitor. If users report issues, it can become configurable later.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | bunfig.toml (`[test] root = "."`) |
| Quick run command | `bun test tests/unit/` |
| Full suite command | `bun test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FLAG-04 | `--only` filters tests by glob, zero-match exits 2 | unit + integration | `bun test tests/unit/runner/test-runner.test.ts -t "only"` | Needs new tests |
| FLAG-04 | picomatch case-insensitive matching | unit | `bun test tests/unit/infra/filter.test.ts` | Wave 0 |
| FLAG-03 | `--no-cache` skips cache reads, still writes | unit | `bun test tests/unit/runner/test-executor.test.ts -t "noCache"` | Needs new tests |
| ERR-02 | Preflight exits 2 on unreachable baseUrl | unit + integration | `bun test tests/unit/infra/preflight.test.ts` | Wave 0 |
| ERR-02 | Preflight skips when no global baseUrl | unit | `bun test tests/unit/infra/preflight.test.ts -t "skip"` | Wave 0 |
| FLAG-04 | `--only` zero-match shows available test names via CLI | integration | `bun test tests/integration/cli-pipeline.test.ts -t "only"` | Needs new tests |
| FLAG-03 | `--no-cache` CLI flag accepted | integration | `bun test tests/integration/cli-pipeline.test.ts -t "no-cache"` | Needs new tests |
| ERR-02 | Unreachable baseUrl exits 2 via CLI | integration | `bun test tests/integration/cli-pipeline.test.ts -t "unreachable"` | Needs new tests |

### Sampling Rate
- **Per task commit:** `bun test tests/unit/`
- **Per wave merge:** `bun test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/infra/preflight.test.ts` -- covers ERR-02 preflight logic
- [ ] `tests/unit/infra/filter.test.ts` -- covers FLAG-04 glob matching logic (optional if filter is inline in cli.ts)
- [ ] New test cases in `tests/unit/runner/test-executor.test.ts` -- covers FLAG-03 noCache behavior
- [ ] New test cases in `tests/unit/runner/test-runner.test.ts` -- covers FLAG-04 skipped count in RunResult
- [ ] New test cases in `tests/unit/output/reporter.test.ts` -- covers skipped display in summary
- [ ] New test cases in `tests/integration/cli-pipeline.test.ts` -- covers all three features end-to-end
- [ ] Framework install: none needed (bun:test built-in)
- [ ] `bun add picomatch @types/picomatch` -- dependency for FLAG-04

## Sources

### Primary (HIGH confidence)
- Local codebase inspection -- cli.ts, test-runner.ts, test-executor.ts, reporter.ts, types.ts, schema.ts, loader.ts
- Local Commander 14.0.3 verification -- tested `--no-cache` behavior, confirmed `options.cache` is `false`
- Local Bun fetch verification -- tested `AbortSignal.timeout(5000)` with unreachable hosts, DNS failures
- picomatch GitHub README -- API methods, `nocase` option documentation

### Secondary (MEDIUM confidence)
- npm registry -- picomatch 4.0.3 latest version confirmed via `npm view`
- WebSearch -- picomatch vs minimatch performance benchmarks (4.4M ops/sec vs 632K ops/sec)
- WebSearch -- Commander `--no-*` pattern documentation

### Tertiary (LOW confidence)
- picomatch 4.x ESM/TypeScript bundling details -- README did not explicitly confirm ESM exports; @types/picomatch 4.0.2 exists on npm

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- picomatch is the standard glob library, Commander `--no-*` verified locally, Bun fetch verified locally
- Architecture: HIGH -- integration points identified precisely by line number in existing code, pattern matches established conventions
- Pitfalls: HIGH -- all pitfalls derived from direct code inspection and local testing

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (30 days -- stable domain, no fast-moving APIs)
