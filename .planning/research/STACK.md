# Stack Research

**Domain:** CI/CD output formats, code quality enforcement, and config interpolation for AI-powered E2E testing CLI
**Researched:** 2026-03-12 (v0.3 CI/CD + Team Readiness milestone)
**Confidence:** HIGH -- all versions verified against npm/official docs, JUnit XML format verified against testmoapp/junitxml spec

---

## Scope

This research covers ONLY the stack additions needed for v0.3. The existing validated stack is unchanged:

- Bun >=1.2.0, TypeScript 5.x, Vercel AI SDK 6.x, Commander.js 14.x, Zod 4.x, `yaml`, picocolors, picomatch, nanospinner
- All output currently goes to stderr via `writeStderr()` helper; stdout is reserved for structured output (this is the correct foundation for JSON/JUnit)

Five new capability areas need stack decisions:

1. JSON output format (`--output json`)
2. JUnit XML output format (`--output junit`)
3. Linting/formatting enforcement (Biome)
4. GitHub Actions PR workflow
5. Env var interpolation in YAML configs

---

## Recommended Stack Additions

### 1. JSON Output -- No New Dependencies

**Decision: Hand-craft JSON output. Zero new libraries.**

The existing `RunResult` and `TestResult` types contain everything needed. `JSON.stringify()` is built into every runtime. The JSON output is a direct serialization of the run results.

```typescript
// src/output/json-reporter.ts
import type { Reporter } from "./types.ts";
import type { TestResult, RunResult } from "../runner/types.ts";

export class JsonReporter implements Reporter {
  private results: TestResult[] = [];

  onTestStart(_testName: string): void {}
  onTestComplete(result: TestResult): void {
    this.results.push(result);
  }
  onRunComplete(data: RunResult): void {
    // Write to stdout (not stderr) for programmatic consumption
    const output = JSON.stringify({
      version: 1,
      timestamp: new Date().toISOString(),
      summary: {
        total: data.results.length,
        passed: data.passed,
        failed: data.failed,
        cached: data.cached,
        skipped: data.skipped,
        durationMs: data.totalDurationMs,
      },
      tests: data.results.map(r => ({
        name: r.testName,
        case: r.testCase,
        status: r.status,
        source: r.source,
        durationMs: r.durationMs,
        error: r.error ?? null,
        selfHealed: r.selfHealed ?? false,
      })),
    }, null, 2);
    process.stdout.write(output + "\n");
  }
}
```

**Why no library:** The output shape is trivially small. Adding `fast-json-stringify` or similar for a ~20-field object is over-engineering. `JSON.stringify` with indent 2 produces human-readable output. Including a `version: 1` field enables schema evolution without breaking consumers.

**Integration point:** The `ConsoleReporter` already writes everything to stderr. A `JsonReporter` writes structured output to stdout. Both implement the `Reporter` interface. The `--output json` flag swaps which reporter is used. Diagnostic output (spinners, progress) can still go to stderr via a secondary `ConsoleReporter` when `--verbose` is combined with `--output json`.

### 2. JUnit XML Output -- No New Dependencies

**Decision: Hand-craft JUnit XML string generation. Zero new libraries.**

| Considered | Version | Why NOT |
|------------|---------|---------|
| `junit-xml` | 0.3.1 | Tiny package (0.3.x) with limited adoption. Its API is a single function that takes an object and returns XML -- we can write the same 40 lines of XML escaping ourselves and avoid a dependency that may go unmaintained. |
| `junit-report-builder` | 5.x | Designed for Jenkins-style reports with `writeTo(file)` API. We need stdout output, not file writes. Heavier API surface than needed. |
| `xmlbuilder2` | 3.x | Full XML builder library. Massive overkill for a fixed 3-element XML format. |

**Why hand-craft:** JUnit XML has a well-defined, stable format (unchanged since ~2009). SuperGhost's output is a single `<testsuites>` with one `<testsuite>` and N `<testcase>` elements. The entire XML generation is ~50 lines including XML escaping. Adding a dependency for this introduces supply chain risk for zero benefit.

**JUnit XML spec** (verified against [testmoapp/junitxml](https://github.com/testmoapp/junitxml)):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="superghost" tests="3" failures="1" errors="0" time="4.2">
  <testsuite name="superghost" tests="3" failures="1" errors="0" time="4.2"
             timestamp="2026-03-12T10:00:00Z">
    <testcase name="Login flow" classname="superghost" time="1.2"/>
    <testcase name="Search products" classname="superghost" time="2.8">
      <failure message="Expected search results to contain 'Widget'"
               type="AssertionError">
        AI execution failed: search results page did not contain expected text
      </failure>
    </testcase>
    <testcase name="Checkout" classname="superghost" time="0.2">
      <skipped message="Filtered by --only"/>
    </testcase>
  </testsuite>
</testsuites>
```

Required attributes per element:
- `<testsuites>`: `name`, `tests`, `failures`, `errors`, `time` (seconds, decimal)
- `<testsuite>`: `name`, `tests`, `failures`, `errors`, `time`, `timestamp` (ISO 8601)
- `<testcase>`: `name`, `classname`, `time` (seconds, decimal)
- `<failure>`: `message`, `type` (optional but recommended)
- `<skipped>`: `message` (optional)

**XML escaping** is the only non-trivial part -- 5 characters need escaping (`&`, `<`, `>`, `"`, `'`). A single helper function handles this.

**Integration point:** Same as JSON -- a `JUnitReporter` implements the `Reporter` interface, collects results, and writes XML to stdout on `onRunComplete`. CI tools (GitHub Actions, Jenkins, GitLab) consume the file by redirecting stdout: `superghost --config tests.yaml --output junit > test-results.xml`

**CI consumption:** Use `mikepenz/action-junit-report@v6` in GitHub Actions to display JUnit results as PR check annotations. This action supports both `<failure>` and `<error>` elements and nested suites.

### 3. Linting/Formatting -- Biome

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@biomejs/biome` | ^2.4.6 | Linting + formatting + import sorting | Single tool replaces ESLint + Prettier + eslint-plugin-import. 20-100x faster (written in Rust). First-class TypeScript type-aware linting without requiring the TypeScript compiler. `biome ci` command designed for CI read-only checks. Zero configuration needed for sensible defaults. Bun-compatible (pure binary, no Node.js dependency). |

**Why Biome over ESLint + Prettier:**

| Criteria | Biome | ESLint + Prettier |
|----------|-------|-------------------|
| Install footprint | 1 package | 5+ packages (eslint, prettier, @typescript-eslint/parser, @typescript-eslint/eslint-plugin, eslint-config-prettier, eslint-plugin-prettier) |
| Config files | 1 (biome.json) | 2-3 (.eslintrc, .prettierrc, possibly .eslintignore) |
| CI speed | ~50ms for 4K LOC | ~2-5s for same codebase |
| Type-aware linting | Built-in (v2+), no TSC dependency | Requires TypeScript compiler, slow |
| Import sorting | Built-in with merge support | Requires eslint-plugin-import or separate tool |
| Bun compatibility | Native binary, works everywhere | Mostly works, occasional ESM resolution issues |
| Rule count | 450+ rules | More with plugins, but diminishing returns |

**Installation:**

```bash
bun add -D --exact @biomejs/biome
```

The `--exact` flag is recommended because Biome follows rapid release cycles. Pinning prevents surprise rule additions in CI.

**Configuration (`biome.json`):**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.6/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true,
    "defaultBranch": "main"
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedImports": "error",
        "noUnusedVariables": "warn"
      },
      "style": {
        "noNonNullAssertion": "warn"
      }
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  },
  "files": {
    "ignore": [
      "node_modules",
      ".superghost-cache",
      "dist",
      "*.d.ts"
    ]
  }
}
```

**package.json scripts:**

```json
{
  "scripts": {
    "lint": "biome check src/",
    "lint:fix": "biome check --write src/",
    "format": "biome format --write src/",
    "ci:lint": "biome ci src/"
  }
}
```

**Key Biome CLI commands:**
- `biome check` -- runs formatter + linter + import sorting (read-only by default, `--write` to auto-fix)
- `biome ci` -- same as `biome check` but optimized for CI (read-only, exits non-zero on violations, no `--write` flag accepted)
- `biome check --changed` -- only check files changed since last commit (fast incremental checks)
- `biome ci --reporter=github` -- GitHub-native annotation output for inline PR comments

### 4. GitHub Actions PR Workflow -- No New Dependencies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `oven-sh/setup-bun` | v2 | Install Bun in GitHub Actions | Official action by the Bun team (oven-sh). Verified on GitHub Marketplace. Supports version pinning, caching, and `bun-version-file` for lockfile-based version detection. |
| `mikepenz/action-junit-report` | v6 | Display JUnit XML as PR check annotations | Parses JUnit XML files and creates GitHub check annotations with pass/fail details inline on the PR. Supports `<failure>` and `<error>` elements. |

**Workflow structure (`.github/workflows/pr.yml`):**

```yaml
name: PR Checks

on:
  pull_request:
    branches: [main]

permissions:
  contents: read
  checks: write
  pull-requests: write

jobs:
  quality:
    name: Code Quality
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - name: Typecheck
        run: bunx tsc --noEmit
      - name: Lint & Format
        run: bunx biome ci src/
      - name: Unit Tests
        run: bun test
```

**Key decisions:**
- `bun install --frozen-lockfile` ensures reproducible installs in CI (fails if lockfile is stale)
- `biome ci` (not `biome check`) for CI -- read-only, exits non-zero on violations
- Typecheck and lint run as separate steps for clear failure attribution
- Unit tests run after lint (fast fail on code quality before slower tests)
- No E2E test gate in PR workflow (requires API keys, browser, too slow for PR feedback loop)

### 5. Env Var Interpolation -- No New Dependencies

**Decision: Implement `${VAR}` interpolation as a pre-processing step in `loadConfig()`. Zero new libraries.**

| Considered | Why NOT |
|------------|---------|
| `yaml-env-defaults` | Wraps `js-yaml` (not Bun's built-in `YAML.parse`). Would require replacing the YAML parser. |
| `dotenv-expand` | Designed for `.env` files, not YAML content. Wrong tool. |
| `envsub` / `envsubst` | CLI tools, not programmatic APIs. Shell-level substitution. |
| EJS templating | Massive overkill. Introduces an entire template engine for simple variable substitution. |

**Why hand-craft:** The interpolation is a single regex replacement on the raw YAML string before parsing. Docker Compose uses the same approach. The implementation is ~20 lines:

```typescript
/**
 * Interpolate ${VAR} and ${VAR:-default} patterns in a string.
 * Follows Docker Compose interpolation conventions.
 * Runs on raw YAML text BEFORE parsing, so Zod validation
 * catches any issues from missing/wrong env vars.
 */
function interpolateEnvVars(content: string): string {
  return content.replace(
    /\$\{([^}]+)\}/g,
    (_match, expr: string) => {
      // ${VAR:-default} -- use default if VAR is unset or empty
      const defaultMatch = expr.match(/^(\w+):-(.*)$/);
      if (defaultMatch) {
        const [, varName, defaultValue] = defaultMatch;
        return process.env[varName] || defaultValue;
      }

      // ${VAR:?error} -- error if VAR is unset or empty
      const errorMatch = expr.match(/^(\w+):\?(.*)$/);
      if (errorMatch) {
        const [, varName, errorMsg] = errorMatch;
        const value = process.env[varName];
        if (!value) {
          throw new ConfigLoadError(
            `Required env var ${varName} is not set: ${errorMsg}`
          );
        }
        return value;
      }

      // ${VAR} -- simple substitution
      const varName = expr.trim();
      const value = process.env[varName];
      if (value === undefined) {
        throw new ConfigLoadError(
          `Env var ${varName} is not set. Use \${${varName}:-default} for a fallback.`
        );
      }
      return value;
    }
  );
}
```

**Supported syntax** (matching Docker Compose conventions):

| Pattern | Behavior |
|---------|----------|
| `${VAR}` | Substitutes value of `VAR`. Error if unset. |
| `${VAR:-default}` | Substitutes `VAR` if set and non-empty, otherwise `default`. |
| `${VAR:?error message}` | Substitutes `VAR` if set and non-empty, otherwise throws with `error message`. |
| `$$` | Literal `$` (escape hatch) |

**Integration point:** Interpolation runs in `loadConfig()` between file read (Layer 1) and YAML parse (Layer 2):

```typescript
export async function loadConfig(filePath: string): Promise<Config> {
  // Layer 1: Read file
  const content = await file.text();

  // Layer 1.5: Env var interpolation (NEW)
  const interpolated = interpolateEnvVars(content);

  // Layer 2: YAML parsing
  const raw = YAML.parse(interpolated);

  // Layer 3: Zod validation (catches type mismatches from bad env vars)
  ...
}
```

This approach is clean because:
- Zod validation still catches all type errors (e.g., `timeout: ${NOT_A_NUMBER}` will fail Zod's `.number()` check after YAML parses "abc" as a string)
- No changes needed to the Zod schema or types
- Works with any YAML value position (strings, URLs, numbers after YAML parsing)

**YAML config example:**

```yaml
baseUrl: ${BASE_URL:-http://localhost:3000}
model: ${SUPERGHOST_MODEL:-claude-sonnet-4-6}
tests:
  - name: Login with test credentials
    case: >
      Navigate to ${BASE_URL:-http://localhost:3000}/login,
      enter username ${TEST_USER:?TEST_USER env var required}
      and password ${TEST_PASSWORD:?TEST_PASSWORD env var required},
      click Login, verify dashboard loads.
```

---

## Installation

```bash
# Single new dev dependency for v0.3
bun add -D --exact @biomejs/biome

# Initialize Biome config
bunx biome init
```

That is the ONLY new package. JSON output, JUnit XML output, env var interpolation, and GitHub Actions workflow all require zero new npm dependencies.

---

## Recommended Stack (Full, v0.3)

### Core Technologies (unchanged from v0.2)

| Technology | Version | Purpose |
|------------|---------|---------|
| Bun | >=1.2.0 | Runtime, package manager, test runner, bundler |
| TypeScript | 5.x | Language (strict mode, runs natively in Bun) |
| Vercel AI SDK (`ai`) | ^6.0.116 | LLM orchestration, agentic tool loops |
| Commander.js | ^14.0.3 | CLI argument parsing |
| Zod | ^4.3.6 | Config schema validation |
| `yaml` (Bun built-in) | N/A | YAML parsing via `YAML.parse()` |
| nanospinner | ^1.2.2 | Terminal spinner + progress |
| picocolors | ^1.1.1 | Terminal colors |
| picomatch | ^4.0.3 | Glob pattern matching for `--only` |

### New for v0.3

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@biomejs/biome` | ^2.4.6 (exact) | Lint + format + import sorting | Single Rust binary replaces ESLint+Prettier. 20-100x faster. `biome ci` for CI. Type-aware linting without TSC. |

### GitHub Actions (not npm packages)

| Action | Version | Purpose |
|--------|---------|---------|
| `oven-sh/setup-bun` | v2 | Install Bun in CI |
| `mikepenz/action-junit-report` | v6 | Display JUnit results as PR annotations |
| `actions/checkout` | v4 | Checkout code |

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Hand-crafted JSON | `fast-json-stringify` | The output is ~20 fields. `JSON.stringify` is sufficient. Schema-based serializers add complexity for zero measurable gain at this scale. |
| Hand-crafted JUnit XML | `junit-xml@0.3.1` | Tiny npm package with low adoption. The XML format is trivial (3 element types). Owning 50 lines of XML generation avoids a supply chain dependency for a fixed format. |
| Hand-crafted JUnit XML | `junit-report-builder@5.x` | `writeTo(file)` API assumes file output. We need stdout for piping. API is more complex than needed. |
| Hand-crafted JUnit XML | `xmlbuilder2@3.x` | Full DOM-style XML builder. Massive overkill for a fixed 3-element XML format that never changes. |
| Biome | ESLint + Prettier | 5+ packages vs 1. 2-3 config files vs 1. Seconds vs milliseconds in CI. ESM resolution issues with Bun. Biome is the modern standard for TypeScript projects. |
| Biome | `dprint` | dprint is formatter-only (no linting). Would still need ESLint for lint rules. Biome provides both in one tool. |
| Hand-crafted env interpolation | `yaml-env-defaults` | Wraps `js-yaml`, not Bun's built-in `YAML.parse`. Would force a parser switch. The interpolation is 20 lines of regex. |
| Hand-crafted env interpolation | `dotenv-expand` | For `.env` files, not YAML content. Wrong tool for the job. |
| `oven-sh/setup-bun@v2` | Manual Bun install in CI | The official action handles caching, version pinning, and PATH setup. No reason to hand-roll this. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| ESLint + Prettier for new project setup | 5+ packages, conflicting configs, slow, ESM resolution issues with Bun, complex plugin ecosystem | `@biomejs/biome` -- single binary, single config |
| `xmlbuilder2` or any XML library for JUnit output | The JUnit XML format has 3 element types. A full XML library is a dependency for 50 lines of string concatenation. | Hand-craft XML with a `escapeXml()` helper |
| `fast-xml-parser` for JUnit generation | Parser, not generator. Wrong direction. Even if it generates XML, it is designed for round-tripping complex documents. | Hand-craft XML |
| `js-yaml` as a replacement parser | Bun ships `YAML.parse()` built-in. Adding `js-yaml` duplicates functionality and adds a dependency. | `YAML.parse()` (Bun built-in) via `import { YAML } from "bun"` |
| `envsubst` CLI for interpolation | Shell tool, not a programmatic API. Cannot provide good error messages or default value support. | Regex-based `interpolateEnvVars()` function |
| `handlebars` / `ejs` / `mustache` for config interpolation | Template engines for HTML. Massive overkill for `${VAR}` substitution. Introduce XSS-style escaping concerns irrelevant to YAML. | Simple regex replacement |
| Separate lint and format CI steps | `biome ci` runs both in a single pass. Splitting into `biome lint` + `biome format` doubles the work. | `biome ci src/` -- single command |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@biomejs/biome@2.4.6` | Bun >=1.2.0 | Biome ships as a platform-specific binary via npm. Works on all platforms Bun supports (macOS, Linux, Windows). No Node.js dependency. |
| `@biomejs/biome@2.4.6` | TypeScript 5.x | Biome v2 has its own TypeScript type inference engine. Does not require or conflict with the project's TypeScript compiler. |
| `oven-sh/setup-bun@v2` | Bun 1.2+ | Supports `bun-version` input or auto-detection from `package.json` engines field. |
| `mikepenz/action-junit-report@v6` | GitHub Actions runner ubuntu-latest | Requires `checks: write` permission. Works with standard JUnit XML format. |
| Commander.js `--output <format>` | Existing CLI structure | New `.option('--output <format>', ...)` works alongside existing options. Commander handles mutual exclusivity if needed via `.choices()`. |

---

## CLI Integration Summary

The `--output` flag is the primary new CLI surface:

```typescript
program
  .option('--output <format>', 'Output format: console (default), json, junit', 'console')
```

**Reporter selection logic:**

```typescript
function createReporter(format: string, verbose: boolean): Reporter {
  switch (format) {
    case 'json':
      return new JsonReporter();
    case 'junit':
      return new JUnitReporter();
    case 'console':
    default:
      return new ConsoleReporter(verbose);
  }
}
```

**Stdout/stderr contract:**
- `console` format: all output to stderr (existing behavior, unchanged)
- `json` format: structured JSON to stdout on completion; diagnostic output to stderr if `--verbose`
- `junit` format: JUnit XML to stdout on completion; diagnostic output to stderr if `--verbose`

This preserves the existing convention that stderr is for humans and stdout is for machines. The foundation for this was already laid in v0.2 with the `writeStderr()` helper.

---

## Sources

- [testmoapp/junitxml](https://github.com/testmoapp/junitxml) -- JUnit XML format specification, element/attribute reference (HIGH confidence)
- [Biome v2 announcement](https://biomejs.dev/blog/biome-v2/) -- v2 features, type-aware linting, monorepo support (HIGH confidence)
- [Biome changelog](https://biomejs.dev/internals/changelog/version/2-0-2...latest/) -- latest version 2.4.6 confirmed (HIGH confidence)
- [Biome CLI reference](https://biomejs.dev/reference/cli/) -- `biome ci` command, `--reporter` flag, `--changed` flag (HIGH confidence)
- [Biome getting started](https://biomejs.dev/guides/getting-started/) -- init command, recommended scripts (HIGH confidence)
- [oven-sh/setup-bun](https://github.com/oven-sh/setup-bun) -- v2, verified GitHub Action (HIGH confidence)
- [mikepenz/action-junit-report](https://github.com/mikepenz/action-junit-report) -- v6, JUnit XML to PR annotations (HIGH confidence)
- [Docker Compose interpolation](https://docs.docker.com/reference/compose-file/interpolation/) -- `${VAR:-default}`, `${VAR:?error}` syntax reference (HIGH confidence)
- [junit-xml npm](https://www.npmjs.com/package/junit-xml) -- v0.3.1, considered and rejected (MEDIUM confidence)
- [junit-report-builder npm](https://www.npmjs.com/package/junit-report-builder) -- v5.x, considered and rejected (MEDIUM confidence)

---

*Stack research for: SuperGhost v0.3 -- CI/CD + Team Readiness*
*Researched: 2026-03-12*
