# Architecture Research: v0.3 CI/CD + Team Readiness

**Domain:** CLI test tool -- structured output formats, linting/formatting, PR workflow gates, env var interpolation
**Researched:** 2026-03-12
**Confidence:** HIGH

This document focuses exclusively on the architectural changes needed for v0.3 features. It maps each feature to integration points in the existing codebase, identifies new components vs. modifications, and recommends a build order.

---

## Current Architecture (Baseline)

```
CLI (Commander.js, src/cli.ts)
  |
  +--> loadConfig() -------> YAML parse --> Zod validate --> Config
  |
  +--> ConsoleReporter (implements Reporter interface)
  |
  +--> TestRunner (orchestrates sequential execution)
  |       |
  |       +--> executeFn() --> TestExecutor (cache-first-then-AI strategy)
  |       |                      |
  |       |                      +--> CacheManager.load() / StepReplayer.replay()
  |       |                      +--> executeAgent() --> AI agent via Vercel AI SDK
  |       |
  |       +--> reporter.onTestStart(testName)
  |       +--> reporter.onTestComplete(TestResult)
  |       +--> reporter.onRunComplete(RunResult)
  |
  +--> process.exit(code)  // 0=pass, 1=fail, 2=config error
```

**Key architectural invariants:**
- All human-readable output goes to stderr via `writeStderr()`
- stdout is explicitly reserved for structured output (currently unused)
- Reporter interface: `onTestStart`, `onTestComplete`, `onRunComplete`, `onStepProgress?`
- RunResult contains: `results: TestResult[]`, `passed`, `failed`, `cached`, `skipped`, `totalDurationMs`
- TestResult contains: `testName`, `testCase`, `status`, `source`, `durationMs`, `error?`, `selfHealed?`

---

## Feature 1: JSON Output (`--output json`)

### Integration Point

**Where it touches:** CLI option parsing, Reporter dispatch, new formatter, stdout write at end of run.

**What exists:** The stdout channel is already reserved. The RunResult/TestResult types already carry all the data needed for JSON output. The Reporter interface already has `onRunComplete(RunResult)`.

### New Component: `src/output/json-formatter.ts`

**Purpose:** Transform a RunResult into a structured JSON object and write it to stdout.

**Not a Reporter implementation.** The JSON output should be written once at the end, after the run completes. The ConsoleReporter should still run (writing progress to stderr) while the JSON formatter writes the final result to stdout. This avoids duplicating the Reporter interface for something that is fundamentally a single write-at-end operation.

```typescript
// src/output/json-formatter.ts

export interface JsonTestResult {
  name: string;
  testCase: string;
  status: "passed" | "failed";
  source: "cache" | "ai";
  durationMs: number;
  error?: string;
  selfHealed?: boolean;
}

export interface JsonRunResult {
  version: 1;
  timestamp: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    cached: number;
    durationMs: number;
  };
  tests: JsonTestResult[];
}

export function formatJson(runResult: RunResult): string {
  // Transform RunResult -> JsonRunResult, JSON.stringify with 2-space indent
}

export function writeJsonToStdout(json: string): void {
  Bun.write(Bun.stdout, json + "\n");
}
```

### Modification: `src/cli.ts`

Add `--output <format>` option with choices `console` (default), `json`, `junit`. After `runner.run()` returns the RunResult, dispatch to the appropriate formatter:

```typescript
// After runner.run() completes:
if (options.output === "json") {
  writeJsonToStdout(formatJson(result));
} else if (options.output === "junit") {
  writeJunitToStdout(formatJunit(result, config));
}
```

### Data Flow

```
TestRunner.run()
    |
    +--> ConsoleReporter (stderr, always, progress/spinners)
    |
    v
RunResult
    |
    +--> if --output json  --> formatJson(RunResult) --> stdout
    +--> if --output junit --> formatJunit(RunResult) --> stdout
    +--> if console (default) --> nothing to stdout (summary already on stderr)
```

### Design Decision: --output vs --reporter

Use `--output` (not `--reporter`) because this controls the output format to stdout, not which Reporter implementation runs. The ConsoleReporter always runs for interactive feedback. `--output` adds a structured write to stdout at the end. This is the pattern used by Jest (`--json`), Vitest (`--reporter json`), and most CLI test tools.

---

## Feature 2: JUnit XML Output (`--output junit`)

### Integration Point

Same as JSON: new formatter, single write to stdout at end of run.

### New Component: `src/output/junit-formatter.ts`

**Purpose:** Transform a RunResult into JUnit XML format.

No external XML library needed -- JUnit XML is simple enough to generate with string templates. Adding a dependency like `fast-xml-parser` or `xmlbuilder2` is overkill for generating (not parsing) a fixed-structure XML document.

```typescript
// src/output/junit-formatter.ts

export function formatJunit(runResult: RunResult, suiteName?: string): string {
  // Generate JUnit XML string manually
}
```

**Target JUnit XML structure:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="superghost" tests="4" failures="1" errors="0" skipped="0" time="12.345">
  <testsuite name="superghost" tests="4" failures="1" errors="0" skipped="0" time="12.345" timestamp="2026-03-12T10:00:00Z">
    <testcase name="Login Flow" classname="superghost" time="3.200">
    </testcase>
    <testcase name="Dashboard Load" classname="superghost" time="1.100">
      <failure message="Element not found" type="AssertionFailure">Element not found</failure>
    </testcase>
    <testcase name="Checkout Process" classname="superghost" time="5.400">
      <properties>
        <property name="source" value="cache"/>
      </properties>
    </testcase>
  </testsuite>
</testsuites>
```

**Key mapping decisions:**
- `classname` = `"superghost"` (flat, no package hierarchy -- there is no concept of test classes)
- `time` = `durationMs / 1000` (JUnit uses seconds as float)
- Failed tests get `<failure>` with the error message
- `source` (cache/ai) and `selfHealed` go into `<properties>` for each testcase -- useful metadata without breaking standard parsers
- No `<error>` elements -- SuperGhost failures are always assertion-class (the AI says test failed), not unexpected exceptions
- `timestamp` in ISO 8601 format

### Modification: `src/cli.ts`

Same dispatch pattern as JSON (see above).

---

## Feature 3: Env Var Interpolation in YAML Configs

### Integration Point

**Where it touches:** Config loading pipeline, between YAML parse and Zod validation.

**What exists:** `loadConfig()` in `src/config/loader.ts` has a clean 3-layer pipeline: file read -> YAML parse -> Zod validate. Env var interpolation slots in as a new layer between parse and validate.

### New Component: `src/config/interpolate.ts`

**Purpose:** Walk a parsed YAML object and replace `${VAR_NAME}` patterns with `process.env` values.

```typescript
// src/config/interpolate.ts

/**
 * Recursively walk an object and replace ${VAR_NAME} patterns
 * in string values with process.env[VAR_NAME].
 *
 * Supports:
 *   ${VAR}           - required, throws if missing
 *   ${VAR:-default}  - optional with default value
 *
 * Only operates on string values. Does not modify keys or non-string values.
 */
export function interpolateEnvVars(obj: unknown): unknown {
  // Regex: /\$\{([^}]+)\}/g
  // For each match, split on :- for default support
  // Throw ConfigLoadError if required var is missing
}
```

### Modification: `src/config/loader.ts`

Insert interpolation between YAML parse and Zod validation:

```typescript
// Current:
raw = YAML.parse(content);
const result = ConfigSchema.safeParse(raw);

// After:
raw = YAML.parse(content);
raw = interpolateEnvVars(raw);  // <-- new layer
const result = ConfigSchema.safeParse(raw);
```

**Error handling:** Missing required env vars throw `ConfigLoadError` with a clear message naming the variable and the config field path where it appeared. This preserves the existing error UX pattern.

### Design Decision: No External Library

The interpolation pattern `${VAR}` with optional `${VAR:-default}` is trivially implementable with a single regex and recursive walk. Libraries like `string-env-interpolation` or `yaml-env-defaults` add dependencies for 20 lines of code. The regex approach also gives full control over error messages, which matters for CLI UX.

### Data Flow

```
YAML file content
    |
    v
YAML.parse(content) --> raw JS object
    |
    v
interpolateEnvVars(raw) --> raw JS object with env vars resolved
    |
    v
ConfigSchema.safeParse(resolved) --> validated Config
```

### Scope of Interpolation

Interpolation applies to **all string values** in the config, not just specific fields. This means:
- `baseUrl: ${APP_URL}` works
- `model: ${AI_MODEL:-claude-sonnet-4-6}` works
- `tests[0].case: "check login at ${APP_URL}"` works
- `timeout: ${TIMEOUT}` -- the string "5000" gets interpolated, then Zod coerces/validates the number

The recursive walk handles arrays and nested objects naturally.

---

## Feature 4: Linting/Formatting Enforcement (Biome)

### Integration Point

**Where it touches:** New config file at repo root, new npm scripts, GitHub Actions workflow. No source code changes.

### New Files

| File | Purpose |
|------|---------|
| `biome.json` | Biome configuration -- linter rules, formatter settings |

### Modification: `package.json`

Add scripts:

```json
{
  "scripts": {
    "lint": "biome check .",
    "lint:fix": "biome check --write .",
    "format": "biome format --write .",
    "format:check": "biome format ."
  }
}
```

Add dev dependency:

```json
{
  "devDependencies": {
    "@biomejs/biome": "^2.3.0"
  }
}
```

### Biome Configuration Strategy

```json
{
  "$schema": "https://biomejs.dev/schemas/2.3.0/schema.json",
  "organizeImports": { "enabled": true },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "files": {
    "ignore": ["node_modules", "dist", ".superghost-cache"]
  }
}
```

### Why Biome Over ESLint + Prettier

- **Single tool** for both linting and formatting (no config sync issues)
- **Fast** -- written in Rust, runs in <100ms on a 3,787 LOC codebase
- **Bun-native compatible** -- installs via `bun add`, no Node.js-specific tooling
- **Zero-config viable** -- recommended rules work out of the box
- **Active development** -- v2.3 as of early 2026, strong TypeScript inference since v2.0
- **No dependency conflicts** -- ESLint's plugin ecosystem has frequent breaking changes

### Source Code Impact

Biome adoption may require reformatting existing files to match the configured style. This is a one-time `biome check --write .` pass. The PR should apply formatting fixes in a single commit before any feature work.

---

## Feature 5: PR Workflow with Test Gates (GitHub Actions)

### Integration Point

**Where it touches:** New GitHub Actions workflow file, branch protection rules.

### New File: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run lint

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun run typecheck

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun test
```

### Design Decisions

**Three separate jobs, not one.** Running lint, typecheck, and test as separate jobs enables:
- Parallel execution (faster feedback)
- Granular status checks in GitHub PR UI (see exactly what failed)
- Independent retries (flaky test does not re-run lint)

**No E2E in PR checks.** The existing `e2e.yml` runs on schedule/dispatch because E2E tests require AI API keys and are slow/non-deterministic. PR checks should be fast, deterministic, and free.

**Branch protection rules** (manual setup, not automated):
- Require status checks: `lint`, `typecheck`, `test`
- Require branch to be up to date before merging
- Require PR reviews (optional, depends on team size)

### Relationship to Existing Workflows

| Workflow | Trigger | Purpose | Change |
|----------|---------|---------|--------|
| `ci.yml` | PR/push to main | Fast deterministic gates | **NEW** |
| `e2e.yml` | Weekly schedule, manual dispatch | AI-dependent E2E validation | No change |
| `release.yml` | Tag push | Build + publish | Add `bun run lint` step |

---

## Feature 6: Contributor Docs

### Integration Point

**Where it touches:** New markdown files at repo root and `.github/` directory. No source code changes.

### New Files

| File | Purpose |
|------|---------|
| `CONTRIBUTING.md` | How to set up dev environment, run tests, submit PRs |
| `SECURITY.md` | How to report security vulnerabilities |
| `.github/ISSUE_TEMPLATE/bug_report.md` | Structured bug report template |
| `.github/ISSUE_TEMPLATE/feature_request.md` | Feature request template |
| `.github/PULL_REQUEST_TEMPLATE.md` | PR description template with checklist |

### No Architectural Impact

These are documentation-only changes. They reference existing commands (`bun test`, `bun run lint`, `bun run typecheck`) and the CI workflow.

---

## Component Map: New vs. Modified

### New Components

| Component | Path | Purpose | Depends On |
|-----------|------|---------|------------|
| JSON Formatter | `src/output/json-formatter.ts` | Transform RunResult to JSON string | `RunResult` type |
| JUnit Formatter | `src/output/junit-formatter.ts` | Transform RunResult to JUnit XML string | `RunResult` type |
| Env Interpolator | `src/config/interpolate.ts` | Replace `${VAR}` patterns in parsed config | `process.env` |
| Biome Config | `biome.json` | Linter/formatter configuration | None |
| CI Workflow | `.github/workflows/ci.yml` | PR quality gates | Biome, bun test |
| Contributor Docs | `CONTRIBUTING.md`, etc. | Onboarding documentation | CI workflow |

### Modified Components

| Component | Path | Change | Risk |
|-----------|------|--------|------|
| CLI | `src/cli.ts` | Add `--output <format>` option, dispatch to formatters | LOW -- additive option |
| Config Loader | `src/config/loader.ts` | Insert `interpolateEnvVars()` call between parse and validate | LOW -- single insertion point |
| package.json | `package.json` | Add Biome dev dep, lint/format scripts | LOW -- dev tooling only |
| release.yml | `.github/workflows/release.yml` | Add lint step | LOW -- additive |

### Unchanged Components

| Component | Why Unchanged |
|-----------|---------------|
| TestRunner | Does not know about output format -- only calls Reporter |
| TestExecutor | Execution logic is format-agnostic |
| ConsoleReporter | Still runs for stderr progress; new formatters are separate |
| Reporter interface | JSON/JUnit are not Reporters -- they transform RunResult at end |
| CacheManager | Cache behavior is independent of output format |
| Agent subsystem | AI execution is independent of output format |
| Config schema | Env vars are resolved before Zod sees the data |

---

## Recommended Build Order

The build order is driven by dependency chains and testing value.

### Phase 1: Env Var Interpolation

**Why first:** Unblocks config flexibility needed for CI/CD usage. No dependency on other features. The config loader is the most foundational component -- getting this right early avoids churn.

**Build steps:**
1. Create `src/config/interpolate.ts` with `interpolateEnvVars()`
2. Unit test: basic substitution, missing vars, defaults, nested objects, arrays
3. Modify `src/config/loader.ts` to call interpolation between parse and validate
4. Integration test: YAML with `${VAR}` resolved correctly

**Risk:** LOW. Well-defined insertion point. Existing tests continue to pass because current configs have no `${VAR}` syntax.

### Phase 2: JSON Output Format

**Why second:** Simplest output format. Validates the `--output` CLI option pattern that JUnit reuses. Provides immediate CI/CD value (pipe to `jq`, consume in scripts).

**Build steps:**
1. Create `src/output/json-formatter.ts` with `formatJson()` and `writeJsonToStdout()`
2. Add `--output <format>` option to CLI (initially just `console` and `json`)
3. Wire: after `runner.run()`, dispatch to `formatJson` if `--output json`
4. Unit test: verify JSON structure, field mapping from RunResult
5. Integration test: `--output json` writes valid JSON to stdout, stderr still shows progress

**Risk:** LOW. Additive change. The RunResult already contains all needed data.

### Phase 3: JUnit XML Output Format

**Why third:** Same pattern as JSON, reuses the `--output` dispatch. JUnit is more complex (XML generation, attribute mapping) but the architecture is identical.

**Build steps:**
1. Create `src/output/junit-formatter.ts` with `formatJunit()`
2. Add `junit` to the `--output` choices
3. Wire into the same dispatch in CLI
4. Unit test: verify XML structure, escaped characters, time format
5. Integration test: valid JUnit XML to stdout

**Risk:** LOW. Same pattern as JSON. XML escaping needs care (test names with `<`, `>`, `&`, `"`).

### Phase 4: Linting/Formatting (Biome)

**Why fourth:** Foundational for PR gates, but does not block output format features. Should be done before creating the CI workflow so the workflow has lint/format commands to call.

**Build steps:**
1. Add `@biomejs/biome` dev dependency
2. Create `biome.json` configuration
3. Add lint/format npm scripts to `package.json`
4. Run `biome check --write .` to apply formatting to existing codebase
5. Verify all existing tests still pass after formatting

**Risk:** MEDIUM. Formatting may produce a large diff touching many files. Best done as a standalone commit/PR to keep reviews clean. Must verify Biome rules do not conflict with existing code patterns (e.g., `any` types in agent code).

### Phase 5: PR Workflow (GitHub Actions)

**Why fifth:** Depends on Biome (needs `bun run lint`) and existing test infrastructure. Should be one of the last code changes so the workflow tests everything that came before it.

**Build steps:**
1. Create `.github/workflows/ci.yml` with lint, typecheck, test jobs
2. Add lint step to `.github/workflows/release.yml`
3. Test by opening a PR against the branch
4. Configure branch protection rules (manual GitHub UI step)

**Risk:** LOW. Declarative YAML config. Test by pushing the workflow and verifying checks appear.

### Phase 6: Contributor Docs

**Why last:** References all the tooling and workflows established in previous phases. Writing docs before the tools exist means docs become stale immediately.

**Build steps:**
1. Create `CONTRIBUTING.md` referencing dev setup, linting, testing, PR process
2. Create `SECURITY.md`
3. Create issue and PR templates
4. Verify all referenced commands work

**Risk:** NONE. Documentation-only, no code changes.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Making JSON/JUnit into Reporter implementations

**What people do:** Create `JsonReporter` and `JunitReporter` that implement the `Reporter` interface, tracking state across `onTestStart`/`onTestComplete` calls.

**Why it is wrong:** The Reporter interface is designed for real-time progress feedback (spinners, streaming output). JSON and JUnit output is a batch transformation of the final RunResult. Making them Reporters means:
- Duplicating aggregation logic already in `aggregateResults()`
- Managing internal state that mirrors RunResult
- Losing the ability to show console progress alongside structured output

**Do this instead:** Keep ConsoleReporter for progress. Add formatters that transform the completed RunResult into output strings. Write to stdout once at the end.

### Anti-Pattern 2: Env var interpolation in the YAML string before parsing

**What people do:** Regex-replace `${VAR}` in the raw YAML string content before calling `YAML.parse()`.

**Why it is wrong:** Env var values may contain YAML-special characters (`#`, `:`, `[`, `{`) that break YAML parsing. A value like `password: ${DB_PASS}` where `DB_PASS=foo:bar#baz` becomes `password: foo:bar#baz` which YAML interprets incorrectly.

**Do this instead:** Parse YAML first to get the JS object, then walk the object and replace `${VAR}` patterns in string values. This way YAML parsing is complete and env var values are just string content.

### Anti-Pattern 3: Using a full XML library for JUnit generation

**What people do:** Add `fast-xml-parser`, `xmlbuilder2`, or `js2xmlparser` as a dependency to generate JUnit XML.

**Why it is wrong:** JUnit XML is a fixed, well-known structure. Generation (not parsing) of a 30-line XML document does not need a 50KB+ dependency. The XML escaping rules are trivial (5 characters: `<`, `>`, `&`, `"`, `'`).

**Do this instead:** Template-based string generation with a small `escapeXml()` helper. Keeps the dependency count low and the output fully controllable.

### Anti-Pattern 4: Coupling env var interpolation to specific config fields

**What people do:** Only interpolate `baseUrl`, `model`, and a few known fields, hardcoding the field list.

**Why it is wrong:** Users will want env vars in test case descriptions (`case: "login at ${APP_URL}"`), context fields, and future config additions. Hardcoding a field list means every new config field needs an interpolation update.

**Do this instead:** Recursive walk that interpolates all string values regardless of their position in the config tree. The schema validation after interpolation catches any invalid results.

---

## Data Flow: Complete v0.3 Pipeline

```
YAML config file
    |
    v
Bun.file().text() -----> raw string
    |
    v
YAML.parse() ----------> raw JS object
    |
    v
interpolateEnvVars() ---> resolved JS object (${VAR} replaced) [NEW]
    |
    v
ConfigSchema.safeParse() -> Config (validated)
    |
    v
CLI option parsing ------> --output json|junit|console [NEW]
                            --verbose, --only, --no-cache, etc.
    |
    v
TestRunner.run()
    |
    +--> ConsoleReporter (stderr, always active)
    |       onTestStart -> spinner
    |       onStepProgress -> spinner update / verbose log
    |       onTestComplete -> spinner success/error
    |       onRunComplete -> summary box
    |
    v
RunResult
    |
    +--> if --output json:  formatJson(RunResult) -> stdout [NEW]
    +--> if --output junit: formatJunit(RunResult) -> stdout [NEW]
    +--> if console: nothing to stdout (default)
    |
    v
process.exit(code)
```

---

## Testing Strategy for New Components

| Component | Unit Test Focus | Integration Test Focus |
|-----------|-----------------|------------------------|
| `interpolateEnvVars()` | Single var, multiple vars, missing var error, default values, nested objects, arrays, non-string passthrough | CLI with YAML containing `${VAR}`, verify resolved config |
| `formatJson()` | Correct JSON structure, all fields mapped, edge cases (empty results, long error strings) | `--output json` produces parseable JSON on stdout |
| `formatJunit()` | Valid XML structure, XML escaping, time format (seconds not ms), failure/properties elements | `--output junit` produces valid JUnit XML, parseable by CI tools |
| Biome config | N/A (config file) | `bun run lint` exits 0 on clean code |
| CI workflow | N/A (YAML config) | PR triggers checks, all three jobs pass |

### Critical Integration Test

The most important integration test for v0.3:

```typescript
// Verify stdout/stderr separation with --output json
test("--output json writes JSON to stdout and progress to stderr", async () => {
  const { stdout, stderr } = await runCli(["--config", "...", "--output", "json"]);
  const parsed = JSON.parse(stdout);  // Must not throw
  expect(parsed.version).toBe(1);
  expect(parsed.tests).toBeArray();
  expect(stderr).toContain("superghost");  // Progress still on stderr
});
```

---

## Sources

- [JUnit XML format specification (testmoapp/junitxml)](https://github.com/testmoapp/junitxml) -- HIGH confidence, authoritative community spec
- [Biome toolchain](https://biomejs.dev/) -- HIGH confidence, official documentation
- [Biome v2.0+ TypeScript inference](https://biomejs.dev/linter/) -- HIGH confidence, official docs
- [GitHub Actions reusable workflows](https://oneuptime.com/blog/post/2025-12-20-github-actions-reusable-workflows/view) -- MEDIUM confidence, tutorial
- [GitHub Actions PR status checks configuration](https://oneuptime.com/blog/post/2026-01-26-status-checks-github-actions/view) -- MEDIUM confidence, tutorial
- Existing SuperGhost source code analysis -- HIGH confidence, direct inspection

---
*Architecture research for: SuperGhost v0.3 CI/CD + Team Readiness*
*Researched: 2026-03-12*
