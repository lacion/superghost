# Phase 6: Dry-Run - Research

**Researched:** 2026-03-12
**Domain:** CLI flag implementation, cache introspection, output formatting
**Confidence:** HIGH

## Summary

Phase 6 adds a `--dry-run` flag to the `superghost` CLI that lists all test names with their cache/AI source and validates config without launching a browser or spending AI tokens. This is a self-contained feature with no new dependencies -- it composes existing subsystems (Commander flag registration, `loadConfig()`, `inferProvider()`/`validateApiKey()`, `CacheManager.load()`, `picocolors` formatting) with a new early-return branch in the `cli.ts` action handler.

The implementation surface is narrow: one new Commander `.option()`, a conditional branch after config validation + API key check that initializes CacheManager (without MCP/browser), iterates tests to check cache status via `CacheManager.load()`, prints a numbered list, and exits 0. The critical design constraint is ordering: config validation and API key presence check run normally (exit 2 on failure), but preflight baseUrl reachability and everything after it (MCP, model, executor, runner) are skipped entirely.

**Primary recommendation:** Implement as a single early-return block in `cli.ts` action handler, inserted after `validateApiKey()` and before the preflight check. No new source files needed -- the output formatting is simple enough to inline.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Output format: Simple numbered list. Each line: `1. Login flow               (cache)`. Source labels: `cache` / `ai` (terse). Output to stdout. Summary: plain text line `4 tests, 2 cached`
- Header style: Reuse normal run header (`superghost vX.X.X` + `Running N test(s)`). Add `(dry-run)` as stacked annotation line
- Flag interactions: `--dry-run` + `--only` applies filter first then lists matching. `--dry-run` + `--no-cache` silently ignored (show true cache status). `--dry-run` + `--headed` silently ignored. No combinations rejected/warned
- Summary & exit: `N tests, M cached`. Exit 0 on success. Exit 2 on config errors
- API key handling: Presence check only (env var exists and non-empty). Full provider inference runs. Missing key exits 2
- Preflight: Skip baseUrl reachability check entirely in dry-run mode

### Claude's Discretion
- Exact implementation of where dry-run branches in cli.ts (early return vs conditional blocks)
- Whether to create a separate dry-run output function or inline in the action handler
- Column alignment approach for test name + source padding
- Color/dim styling choices for the test list output

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FLAG-01 | User can run `--dry-run` to list test names and validate config without executing AI or launching browser | Commander `.option("--dry-run", ...)` registration, early-return branch in action handler after validateApiKey(), CacheManager.load() for source detection, formatted numbered list output |
</phase_requirements>

## Standard Stack

### Core (already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| commander | ^14.0.3 | CLI option parsing, `--dry-run` flag | Already used for all flags |
| picocolors | ^1.1.1 | Terminal color output with auto TTY detection | Already used for all CLI output |
| picomatch | ^4.0.3 | Glob matching for `--only` filter | Already used, reused when `--dry-run` + `--only` |
| CacheManager | internal | Cache lookup via `.load(testCase, baseUrl)` | Already exists, returns `CacheEntry | null` |

### Supporting
No new libraries needed. This phase composes existing subsystems.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline output in cli.ts | Separate dry-run module | Unnecessary for ~30 lines of formatting logic; inline keeps the flow readable |
| String padding for alignment | cli-table3, columnify | Over-engineered for a simple numbered list; `String.padEnd()` suffices |

## Architecture Patterns

### Recommended Insertion Point

The dry-run branch should be inserted in `cli.ts` action handler at line ~71 (after `validateApiKey(provider)`) and before the preflight check (line ~92). This is the exact boundary where config validation completes and execution begins.

```
cli.ts action handler flow (with dry-run):
  1. loadConfig()              -- validates YAML, Zod schema (exit 2 on failure)
  2. inferProvider() + validateApiKey()  -- checks API key env var (exit 2 on failure)
  3. Apply --only filter       -- filters config.tests (exit 2 on zero match)
  4. >>> IF --dry-run: CacheManager + list tests + summary + exit 0 <<<
  5. Preflight baseUrl check   -- SKIPPED in dry-run
  6. createModel()             -- SKIPPED in dry-run
  7. MCP init                  -- SKIPPED in dry-run
  8. TestExecutor/TestRunner   -- SKIPPED in dry-run
```

### Pattern: Early Return Block

**What:** A single `if (options.dryRun) { ... return; }` block containing cache lookup, output formatting, and `process.exit(0)`.
**When to use:** When a flag fundamentally changes the action from "execute tests" to "preview tests."
**Why not conditional blocks throughout:** Avoids scattering `if (!dryRun)` guards across 80+ lines. A single early-return is clearer and easier to maintain.

**Example:**
```typescript
// After validateApiKey(provider) and --only filter

if (options.dryRun) {
  const cacheManager = new CacheManager(config.cacheDir);

  // Print header (same as normal run)
  let header = `\n${pc.bold("superghost")} v${pkg.version} / Running ${config.tests.length}`;
  if (options.only) {
    header += ` of ${totalTestCount}`;
  }
  header += ` test(s)...\n`;
  console.log(header);

  // Stacked annotations
  console.log(pc.dim("  (dry-run)"));
  if (options.only) {
    console.log(pc.dim(`  (filtered by --only "${options.only}")`));
  }
  console.log("");

  // Determine max test name length for padding
  const maxNameLen = Math.max(...config.tests.map(t => t.name.length));
  let cachedCount = 0;

  for (let i = 0; i < config.tests.length; i++) {
    const test = config.tests[i];
    const baseUrl = test.baseUrl ?? config.baseUrl ?? "";
    const entry = await cacheManager.load(test.case, baseUrl);
    const source = entry ? "cache" : "ai";
    if (entry) cachedCount++;

    const paddedName = test.name.padEnd(maxNameLen);
    console.log(`  ${i + 1}. ${paddedName}  (${source})`);
  }

  console.log("");
  console.log(`${config.tests.length} tests, ${cachedCount} cached`);

  setTimeout(() => process.exit(0), 100);
  return;
}
```

### Pattern: Commander Boolean Flag

**What:** Register `--dry-run` using Commander's `.option()` method with auto camelCase.
**Established pattern:** Follows `--headed` exactly.

```typescript
.option("--dry-run", "List tests and validate config without executing")
```

Commander auto-converts `--dry-run` to `options.dryRun: boolean | undefined`. The options type needs updating:

```typescript
(options: {
  config: string;
  headed?: boolean;
  only?: string;
  cache: boolean;
  dryRun?: boolean;  // new
})
```

### Anti-Patterns to Avoid
- **Scattering dry-run guards:** Don't add `if (!dryRun)` before preflight, before MCP init, before model creation, etc. Use a single early-return block instead.
- **Creating `--dry-run` + `--no-cache` warning:** The decision says silently ignore -- no warning, no rejection.
- **Making a live API call for key validation:** The decision says presence check only. `validateApiKey()` already does exactly this (checks `Bun.env[envVar]` is truthy). No change needed there.
- **Calling `cacheManager.migrateV1Cache()`:** This is a write operation (deletes v1 files). Dry-run should only read. Skip the migration call in dry-run.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cache status check | Custom file-system scan | `CacheManager.load(testCase, baseUrl)` | Already handles hash generation, file lookup, JSON parsing, null on miss |
| API key validation | Custom env var checking | `validateApiKey(provider)` from model-factory.ts | Already maps provider to env var, throws descriptive error |
| Glob filtering | Custom string matching | `picomatch` (already wired in cli.ts) | Already used for `--only`, handles edge cases |
| Column alignment | Terminal table library | `String.padEnd(maxLen)` | Simple enough for a numbered list |

**Key insight:** Every subsystem dry-run needs already exists. This phase is pure composition -- no new modules, no new patterns.

## Common Pitfalls

### Pitfall 1: Cache Key Uses test.case, Not test.name
**What goes wrong:** Using `test.name` (display name) instead of `test.case` (the actual test description) for cache lookup produces wrong results.
**Why it happens:** Confusion between `test.name` (what's displayed) and `test.case` (what's hashed for cache key).
**How to avoid:** Call `cacheManager.load(test.case, baseUrl)` -- matching exactly how `TestExecutor` calls it during real runs.
**Warning signs:** Cache shows "ai" for tests that should be cached.

### Pitfall 2: baseUrl Resolution Must Match Real Runs
**What goes wrong:** Using only `config.baseUrl` and ignoring per-test `test.baseUrl` overrides produces wrong cache lookups.
**Why it happens:** Forgetting that TestRunner resolves `test.baseUrl ?? config.baseUrl ?? ""`.
**How to avoid:** Use the same resolution: `const baseUrl = test.baseUrl ?? config.baseUrl ?? ""`.
**Warning signs:** Tests with per-test baseUrl show wrong source.

### Pitfall 3: Exit via setTimeout Pattern
**What goes wrong:** Calling `process.exit(0)` directly can truncate stdout buffered output.
**Why it happens:** Node/Bun stdout is asynchronous; exit before flush drops data.
**How to avoid:** Use the established `setTimeout(() => process.exit(0), 100)` pattern already used throughout cli.ts.
**Warning signs:** Truncated output, especially in piped/CI scenarios.

### Pitfall 4: --no-cache Flag Interaction
**What goes wrong:** Respecting `--no-cache` in dry-run mode (treating all tests as "ai") would give misleading output.
**Why it happens:** `--no-cache` means "bypass cache reads during execution" but dry-run doesn't execute.
**How to avoid:** Ignore `options.cache` in the dry-run branch. Always call `cacheManager.load()` to show true cache status.
**Warning signs:** All tests showing "ai" when `--no-cache` is combined with `--dry-run`.

### Pitfall 5: Annotation Stacking Order
**What goes wrong:** Printing `(dry-run)` after `(filtered by --only "...")` breaks visual consistency.
**Why it happens:** Not following the established stacking convention.
**How to avoid:** `(dry-run)` should be the first annotation, then `(filtered by --only "...")`. The `(cache disabled)` annotation is NOT shown in dry-run since `--no-cache` is ignored.
**Warning signs:** Inconsistent header appearance between dry-run and normal mode.

## Code Examples

Verified patterns from the existing codebase:

### Commander Flag Registration (from cli.ts line 37-38)
```typescript
// Source: src/cli.ts lines 37-38
.option("--headed", "Run browser in headed mode (visible browser window)")
.option("--only <pattern>", "Run only tests matching glob pattern")
// Add:
.option("--dry-run", "List tests and validate config without executing")
```

### Header Output (from cli.ts lines 143-158)
```typescript
// Source: src/cli.ts lines 143-158
let header = `\n${pc.bold("superghost")} v${pkg.version} / Running ${config.tests.length}`;
if (options.only) {
  header += ` of ${totalTestCount}`;
}
header += ` test(s)...\n`;
console.log(header);

// Stacked annotations:
if (options.only) {
  console.log(pc.dim(`  (filtered by --only "${options.only}")`));
}
if (!options.cache) {
  console.log(pc.dim("  (cache disabled)"));
}
```

### CacheManager.load() (from cache-manager.ts lines 101-110)
```typescript
// Source: src/cache/cache-manager.ts lines 101-110
async load(testCase: string, baseUrl: string): Promise<CacheEntry | null> {
  const hash = CacheManager.hashKey(testCase, baseUrl);
  const filePath = join(this.cacheDir, `${hash}.json`);
  try {
    return await Bun.file(filePath).json() as CacheEntry;
  } catch {
    return null;
  }
}
```

### baseUrl Resolution (from test-runner.ts line 34)
```typescript
// Source: src/runner/test-runner.ts line 34
const baseUrl = test.baseUrl ?? this.config.baseUrl ?? "";
```

### Error Exit Pattern (from cli.ts lines 82-88)
```typescript
// Source: src/cli.ts lines 82-88 (zero-match filter example)
await Bun.write(Bun.stderr, `${pc.red("Error:")} message\n`);
setTimeout(() => process.exit(2), 100);
return;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No preview capability | `--dry-run` flag | Phase 6 (this phase) | Users can validate configs and preview test plans without cost |

**Nothing deprecated/outdated:** This phase introduces new functionality using established project patterns.

## Open Questions

1. **v1 Cache Migration in Dry-Run**
   - What we know: `cacheManager.migrateV1Cache()` deletes v1 cache files. Dry-run should be read-only.
   - What's unclear: Whether there's a risk of stale v1 entries producing misleading source labels.
   - Recommendation: Skip `migrateV1Cache()` in dry-run mode. v1 entries have `version: 1` and would be read by `.load()` but show as "cache" -- this is acceptable since it reflects truth (a cache file does exist). The next real run will migrate them.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | None needed -- Bun discovers `tests/**/*.test.ts` automatically |
| Quick run command | `bun test tests/integration/cli-pipeline.test.ts` |
| Full suite command | `bun test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FLAG-01a | `--dry-run` flag accepted by Commander | integration | `bun test tests/integration/cli-pipeline.test.ts -t "dry-run"` | Needs new tests |
| FLAG-01b | Dry-run lists test names with source labels | integration | `bun test tests/integration/cli-pipeline.test.ts -t "dry-run"` | Needs new tests |
| FLAG-01c | Dry-run validates config (exit 2 on invalid) | integration | `bun test tests/integration/cli-pipeline.test.ts -t "dry-run"` | Partially covered (config validation tests exist, but not with --dry-run flag) |
| FLAG-01d | Dry-run exits 2 on missing API key | integration | `bun test tests/integration/cli-pipeline.test.ts -t "dry-run"` | Needs new tests |
| FLAG-01e | Dry-run skips preflight (no baseUrl reachability check) | integration | `bun test tests/integration/cli-pipeline.test.ts -t "dry-run"` | Needs new tests |
| FLAG-01f | `--dry-run` + `--only` filters then lists | integration | `bun test tests/integration/cli-pipeline.test.ts -t "dry-run"` | Needs new tests |
| FLAG-01g | `--dry-run` shows in --help output | integration | `bun test tests/integration/cli-pipeline.test.ts -t "help"` | Extend existing help test |
| FLAG-01h | Dry-run exits 0 on success | integration | `bun test tests/integration/cli-pipeline.test.ts -t "dry-run"` | Needs new tests |

### Sampling Rate
- **Per task commit:** `bun test tests/integration/cli-pipeline.test.ts`
- **Per wave merge:** `bun test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] New test cases in `tests/integration/cli-pipeline.test.ts` covering dry-run scenarios (FLAG-01a through FLAG-01h)
- [ ] Test fixture with pre-populated cache directory for verifying cache/ai source detection (or create cache entries programmatically in test setup)

## Sources

### Primary (HIGH confidence)
- **Codebase inspection** - `src/cli.ts` (192 lines), `src/cache/cache-manager.ts` (151 lines), `src/agent/model-factory.ts` (71 lines), `src/config/loader.ts` (76 lines), `src/runner/test-runner.ts` (67 lines)
- **Existing tests** - `tests/integration/cli-pipeline.test.ts` (180 lines) provides the exact test harness (`runCli()`) and assertion patterns
- **Test fixtures** - `tests/fixtures/valid-config.yaml`, `tests/fixtures/multi-test-config.yaml`, `tests/fixtures/no-baseurl-config.yaml`

### Secondary (MEDIUM confidence)
- None needed -- this phase is pure composition of existing subsystems

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No new dependencies. All libraries already in use and verified by reading source.
- Architecture: HIGH - Insertion point clearly identified by reading cli.ts line-by-line. Early-return pattern is straightforward.
- Pitfalls: HIGH - All pitfalls derived from reading actual cache key generation and baseUrl resolution code.

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable -- no external dependencies changing)
