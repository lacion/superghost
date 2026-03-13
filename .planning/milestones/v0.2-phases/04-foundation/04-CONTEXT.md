# Phase 4: Foundation - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Lock the POSIX exit code taxonomy (0/1/2) and make cache keys resilient to whitespace, Unicode, and URL formatting differences. This is foundational infrastructure that all subsequent phases depend on.

</domain>

<decisions>
## Implementation Decisions

### Exit Code Taxonomy
- Exit 0: All tests pass
- Exit 1: Any test failure (including unexpected errors within a test execution)
- Exit 2: Config errors (ConfigLoadError, missing API key), infrastructure crashes (MCP server dies mid-suite), and all unhandled exceptions
- The `throw error` fallback in cli.ts (line 124) becomes a catch-all: print generic "Unexpected error: {message}" to stderr, exit 2
- Clean error messages — no exit code in the text (users check `$?` if they need it)
- Use Commander.js `program.error(msg, { exitCode: 2 })` where appropriate

### Cache Key Normalization
- Apply Unicode NFC normalization via `String.normalize("NFC")`
- Collapse ALL whitespace (newlines, tabs, multiple spaces) to single space via `.replace(/\s+/g, ' ').trim()`
- Case-preserving: different casing = different tests = different cache keys
- Normalize baseUrl: strip trailing slash, lowercase hostname (URL normalization is well-defined)
- Version prefix: `v2|{normalizedTestCase}|{normalizedBaseUrl}` before hashing

### Cache Migration
- CacheEntry `version` field bumps from 1 to 2 in new cache files
- On startup, silently scan `.superghost-cache/` and delete files with `version: 1`
- No user-facing notice — self-healing handles the re-execution transparently
- Orphaned v1 files cleaned up automatically, no manual action needed

### Claude's Discretion
- Exact error message wording for each exit 2 scenario
- Whether to log deleted v1 cache count at debug/verbose level (future --verbose could show this)
- Internal implementation of URL normalization (new URL() vs regex)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — research and discussion covered the decisions thoroughly. The POSIX exit code convention (0/1/2) is the guiding principle. Cache normalization follows the "YAML formatting shouldn't affect test behavior" principle.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CacheManager.hashKey()` (src/cache/cache-manager.ts:21-26): Single change site for normalization — add normalize step before `hasher.update()`
- `CacheEntry` type (src/cache/types.ts): Already has `version: 1` field — bump to 2
- `ConfigLoadError` class (src/config/loader.ts): Already exists and is caught in cli.ts

### Established Patterns
- Atomic write-then-rename in CacheManager.save() — no changes needed
- `Bun.CryptoHasher("sha256")` for hashing — stays the same, just normalized input
- `Bun.write(Bun.stderr, ...)` for error output in cli.ts — reuse for exit 2 messages

### Integration Points
- `cli.ts:108-124`: Catch block needs refactoring — currently exits 1 for ConfigLoadError and missing API key, needs to exit 2
- `cli.ts:124`: `throw error` becomes catch-all exit 2
- `cli.ts:106`: `result.failed > 0 ? 1 : 0` stays as-is for test pass/fail
- `CacheManager.load()`: Startup hook point for v1 cache cleanup (scan + delete before tests run)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-foundation*
*Context gathered: 2026-03-11*
