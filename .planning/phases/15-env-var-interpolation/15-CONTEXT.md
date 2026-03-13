# Phase 15: Env Var Interpolation - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can inject environment variables into YAML configs using `${VAR}` syntax so CI pipelines pass secrets and environment-specific values without hardcoding. Supports `${VAR:-default}` fallbacks and `${VAR:?error}` required vars. Interpolation runs post-YAML-parse on the JS object. Resolved secrets do not leak into cache files.

</domain>

<decisions>
## Implementation Decisions

### Secret leakage prevention
- Cache stores template form (`${VAR}`) for interpolated fields, not resolved values — secrets never touch disk
- Cache key hash includes both template string AND resolved value — cache correctly invalidates when env var value changes, but resolved value is not recoverable from the hex digest
- No scrubbing of resolved values in stderr error messages or verbose output — stderr is ephemeral, users need actual values for debugging
- Interpolation function returns `{ resolved: Config, templates: Map<path, templateString> }` so cache manager knows which fields to store as template form vs literal

### Interpolation scope
- All string fields are interpolated — no allowlist, no exceptions
- Deep walk: recursively traverse entire parsed config object, interpolating every string value regardless of nesting depth (covers test-level baseUrl, context, name, case)
- Partial substitution supported: `https://${HOST}:${PORT}/api` works with multiple `${VAR}` references mixed with literal text
- Pipeline position: read file → YAML parse → **interpolate** → Zod validate (env vars resolve before schema validation)

### Error reporting
- Batch all missing env vars into a single error: "Missing env vars:\n  1. API_KEY: API_KEY must be set\n  2. BASE_URL: not set"
- Bare `${VAR}` where VAR is unset is an error — forces explicit intent: `${VAR:-}` for intentional empty, `${VAR:-default}` for fallback, `${VAR:?msg}` for required
- Custom `:?` error messages shown inline alongside regular missing var errors in the same batch
- Reuse exit code 2 and existing `ConfigLoadError` class — missing env vars are a config error, same category as missing file or invalid YAML

### Escape hatch
- `$${VAR}` (double-dollar) in config → literal `${VAR}` in output — shell-like convention
- Invalid syntax like `${}` (empty), `${123}` (starts with number) treated as errors, not passed through — catches typos
- No special dry-run display for interpolated values — dry-run shows resolved values as-is

### Claude's Discretion
- Regex pattern design for matching `${VAR}`, `${VAR:-default}`, `${VAR:?msg}`, and `$${...}` escape
- Deep walk implementation (recursive function vs iterative)
- Template map data structure (Map vs plain object, path format)
- How to thread template map through to CacheManager
- Unit test organization and edge case coverage

</decisions>

<specifics>
## Specific Ideas

- The loadConfig pipeline in `src/config/loader.ts` has a clean 3-layer structure — interpolation slots in as Layer 2.5 (after YAML parse, before Zod validate)
- Cache hash approach: `hash(template + resolved)` means CacheManager.hashKey needs the template form for the interpolated portion and the resolved form for the hash — both available from the template map
- Follows the existing error pattern: ConfigLoadError with numbered issue list (like Zod validation errors)
- Explicitly excluded by REQUIREMENTS.md: no `.env` file auto-loading, no recursive env var expansion (`${A}` referencing `${B}`)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ConfigLoadError` (config/loader.ts): Existing error class for all config failures — reuse for env var errors
- `loadConfig()` (config/loader.ts): Clean 3-layer pipeline (read → YAML → Zod) — interpolation inserts between layers 2 and 3
- `CacheManager.hashKey()` (cache/cache-manager.ts): Static method hashing `testCase + baseUrl` — needs to accept template+resolved for env var fields
- `CacheManager.save()` (cache/cache-manager.ts): Stores `testCase` and `baseUrl` in CacheEntry — needs template map awareness to store template form

### Established Patterns
- Bun-native YAML parsing (`YAML.parse` from bun) — interpolation works on the parsed JS object, not raw string
- Zod schema validation with numbered error messages — env var errors should follow same numbered list format
- SHA-256 hash with 16-char hex digest for cache keys — extend input string to include both template and resolved forms

### Integration Points
- `src/config/loader.ts:48-54`: After `YAML.parse(content)` and before `ConfigSchema.safeParse(raw)` — insert interpolation call
- `src/cache/cache-manager.ts:27-48`: `hashKey()` — needs awareness of template vs resolved values for env-var-containing fields
- `src/cache/cache-manager.ts:56-96`: `save()` — needs template map to store template form instead of resolved values for interpolated fields
- `src/cli.ts`: Passes config to runner — resolved config used for execution, template map threaded to cache operations

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 15-env-var-interpolation*
*Context gathered: 2026-03-13*
