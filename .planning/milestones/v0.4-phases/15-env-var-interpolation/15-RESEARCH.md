# Phase 15: Env Var Interpolation - Research

**Researched:** 2026-03-13
**Domain:** Post-parse environment variable interpolation in YAML config
**Confidence:** HIGH

## Summary

This phase adds `${VAR}`, `${VAR:-default}`, and `${VAR:?error}` interpolation to YAML config values. The design is well-constrained by user decisions: interpolation runs post-YAML-parse on the JS object (not raw string), bare unset `${VAR}` is an error, and resolved secrets never persist to cache files. The implementation is a pure-TypeScript string interpolation engine with no external dependencies.

The core work is: (1) a regex-based interpolation function that deep-walks a parsed config object, (2) integration into `loadConfig()` between YAML parse and Zod validation, (3) cache-awareness so `CacheManager.save()` stores template forms instead of resolved values, and (4) comprehensive unit tests. No third-party libraries are needed -- this is a focused string processing task.

**Primary recommendation:** Build a single `src/config/interpolate.ts` module with `interpolateConfig()` that returns `{ resolved, templates }`, insert it into `loadConfig()` after YAML parse, and thread the template map to cache operations.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Cache stores template form (`${VAR}`) for interpolated fields, not resolved values -- secrets never touch disk
- Cache key hash includes both template string AND resolved value -- cache correctly invalidates when env var value changes, but resolved value is not recoverable from the hex digest
- No scrubbing of resolved values in stderr error messages or verbose output -- stderr is ephemeral, users need actual values for debugging
- Interpolation function returns `{ resolved: Config, templates: Map<path, templateString> }` so cache manager knows which fields to store as template form vs literal
- All string fields are interpolated -- no allowlist, no exceptions
- Deep walk: recursively traverse entire parsed config object, interpolating every string value regardless of nesting depth
- Partial substitution supported: `https://${HOST}:${PORT}/api` works with multiple `${VAR}` references mixed with literal text
- Pipeline position: read file -> YAML parse -> **interpolate** -> Zod validate (env vars resolve before schema validation)
- Batch all missing env vars into a single error with numbered list
- Bare `${VAR}` where VAR is unset is an error -- forces explicit intent
- Custom `:?` error messages shown inline alongside regular missing var errors in the same batch
- Reuse exit code 2 and existing `ConfigLoadError` class
- `$${VAR}` (double-dollar) in config -> literal `${VAR}` in output (escape hatch)
- Invalid syntax like `${}` (empty), `${123}` (starts with number) treated as errors
- No dry-run display distinction for interpolated values

### Claude's Discretion
- Regex pattern design for matching `${VAR}`, `${VAR:-default}`, `${VAR:?msg}`, and `$${...}` escape
- Deep walk implementation (recursive function vs iterative)
- Template map data structure (Map vs plain object, path format)
- How to thread template map through to CacheManager
- Unit test organization and edge case coverage

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CFG-01 | User can use `${VAR}` syntax in YAML config values to interpolate environment variables | Core interpolation engine with regex matching and `process.env` lookup |
| CFG-02 | User can use `${VAR:-default}` syntax to provide fallback values for unset env vars | Regex capture group for `:-` separator and default value extraction |
| CFG-03 | User can use `${VAR:?error message}` syntax to require env vars with descriptive error on missing | Regex capture group for `:?` separator, error collection, and batched ConfigLoadError |
| CFG-04 | Env var interpolation runs post-YAML-parse (on JS object) so YAML-special characters in values don't break parsing | Deep-walk function operating on parsed JS object, not raw YAML string |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| None (built-in) | N/A | Regex-based string interpolation | Pure string processing, no dependencies needed |
| Bun CryptoHasher | built-in | Extended cache key hashing | Already used in CacheManager.hashKey() |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | ^4.3.6 | Already in project -- validation runs AFTER interpolation | Schema validation of resolved config |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom regex engine | dotenv-expand, envsub | Over-engineered -- those handle `.env` files and recursive expansion, both explicitly out of scope |
| Custom deep-walk | lodash.cloneDeepWith | Single utility not worth a dependency; recursive function is ~15 lines |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure
```
src/config/
  interpolate.ts    # NEW: interpolateConfig() + interpolateString() + deepWalk()
  loader.ts         # MODIFIED: insert interpolation between YAML parse and Zod validate
  schema.ts         # UNCHANGED
  types.ts          # MODIFIED: add InterpolationResult type
src/cache/
  cache-manager.ts  # MODIFIED: save() accepts template map, stores template form for interpolated fields
  types.ts          # MODIFIED: CacheEntry may store template form for testCase/baseUrl
```

### Pattern 1: Post-Parse Interpolation Pipeline
**What:** Interpolation operates on the parsed JS object, not raw YAML string. This is the critical architectural decision that solves CFG-04.
**When to use:** Always -- this is the only safe approach.
**Example:**
```typescript
// src/config/interpolate.ts

export interface InterpolationResult {
  resolved: unknown;  // The config object with all ${VAR} replaced
  templates: Map<string, string>;  // path -> original template string
  errors: string[];  // Collected error messages for batch reporting
}

/**
 * Interpolate all ${VAR} references in a parsed config object.
 * Walks every string value, replaces env var references, tracks templates.
 */
export function interpolateConfig(
  obj: unknown,
  env: Record<string, string | undefined> = process.env,
): InterpolationResult {
  const templates = new Map<string, string>();
  const errors: string[] = [];
  const resolved = deepWalk(obj, "", templates, errors, env);
  return { resolved, templates, errors };
}
```

### Pattern 2: Regex-Based Token Matching
**What:** Single regex handles all syntax variants including escape.
**When to use:** For parsing `${VAR}`, `${VAR:-default}`, `${VAR:?msg}`, and `$${...}`.
**Example:**
```typescript
// Match patterns:
// $${...}          -> escaped, produces literal ${...}
// ${VAR}           -> simple lookup
// ${VAR:-default}  -> lookup with fallback
// ${VAR:?message}  -> lookup with required error
//
// Variable names: [A-Za-z_][A-Za-z0-9_]* (POSIX-compliant)
const ENV_VAR_PATTERN = /\$\$\{[^}]*\}|\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:[-?])([^}]*))?\}/g;

// Invalid patterns to catch typos:
const INVALID_PATTERN = /\$\{(?:\}|(\d)[^}]*\})/g;
```

### Pattern 3: Deep Walk with Path Tracking
**What:** Recursive traversal that tracks JSON-path-style keys for the template map.
**When to use:** To process every string in the config regardless of nesting depth.
**Example:**
```typescript
function deepWalk(
  value: unknown,
  path: string,
  templates: Map<string, string>,
  errors: string[],
  env: Record<string, string | undefined>,
): unknown {
  if (typeof value === "string") {
    return interpolateString(value, path, templates, errors, env);
  }
  if (Array.isArray(value)) {
    return value.map((item, i) => deepWalk(item, `${path}[${i}]`, templates, errors, env));
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = deepWalk(val, path ? `${path}.${key}` : key, templates, errors, env);
    }
    return result;
  }
  return value; // numbers, booleans, null pass through
}
```

### Pattern 4: Template Map for Cache Leakage Prevention
**What:** The template map records which config paths contained env var references and their original template strings. CacheManager uses this to store `${API_KEY}` instead of the resolved secret.
**When to use:** Every cache save operation when env vars are in play.
**Example:**
```typescript
// In loadConfig, after interpolation:
// templates = Map { "baseUrl" => "${BASE_URL}", "tests[0].baseUrl" => "${API_HOST}:${API_PORT}" }

// In CacheManager.save(), for testCase and baseUrl fields:
// If templates.has("tests[i].case") -> store template form
// If templates.has("baseUrl") or templates.has("tests[i].baseUrl") -> store template form
```

### Anti-Patterns to Avoid
- **Pre-parse interpolation (string replacement on raw YAML):** YAML special chars in env values (`apiKey: ${KEY}` where KEY contains `:`) would break YAML parsing. The entire point of CFG-04 is to avoid this.
- **Lazy/on-demand interpolation:** All env vars must resolve upfront so missing vars are caught early in a single batched error, not at test execution time.
- **Recursive env var expansion:** Explicitly out of scope per REQUIREMENTS.md. `${A}` where A=`${B}` should produce the literal string `${B}`.
- **`.env` file loading:** Explicitly out of scope per REQUIREMENTS.md.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML parsing | Custom parser | `YAML.parse` from Bun (already used) | Already in the codebase, handles all edge cases |
| Schema validation | Custom type checking | Zod (already used) | Runs after interpolation, catches type mismatches from env vars |
| Cache hashing | Custom hash | Bun.CryptoHasher (already used) | Extend existing `hashKey()` method |

**Key insight:** This phase is intentionally dependency-free. The interpolation engine is pure string processing (~80-120 lines of code). The complexity is in the integration points (loader, cache), not the algorithm itself.

## Common Pitfalls

### Pitfall 1: Regex Greediness with Nested Braces
**What goes wrong:** A greedy `${.*}` pattern matches too much when env var values or defaults contain `}`.
**Why it happens:** Default regex quantifiers are greedy.
**How to avoid:** Use `[^}]*` (non-greedy, non-brace) for the content inside `${}`. Note: this means default values and error messages cannot contain `}`. This is an acceptable limitation for config values.
**Warning signs:** Tests with `}` in default values failing.

### Pitfall 2: Escape Sequence Ordering
**What goes wrong:** If `$${VAR}` is not handled FIRST in the regex alternation, it gets partially matched as `$` + `${VAR}`.
**Why it happens:** Regex alternation tries left-to-right; the escape pattern must come first.
**How to avoid:** Put `\$\$\{[^}]*\}` as the first alternative in the regex OR pattern. In the replacement function, check for the `$$` prefix first.
**Warning signs:** `$${VAR}` producing resolved value instead of literal `${VAR}`.

### Pitfall 3: Template Map Path Format Mismatch with Cache Fields
**What goes wrong:** Template map uses `tests[0].baseUrl` but cache save code looks for `tests.0.baseUrl`.
**Why it happens:** Inconsistent path conventions between deep-walk and cache access.
**How to avoid:** Define path format once and document it. Use bracket notation for arrays: `tests[0].baseUrl`.
**Warning signs:** Interpolated cache fields storing resolved values instead of templates.

### Pitfall 4: Zod `.url()` Validation After Interpolation
**What goes wrong:** `baseUrl: ${BASE_URL}` where `BASE_URL=http://localhost:3000` works fine, but during development/testing, forgetting to set the env var causes Zod to reject the unresolved `${BASE_URL}` string as an invalid URL.
**Why it happens:** Interpolation errors are supposed to be caught BEFORE Zod runs. If interpolation silently passes through unresolved vars, Zod gives confusing errors.
**How to avoid:** Bare `${VAR}` with unset var is an error (per user decision), so interpolation will throw before Zod ever sees the template string. This is already the correct design.
**Warning signs:** Zod error messages about "Invalid url" when the real problem is a missing env var.

### Pitfall 5: Cache Invalidation When Env Var Value Changes
**What goes wrong:** Env var value changes but cache still serves stale results because the hash only included the template string.
**Why it happens:** Hash was computed from template form only.
**How to avoid:** Per user decision, hash includes BOTH template string AND resolved value. The resolved value changes the hash, invalidating the cache entry. Template form is stored in the entry for display, but the hash uses both.
**Warning signs:** Changing an env var value does not trigger cache miss.

### Pitfall 6: Non-String Values in Parsed YAML
**What goes wrong:** YAML parses `port: 3000` as a number, `headless: true` as boolean. Deep walk must skip these.
**Why it happens:** YAML type coercion.
**How to avoid:** Deep walk only processes `typeof value === "string"`. Numbers, booleans, null, undefined pass through unchanged.
**Warning signs:** TypeError when calling `.replace()` on a number.

## Code Examples

### Interpolation String Processing
```typescript
function interpolateString(
  value: string,
  path: string,
  templates: Map<string, string>,
  errors: string[],
  env: Record<string, string | undefined>,
): string {
  // Check for invalid patterns first
  const invalidMatch = value.match(/\$\{(\}|\d)/);
  if (invalidMatch) {
    errors.push(`Invalid env var syntax at ${path}: found in "${value}"`);
    return value;
  }

  let hasEnvRef = false;
  const result = value.replace(
    /\$\$\{([^}]*)\}|\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:[-?])([^}]*))?\}/g,
    (match, escaped, varName, modifier, modValue) => {
      // Handle escape: $${VAR} -> ${VAR}
      if (escaped !== undefined) {
        return `\${${escaped}}`;
      }

      hasEnvRef = true;
      const envValue = env[varName];

      if (envValue !== undefined && envValue !== "") {
        return envValue;
      }

      // Unset or empty
      if (modifier === ":-") {
        return modValue;  // Use default
      }
      if (modifier === ":?") {
        errors.push(`${varName}: ${modValue}`);
        return match;  // Keep original for error context
      }
      // Bare ${VAR} with unset value -> error
      errors.push(`${varName}: not set`);
      return match;
    },
  );

  if (hasEnvRef) {
    templates.set(path, value);  // Store original template
  }

  return result;
}
```

### Integration into loadConfig
```typescript
export async function loadConfig(filePath: string): Promise<{
  config: Config;
  templates: Map<string, string>;
}> {
  // Layer 1: Read file (existing)
  // Layer 2: YAML parsing (existing)

  // Layer 2.5: Env var interpolation (NEW)
  const { resolved, templates, errors } = interpolateConfig(raw);
  if (errors.length > 0) {
    const issues = errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n");
    throw new ConfigLoadError(
      `Missing env vars (${errors.length} issue${errors.length > 1 ? "s" : ""})\n${issues}`
    );
  }

  // Layer 3: Zod validation (existing, now uses resolved object)
  const result = ConfigSchema.safeParse(resolved);
  // ...
}
```

**Important note on return type change:** `loadConfig()` currently returns `Promise<Config>`. Adding `templates` to the return value changes the API. Two approaches:
1. Return `{ config, templates }` -- breaking change, requires updating all callers (cli.ts)
2. Add an optional `templateMap` parameter that gets populated as a side-effect -- avoids breaking the return type but less clean

Recommendation: Approach 1 (return object) since there is only one caller (`cli.ts` line 102). The change is minimal.

### Cache Template Awareness
```typescript
// In CacheManager.save(), accept optional template map:
async save(
  testCase: string,
  baseUrl: string,
  steps: CachedStep[],
  diagnostics: { ... },
  templates?: Map<string, string>,
): Promise<void> {
  // For hash key: use both template AND resolved values
  // For stored entry: use template form when available
  const storedTestCase = templates?.get("tests[?].case") ?? testCase;  // simplified
  const storedBaseUrl = templates?.get("baseUrl") ?? baseUrl;
  // ...
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pre-parse string replacement | Post-parse object walk | Standard practice | Avoids YAML special char issues |
| `dotenv` + `dotenv-expand` | Explicit env var passing | N/A | Simpler, no `.env` file ambiguity |
| Shell-style `envsubst` | In-process interpolation | N/A | Better error messages, type safety |

**Deprecated/outdated:**
- `dotenv-expand`: Handles recursive expansion which is explicitly out of scope. Unnecessary dependency.

## Open Questions

1. **Template map path format for array items**
   - What we know: Deep walk tracks paths like `tests[0].baseUrl`. Cache save receives a specific test's `baseUrl` string, not the index.
   - What's unclear: How to efficiently look up whether a specific test's baseUrl was interpolated, given that `cli.ts` iterates tests and passes `test.baseUrl ?? config.baseUrl` to cache.
   - Recommendation: The template map should use dot-path notation. For cache save, the caller (test executor or cli.ts) should check if the baseUrl it is about to cache came from an interpolated field and pass the template form instead. Simplest approach: `loadConfig` returns templates, cli.ts checks `templates.has("baseUrl")` or `templates.has(\`tests[${i}].baseUrl\`)` before passing to executor.

2. **CacheManager.hashKey() signature change**
   - What we know: Currently `hashKey(testCase, baseUrl)`. Needs to hash both template and resolved for env-var fields.
   - What's unclear: Whether to change the signature or have the caller pre-compute the hash input.
   - Recommendation: Add optional `templateTestCase` and `templateBaseUrl` params. If provided, hash includes both: `v2|${templateCase}|${resolvedCase}|${templateUrl}|${resolvedUrl}`. If not provided (backward compat), behaves as before.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | None needed -- bun:test works out of the box |
| Quick run command | `bun test tests/unit/config/interpolate.test.ts` |
| Full suite command | `bun test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CFG-01 | `${VAR}` resolves to env var value | unit | `bun test tests/unit/config/interpolate.test.ts -t "simple"` | Wave 0 |
| CFG-02 | `${VAR:-default}` uses fallback when unset | unit | `bun test tests/unit/config/interpolate.test.ts -t "default"` | Wave 0 |
| CFG-03 | `${VAR:?msg}` exits code 2 with error when unset | unit | `bun test tests/unit/config/interpolate.test.ts -t "required"` | Wave 0 |
| CFG-04 | YAML-special chars in env values don't break parsing | unit | `bun test tests/unit/config/interpolate.test.ts -t "special"` | Wave 0 |
| N/A | Bare `${VAR}` unset is error | unit | `bun test tests/unit/config/interpolate.test.ts -t "bare"` | Wave 0 |
| N/A | `$${VAR}` escape produces literal `${VAR}` | unit | `bun test tests/unit/config/interpolate.test.ts -t "escape"` | Wave 0 |
| N/A | Invalid syntax `${}`, `${123}` are errors | unit | `bun test tests/unit/config/interpolate.test.ts -t "invalid"` | Wave 0 |
| N/A | Partial substitution with multiple vars | unit | `bun test tests/unit/config/interpolate.test.ts -t "partial"` | Wave 0 |
| N/A | Deep walk handles nested objects and arrays | unit | `bun test tests/unit/config/interpolate.test.ts -t "deep"` | Wave 0 |
| N/A | Template map records interpolated paths | unit | `bun test tests/unit/config/interpolate.test.ts -t "template"` | Wave 0 |
| N/A | Batch error reporting (multiple missing vars) | unit | `bun test tests/unit/config/interpolate.test.ts -t "batch"` | Wave 0 |
| N/A | Cache stores template form, not resolved | unit | `bun test tests/unit/cache/ -t "template"` | Wave 0 |
| N/A | loadConfig integration (YAML -> interpolate -> Zod) | unit | `bun test tests/unit/config/loader.test.ts -t "env"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test tests/unit/config/interpolate.test.ts`
- **Per wave merge:** `bun test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/config/interpolate.test.ts` -- covers CFG-01, CFG-02, CFG-03, CFG-04 and edge cases
- [ ] Additional loader.test.ts cases for env var integration path
- [ ] Additional cache-manager.test.ts cases for template-aware save

## Sources

### Primary (HIGH confidence)
- Project codebase: `src/config/loader.ts`, `src/cache/cache-manager.ts`, `src/cli.ts` -- direct inspection of integration points
- `15-CONTEXT.md` -- user decisions constraining all design choices
- `REQUIREMENTS.md` -- CFG-01 through CFG-04 definitions and out-of-scope items

### Secondary (MEDIUM confidence)
- POSIX shell variable expansion conventions -- `${VAR}`, `${VAR:-default}`, `${VAR:?error}` syntax is standard shell behavior

### Tertiary (LOW confidence)
- None -- all findings are from direct codebase inspection

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no dependencies needed, pure TypeScript
- Architecture: HIGH -- integration points identified from direct code inspection, user decisions lock the design
- Pitfalls: HIGH -- common regex and YAML parsing edge cases well understood

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable domain, no external dependency changes)
