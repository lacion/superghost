# Phase 4: Foundation - Research

**Researched:** 2026-03-11
**Domain:** CLI exit code taxonomy, cache key normalization (Unicode/whitespace/URL), cache version migration
**Confidence:** HIGH

## Summary

Phase 4 locks three foundational behaviors: POSIX-conventional exit codes (0/1/2), resilient cache keys that survive whitespace and Unicode formatting differences, and a clean break from v1 cache entries via a version prefix. The existing codebase is well-structured for these changes -- the modifications are surgical, touching `cli.ts` (exit code refactoring), `CacheManager.hashKey()` (normalization pipeline), `CacheEntry` type (version bump), and a new startup cleanup routine.

All three requirements map to well-understood JavaScript/Bun APIs with no external dependencies needed. `String.normalize("NFC")` is a native method that reliably collapses NFD/NFC equivalents. `new URL()` handles hostname lowercasing and default port stripping natively. The only subtlety is trailing slash handling on paths (not stripped by `new URL()`), which needs a manual `.replace(/\/+$/, "")` step.

**Primary recommendation:** Implement as three focused changes: (1) exit code refactoring in `cli.ts`, (2) normalization pipeline in `CacheManager.hashKey()` with version prefix, (3) v1 cache cleanup in `CacheManager` startup. All are unit-testable with zero external dependencies.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Exit Code Taxonomy:** Exit 0 = all tests pass. Exit 1 = any test failure (including unexpected errors within a test execution). Exit 2 = config errors (ConfigLoadError, missing API key), infrastructure crashes (MCP server dies mid-suite), and all unhandled exceptions. The `throw error` fallback in cli.ts (line 124) becomes a catch-all: print generic "Unexpected error: {message}" to stderr, exit 2. Clean error messages -- no exit code in the text. Use Commander.js `program.error(msg, { exitCode: 2 })` where appropriate.
- **Cache Key Normalization:** Apply Unicode NFC normalization via `String.normalize("NFC")`. Collapse ALL whitespace (newlines, tabs, multiple spaces) to single space via `.replace(/\s+/g, ' ').trim()`. Case-preserving: different casing = different tests = different cache keys. Normalize baseUrl: strip trailing slash, lowercase hostname (URL normalization is well-defined). Version prefix: `v2|{normalizedTestCase}|{normalizedBaseUrl}` before hashing.
- **Cache Migration:** CacheEntry `version` field bumps from 1 to 2 in new cache files. On startup, silently scan `.superghost-cache/` and delete files with `version: 1`. No user-facing notice. Orphaned v1 files cleaned up automatically.

### Claude's Discretion
- Exact error message wording for each exit 2 scenario
- Whether to log deleted v1 cache count at debug/verbose level (future --verbose could show this)
- Internal implementation of URL normalization (new URL() vs regex)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ERR-01 | CLI exits 0 for all tests pass, 1 for any test failure, 2 for config/runtime errors (POSIX convention) | Exit code refactoring in `cli.ts` catch block; Commander.js `program.error()` for parse-time errors; verified Commander.js `error(message, { exitCode })` API exists |
| CACHE-01 | Cache keys are normalized (whitespace collapse, Unicode NFC, case-preserved) so formatting differences don't bust cache | `String.normalize("NFC")` verified in Bun; `.replace(/\s+/g, ' ').trim()` verified; `new URL()` hostname lowercasing verified; trailing slash needs manual strip |
| CACHE-02 | Cache keys include version prefix (`v2|...`) for clean break from v1 keys | Prefix added before hashing in `hashKey()`; v1 cache cleanup via startup scan of `.superghost-cache/` directory |
</phase_requirements>

## Standard Stack

### Core (Already in Project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Bun runtime | >=1.2.0 | Test runner, crypto, file I/O | Project runtime; `Bun.CryptoHasher`, `Bun.file()`, `Bun.write()` |
| Commander.js | ^14.0.3 | CLI framework | Already used; has `program.error(msg, { exitCode })` for structured exit codes |
| picocolors | ^1.1.1 | Terminal colors | Already used for `pc.red("Error:")` in stderr messages |

### Supporting (No New Dependencies)
| API | Source | Purpose | When to Use |
|-----|--------|---------|-------------|
| `String.prototype.normalize("NFC")` | Built-in | Unicode canonical composition | Cache key normalization for test case strings |
| `new URL(baseUrl)` | Built-in | URL parsing and hostname normalization | Cache key normalization for baseUrl |
| `node:fs/promises` readdir | Built-in | Directory scanning | v1 cache cleanup on startup |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `new URL()` for URL normalization | Regex-based normalization | `new URL()` is safer: handles edge cases (IDN, default ports, encoded chars) that regex misses. Use `new URL()`. |
| `readdir` + JSON parse for v1 scan | `Bun.Glob("*.json").scan()` | Glob is marginally cleaner but adds Bun-specific API surface; `readdir` is more portable. Either works. |

**Installation:** No new dependencies required.

## Architecture Patterns

### Change Map
```
src/
  cache/
    cache-manager.ts    # hashKey() normalization + migrateV1Cache() + save() version bump
    types.ts            # CacheEntry.version: 1 | 2
  cli.ts                # Exit code refactoring: exit 1 -> exit 2 for config/runtime errors
tests/
  unit/
    cache/
      cache-manager.test.ts   # New: normalization tests, v1 migration tests
  integration/
    cli-pipeline.test.ts      # Update: expect exit 2 (not exit 1) for config errors
```

### Pattern 1: Normalization Pipeline in hashKey()
**What:** A deterministic pipeline that normalizes inputs before hashing to ensure equivalent strings produce identical cache keys.
**When to use:** Every call to `hashKey()` applies the full pipeline.
**Example:**
```typescript
// Source: Verified against Bun 1.2+ behavior
static hashKey(testCase: string, baseUrl: string): string {
  // Step 1: Unicode NFC normalization (e + combining accent -> e-acute)
  const normalizedCase = testCase.normalize("NFC").replace(/\s+/g, " ").trim();

  // Step 2: URL normalization (lowercase hostname, strip trailing slash, strip default port)
  let normalizedUrl: string;
  try {
    const url = new URL(baseUrl);
    // new URL() already lowercases hostname and strips default ports
    // Manually strip trailing slash from pathname
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    normalizedUrl = url.href.replace(/\/+$/, "");
  } catch {
    // Fallback for non-URL baseUrl values (shouldn't happen with Zod validation, but defensive)
    normalizedUrl = baseUrl.replace(/\/+$/, "").toLowerCase();
  }

  // Step 3: Version-prefixed input
  const input = `v2|${normalizedCase}|${normalizedUrl}`;
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(input);
  return hasher.digest("hex").slice(0, 16);
}
```

### Pattern 2: Exit Code Refactoring
**What:** Restructure the `cli.ts` catch block to map error types to POSIX exit codes.
**When to use:** All error paths in the CLI action handler.
**Example:**
```typescript
// Source: Existing cli.ts pattern + Commander.js ErrorOptions API
} catch (error) {
  if (mcpManager) {
    await mcpManager.close().catch(() => {});
  }
  await pm.killAll();

  if (error instanceof ConfigLoadError) {
    await Bun.write(Bun.stderr, `${pc.red("Error:")} ${error.message}\n`);
    setTimeout(() => process.exit(2), 100);  // was exit(1)
    return;
  }
  if (error instanceof Error && error.message.startsWith("Missing API key")) {
    await Bun.write(Bun.stderr, `${pc.red("Error:")} ${error.message}\n`);
    setTimeout(() => process.exit(2), 100);  // was exit(1)
    return;
  }
  // Catch-all: unexpected errors -> exit 2
  const msg = error instanceof Error ? error.message : String(error);
  await Bun.write(Bun.stderr, `${pc.red("Unexpected error:")} ${msg}\n`);
  setTimeout(() => process.exit(2), 100);  // was throw error
}
```

### Pattern 3: v1 Cache Migration (Startup Cleanup)
**What:** On CacheManager initialization, scan the cache directory for v1 entries and delete them.
**When to use:** Called once before tests run, on CacheManager construction or first load.
**Example:**
```typescript
// Source: Bun file I/O APIs verified
async migrateV1Cache(): Promise<void> {
  try {
    const files = await readdir(this.cacheDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const entry = await Bun.file(join(this.cacheDir, file)).json();
        if (entry?.version === 1) {
          await Bun.file(join(this.cacheDir, file)).delete();
        }
      } catch {
        // Skip corrupted files silently
      }
    }
  } catch {
    // Cache dir doesn't exist yet -- nothing to migrate
  }
}
```

### Anti-Patterns to Avoid
- **Normalizing case in test case strings:** The decision is explicitly case-preserving. "Login" and "login" are different tests, different cache keys. Do NOT lowercase test case text.
- **Using `url.href` directly without trailing slash strip:** `new URL("http://localhost:3000").href` returns `"http://localhost:3000/"` (trailing slash added). This must be stripped to match user expectations.
- **Reading v1 cache entries and trying to migrate data:** The decision is to DELETE v1 files, not convert them. Cache miss + re-execution is the migration strategy (self-healing).
- **Printing exit codes in error messages:** The decision says "clean error messages -- no exit code in the text (users check `$?` if they need it)."

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| URL hostname normalization | Regex to lowercase hostname | `new URL(baseUrl)` constructor | Handles IDN, punycode, default port stripping, encoded characters automatically |
| Unicode normalization | Character-by-character decomposition | `String.normalize("NFC")` | Built-in V8/JSC engine support; handles all Unicode composition rules |
| Atomic file writes | Manual `fs.writeFile` | Existing `Bun.write(tmp) + rename(tmp, final)` pattern | Already implemented in CacheManager.save(); prevents corrupted cache files |

**Key insight:** All normalization needs are covered by built-in JavaScript APIs. No libraries needed.

## Common Pitfalls

### Pitfall 1: new URL() Adds Trailing Slash to Host-Only URLs
**What goes wrong:** `new URL("http://localhost:3000").href` returns `"http://localhost:3000/"` -- a trailing slash is added even when the user didn't include one.
**Why it happens:** The URL spec says an empty path is equivalent to `/`, and `href` includes it.
**How to avoid:** After constructing the URL, strip the trailing slash: `url.href.replace(/\/+$/, "")`.
**Warning signs:** Cache key mismatch between `http://localhost:3000` and `http://localhost:3000/` in the same config.

### Pitfall 2: Path Trailing Slashes Are NOT Equivalent
**What goes wrong:** `new URL("http://x.com/api/v1").href` !== `new URL("http://x.com/api/v1/").href`. Trailing slashes on paths are preserved by `new URL()`.
**Why it happens:** Unlike host-only URLs, path trailing slashes have semantic meaning in HTTP (different resources).
**How to avoid:** The decision says "strip trailing slash" -- apply `.replace(/\/+$/, "")` AFTER `new URL()` normalization on the full href (or on pathname). This is a deliberate choice for cache key purposes, not general URL handling.
**Warning signs:** Two configs pointing to the same backend but one has `/api/v1` and the other `/api/v1/` producing different cache keys.

### Pitfall 3: Existing Integration Tests Expect Exit 1 for Config Errors
**What goes wrong:** `cli-pipeline.test.ts` currently asserts `expect(exitCode).toBe(1)` for config errors and missing API key. After this phase, those should be exit 2.
**Why it happens:** The tests were written before the exit code taxonomy was defined.
**How to avoid:** Update all integration test assertions when changing exit codes. Search for `toBe(1)` in cli-pipeline tests.
**Warning signs:** Test suite passes locally but assertions don't match the new exit code semantics.

### Pitfall 4: CacheEntry Type Literal Change Breaks Existing save()
**What goes wrong:** Changing `CacheEntry.version` type from `1` to `1 | 2` (or just `2`) requires updating the `save()` method which hardcodes `version: 1`.
**Why it happens:** TypeScript literal types enforce exact values.
**How to avoid:** Change `CacheEntry` interface to accept `version: 1 | 2` for reading compatibility, but `save()` always writes `version: 2`. Create a separate `CacheEntryV1` type if needed for migration reading.
**Warning signs:** TypeScript compile errors in `save()` after changing the type.

### Pitfall 5: Race Condition in v1 Cache Cleanup
**What goes wrong:** If cleanup runs concurrently with cache reads (unlikely in current sequential runner, but future-proofing), a file could be deleted between readdir and read.
**Why it happens:** File system operations are not atomic across multiple calls.
**How to avoid:** Wrap individual file operations in try/catch (already shown in the pattern above). The current sequential runner makes this a non-issue, but defensive coding prevents future bugs.
**Warning signs:** Sporadic "file not found" errors during test execution.

## Code Examples

Verified patterns from direct Bun runtime testing:

### Unicode NFC Normalization (Verified)
```typescript
// Verified: Bun 1.2+ runtime, 2026-03-11
const nfd = "caf\u0065\u0301";  // e + combining acute accent (NFD)
const nfc = "caf\u00e9";         // pre-composed e-acute (NFC)

nfd.normalize("NFC") === nfc.normalize("NFC");  // true
// Both produce "cafe" with composed e-acute, length 4
```

### Whitespace Collapse (Verified)
```typescript
// Verified: Bun 1.2+ runtime, 2026-03-11
"check\tlogin\tform".replace(/\s+/g, " ").trim()     // "check login form"
"check\nlogin\nform".replace(/\s+/g, " ").trim()     // "check login form"
"check   login   form".replace(/\s+/g, " ").trim()   // "check login form"
// All produce identical string
```

### URL Normalization (Verified)
```typescript
// Verified: Bun 1.2+ runtime, 2026-03-11
new URL("http://EXAMPLE.com/path").href              // "http://example.com/path"  (hostname lowercased)
new URL("https://example.com:443/path").href         // "https://example.com/path" (default port stripped)
new URL("http://localhost:3000").href                 // "http://localhost:3000/"   (trailing slash ADDED)
new URL("http://localhost:3000/api/v1/").href         // "http://localhost:3000/api/v1/" (trailing slash KEPT)

// Therefore: must strip trailing slash manually for cache key consistency
const normalize = (url: string) => {
  const u = new URL(url);
  return u.href.replace(/\/+$/, "");
};
normalize("http://localhost:3000")   // "http://localhost:3000"
normalize("http://localhost:3000/")  // "http://localhost:3000"
```

### Commander.js error() with exitCode (Verified via Types)
```typescript
// Source: commander/typings/index.d.ts line 558
// error(message: string, errorOptions?: ErrorOptions): never;
// ErrorOptions: { code?: string; exitCode?: number }
program.error("Config file not found", { exitCode: 2 });
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw string concatenation for hash input | Version-prefixed normalized input | This phase | Cache keys include `v2\|` prefix; old keys naturally miss |
| Exit 1 for all errors | Exit 2 for config/runtime, exit 1 for test failures | This phase | CI pipelines can distinguish "tests failed" from "something is misconfigured" |
| No Unicode handling | NFC normalization | This phase | YAML formatting differences (editors, OS) don't bust cache |

**Deprecated/outdated after this phase:**
- v1 cache entries: Automatically deleted on startup; `version: 1` in CacheEntry type retained only for migration reading

## Open Questions

1. **Commander.js `program.error()` vs manual `process.exit(2)`**
   - What we know: Commander's `error()` method writes to stderr and calls `process.exit()` (or `exitOverride`). However, the current codebase uses `setTimeout(() => process.exit(code), 100)` to allow async cleanup.
   - What's unclear: Whether `program.error()` should be used for parse-time errors (missing `--config`) or only for runtime errors caught in the action handler.
   - Recommendation: Use `program.error()` only if Commander doesn't already handle its own parse errors correctly. For runtime errors in the action handler, continue using the manual `setTimeout(() => process.exit(2), 100)` pattern to allow async cleanup. Commander already exits with code 1 for missing required options; this may need to be overridden to exit 2 via `exitOverride`.

2. **Commander's default exit code for missing required options**
   - What we know: Commander exits with code 1 when `--config` is not provided (it's a `requiredOption`).
   - What's unclear: Whether this should be changed to exit 2 to match the taxonomy (missing config = config error).
   - Recommendation: Use Commander's `exitOverride()` to intercept CommanderError and re-exit with code 2 for validation errors. This is a small addition but ensures consistency.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bun test (built-in) |
| Config file | `bunfig.toml` (root = ".") |
| Quick run command | `bun test tests/unit/cache/cache-manager.test.ts` |
| Full suite command | `bun test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ERR-01 | CLI exits 0 for pass, 1 for failure, 2 for config/runtime | integration | `bun test tests/integration/cli-pipeline.test.ts -x` | Exists (needs updates) |
| ERR-01 | Unhandled exception catch-all exits 2 | integration | `bun test tests/integration/cli-pipeline.test.ts -x` | Exists (needs new test case) |
| CACHE-01 | Whitespace-different strings produce same hash | unit | `bun test tests/unit/cache/cache-manager.test.ts -x` | Exists (needs new tests) |
| CACHE-01 | NFD vs NFC Unicode produce same hash | unit | `bun test tests/unit/cache/cache-manager.test.ts -x` | Exists (needs new tests) |
| CACHE-01 | URL trailing slash / hostname case produce same hash | unit | `bun test tests/unit/cache/cache-manager.test.ts -x` | Exists (needs new tests) |
| CACHE-01 | Different test case casing produces different hash | unit | `bun test tests/unit/cache/cache-manager.test.ts -x` | Exists (needs new test) |
| CACHE-02 | v2 prefix produces different hash from v1 input | unit | `bun test tests/unit/cache/cache-manager.test.ts -x` | Exists (needs new test) |
| CACHE-02 | v1 cache files are deleted on startup | unit | `bun test tests/unit/cache/cache-manager.test.ts -x` | Needs new tests |

### Sampling Rate
- **Per task commit:** `bun test tests/unit/cache/cache-manager.test.ts tests/integration/cli-pipeline.test.ts`
- **Per wave merge:** `bun test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/cache/cache-manager.test.ts` -- needs new describe blocks for normalization tests (whitespace, Unicode NFC, URL normalization, case-preserving, v2 prefix)
- [ ] `tests/unit/cache/cache-manager.test.ts` -- needs new describe block for v1 cache migration/cleanup
- [ ] `tests/integration/cli-pipeline.test.ts` -- needs exit code assertion updates (1 -> 2 for config errors) and new test cases for catch-all exit 2

*(Existing test infrastructure and fixtures are sufficient; no framework install or conftest needed)*

## Sources

### Primary (HIGH confidence)
- Direct Bun runtime verification -- `String.normalize("NFC")`, `new URL()` behavior, `Bun.CryptoHasher`, `readdir` -- all tested in Bun 1.2+ on 2026-03-11
- Commander.js type definitions -- `node_modules/commander/typings/index.d.ts` line 558: `error(message: string, errorOptions?: ErrorOptions): never`
- Existing codebase -- `src/cache/cache-manager.ts`, `src/cli.ts`, `src/cache/types.ts`, `src/config/loader.ts`

### Secondary (MEDIUM confidence)
- [MDN: String.prototype.normalize()](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/normalize) -- NFC/NFD normalization forms documentation
- [MDN: URL API](https://developer.mozilla.org/en-US/docs/Web/API/URL) -- URL constructor normalization behavior
- [Node.js URL documentation](https://nodejs.org/api/url.html) -- URL parsing spec compliance
- [URI normalization - Wikipedia](https://en.wikipedia.org/wiki/URI_normalization) -- Canonical normalization rules (scheme/host lowercase, default port removal)

### Tertiary (LOW confidence)
- None -- all findings verified against primary sources or direct runtime testing.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No new dependencies; all built-in JavaScript/Bun APIs verified by direct execution
- Architecture: HIGH -- Surgical changes to 3-4 files; all change sites identified with line numbers in CONTEXT.md
- Pitfalls: HIGH -- URL trailing slash behavior and integration test assertion drift both verified empirically
- Validation: HIGH -- Existing test infrastructure covers all requirements; only new test cases needed, not new tooling

**Research date:** 2026-03-11
**Valid until:** 2026-06-11 (90 days -- stable APIs, no moving targets)
