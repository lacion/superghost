# Feature Research

**Domain:** CI/CD output formats, code quality enforcement, contributor readiness, and config interpolation for AI-powered E2E testing CLI (v0.3)
**Researched:** 2026-03-12
**Confidence:** HIGH (JUnit XML format spec verified against testmoapp/junitxml, Biome v2 docs verified, GitHub Actions patterns verified, env var interpolation conventions verified against Docker Compose spec, JSON output conventions verified against Jest/Vitest docs)

---

## Context: What This File Is

This FEATURES.md covers the **v0.3 CI/CD + Team Readiness** milestone. The v1.0 core (AI agent, browser automation, caching) and v0.2 DX polish (CLI flags, preflight, verbose, exit codes) are already shipped. This file focuses exclusively on the six new features:

1. JSON output format (`--output json`)
2. JUnit XML output format (`--output junit`)
3. Linting/formatting enforcement (Biome)
4. GitHub Actions PR workflow with test gates
5. Contributor docs (CONTRIBUTING.md, issue/PR templates, SECURITY.md)
6. Env var interpolation in YAML configs (`${VAR}` syntax)

**Existing capabilities this builds on:**
- All output already routes to stderr via `writeStderr()` (stdout reserved for structured output)
- `RunResult` and `TestResult` types carry all needed data for structured output
- `Reporter` interface supports pluggable output (`onTestStart`, `onTestComplete`, `onRunComplete`, `onStepProgress`)
- Exit codes 0/1/2 already distinguish pass/fail/error
- Commander.js CLI with `--dry-run`, `--verbose`, `--no-cache`, `--only` flags
- GitHub Actions workflows exist for E2E (weekly `e2e.yml`) and release (on tag `release.yml`)
- Bun-native with TypeScript strict mode, 2-space indentation

---

## Table Stakes

Features that CI/CD users and team adopters expect. Missing any of these makes the tool feel unready for team use.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| JSON output format (`--output json`) | Every CI tool expects machine-readable output. `jq` piping, dashboard ingestion, custom reporting all require JSON. Jest (`--json`), Vitest (`--reporter=json`), Playwright (`--reporter=json`) all offer it. This is the universal machine-readable format. | LOW | Serialize existing `RunResult` to stdout. `JSON.stringify()` of a mapped structure. ~50-60 lines including the formatter function. Deps on existing types: `RunResult`, `TestResult`. |
| JUnit XML output format (`--output junit`) | JUnit XML is the universal CI reporting format. GitHub Actions (`dorny/test-reporter`, `mikepenz/action-junit-report`), Jenkins, GitLab CI, Azure DevOps, CircleCI all consume it natively. Without JUnit XML, test results are invisible in CI dashboards. | LOW-MEDIUM | ~80-100 lines including XML escaping. No npm dependency needed -- generate XML string with template literals. The format is simple: `testsuites` > `testsuite` > `testcase` with optional `failure` children. Must XML-escape `&`, `<`, `>`, `"` in names/messages. |
| Linting/formatting enforcement | Any open-source or team project without automated code style enforcement devolves into style debates in PRs. Contributors expect a lint check to exist. Biome is the standard for Bun/TypeScript in 2025-2026 (single tool, 20-100x faster than ESLint+Prettier). | LOW | Biome setup: one `biome.json` config file, one devDependency (`@biomejs/biome`). One-time format of existing code. ~10 minutes of work. |
| PR workflow with test gates | Required status checks prevent merging broken code. Without this, lint/format enforcement is advisory only. Standard `pull_request` trigger in GitHub Actions is the universal pattern. | LOW | Single YAML workflow file (`.github/workflows/ci.yml`). Three parallel jobs: lint, test, typecheck. Then configure branch protection in GitHub settings. |
| Env var interpolation (`${VAR}` in YAML) | CI environments pass secrets and config via env vars. Hardcoding `baseUrl`, API keys, or test credentials in YAML is a security anti-pattern. Docker Compose established `${VAR}` as the de facto standard. | MEDIUM | ~40-60 lines of interpolation logic in config loader, but needs careful regex work, good error messages, and edge case handling (unclosed braces, nested objects/arrays). |
| Contributor docs | CONTRIBUTING.md is the first file potential contributors look for. Its absence signals the project is not ready for contributions. GitHub surfaces issue/PR templates automatically and calculates community health scores. | LOW | Documentation only, no code changes. 5 files total. |

---

## Differentiators

Features that set SuperGhost apart from other testing tools in the CI/CD context.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Simultaneous human + machine output | Unlike tools that switch between `--reporter=json` (machine only) or default (human only), SuperGhost outputs human-readable spinners/summary on stderr AND structured data on stdout simultaneously. Users see live progress while machines parse results. No "multiple reporters" config needed. | LOW | The stderr/stdout split from v0.2 makes this automatic. `--output json` adds structured stdout without changing stderr behavior. This is architecturally superior to the reporter-switching pattern in Jest/Vitest/Playwright. |
| JSON output with `version` field | Enables schema evolution. Most test tools dump unversioned JSON and break consumers on updates. Including `version: 1` lets downstream tools handle format changes gracefully. | TRIVIAL | One extra field. Sets a good precedent for forward compatibility. |
| JUnit XML with SuperGhost-specific `<property>` elements | JUnit `<property>` elements per testcase can carry `source` (cache/ai), `selfHealed` (true/false). CI dashboards that support properties surface this metadata. Unique to AI-driven testing -- no other tool reports cache vs AI execution source. | LOW | Standard JUnit extension point per [testmoapp/junitxml spec](https://github.com/testmoapp/junitxml). Zero compatibility risk. |
| `${VAR:?error}` required variable syntax | Docker Compose convention for mandatory env vars. Most testing tools either silently leave `${MISSING}` as a literal or substitute empty. Erroring with a clear message on required vars is a genuine DX differentiator for CI pipelines. | LOW | Pattern match in the interpolation regex. Throw `ConfigLoadError` with the user's custom error message. |
| `${VAR:-default}` default value syntax | Configs work in both local dev (with defaults) and CI (with env var overrides) without modification. Reduces the "works on my machine" problem significantly. | LOW | Pattern match in the interpolation regex. |
| CI workflow provided out-of-the-box | Most test tools say "configure your own CI." SuperGhost ships with a ready-to-use `ci.yml` covering lint + test + typecheck, plus documented branch protection setup. Lower barrier for team adoption. | LOW | Ship the workflow file + document branch protection in CONTRIBUTING.md. |

---

## Anti-Features

Features to explicitly NOT build in v0.3.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| TAP (Test Anything Protocol) output | TAP has poor adoption in modern CI. GitHub Actions, GitLab, Jenkins all prefer JUnit XML. Adds format complexity with near-zero user demand. Vitest supports it but few use it. | JSON covers programmatic consumption. JUnit XML covers CI dashboards. Two formats is enough. |
| `--output-file <path>` flag | Adds complexity (file creation, error handling for missing dirs, overwrite semantics). Shell redirection already handles this: `superghost --output junit > results.xml`. | Document stdout redirection in --help and README. |
| `--output` with multiple formats simultaneously | Complexity explosion (two stdout streams? secondary file?). No CI tool needs both JSON and JUnit at the same time. | Run twice with different `--output` flags if both needed (cached replay makes second run instant). |
| HTML report output | Scope creep. HTML reports require CSS, templating, and visual design decisions. Not needed for CI/CD. Tools like Allure can consume JUnit XML to generate HTML. | Provide JUnit XML. Let downstream tools generate HTML. |
| Custom Biome rules or plugins | Biome's recommended rules are comprehensive. Custom rules add maintenance burden and confuse contributors who know Biome defaults. | Use `"recommended": true` and only override specific rules with clear comments in `biome.json`. |
| E2E tests in PR workflow | E2E tests require API keys (LLM providers), browser binaries, and 30s+ per test. Running them in PR gates blocks PRs on AI provider availability and cost. Non-deterministic by nature. | Keep E2E on existing `workflow_dispatch` + weekly schedule (`e2e.yml`). PR gates: typecheck + lint + unit tests only (fast, free, deterministic). |
| Built-in `.env` file support | Bun already loads `.env` automatically into `process.env`. Adding explicit `.env` parsing duplicates this and creates precedence confusion (Docker Compose's `.env` support has caused years of confusion). | Document that Bun loads `.env` automatically and `${VAR}` in YAML config reads from `process.env` (which includes `.env` values). |
| Nested/recursive env var interpolation | `${VAR:-${OTHER_VAR}}` adds parsing complexity and is rarely needed. Docker Compose supports it but most users never use it. | Support flat interpolation only: `${VAR}`, `${VAR:-default}`, `${VAR:?error}`. |
| `$VAR` unbraced syntax | Too easy to accidentally interpolate. `$HOME` in a test case description should not expand. Requiring braces (`${HOME}`) makes interpolation explicit. | Only support `${VAR}` braced syntax. |
| `biome check --write` in CI | Auto-fixing in CI masks bad habits and means CI changes code the developer didn't write. CI should fail-fast, not silently rewrite. | `biome ci` in GitHub Actions (read-only, fails on issues). `biome check --write` for local dev only. |
| Pre-commit hooks (husky/lefthook) as default | Adds install-time complexity, slows commits, creates friction for new contributors. Biome is fast enough that CI catches issues in seconds. | Optional setup instructions in CONTRIBUTING.md. CI is the enforcement mechanism. |

---

## Feature Dependencies

```
[Biome setup (biome.json + devDep)]
    |
    +--enables--> [PR workflow lint job (biome ci .)]
    +--enables--> [Local dev: biome check --write]
    +--referenced-by--> [Contributor docs (code style section)]

[--output <format> CLI flag]
    |
    +--enables--> [JSON reporter]
    +--enables--> [JUnit XML reporter]

[JSON output format]
    |
    +--requires--> [--output flag in CLI]
    +--reads--> [RunResult / TestResult types]

[JUnit XML output format]
    |
    +--requires--> [--output flag in CLI]
    +--reads--> [RunResult / TestResult types]
    +--enables--> [CI test visualization via dorny/test-reporter (future)]

[Env var interpolation]
    |
    +--modifies--> [Config loader (after YAML parse, before Zod validation)]
    +--fully independent of output formats and CI setup

[PR workflow (ci.yml)]
    |
    +--requires--> [Biome setup] (lint job runs biome ci)
    +--uses--> [existing bun test + tsc --noEmit]

[Contributor docs]
    |
    +--references--> [Biome setup] (code style section)
    +--references--> [PR workflow] (CI section)
    +--should be written LAST (references all other features)
```

### Dependency Notes

- **`--output` flag must exist before either reporter:** Both JSON and JUnit formatters are invoked via the same `--output <format>` flag. Build the flag infrastructure first (Commander option + validation), then add formatters.
- **PR workflow requires Biome setup:** The lint job runs `biome ci .`, which requires `biome.json` and `@biomejs/biome` devDependency. Build Biome setup before the CI workflow.
- **Contributor docs reference everything:** CONTRIBUTING.md describes setup, linting, testing, and CI. Write it after all tooling is configured so docs match reality.
- **JSON and JUnit XML are independent of each other:** Both read from `RunResult` and write to stdout. They share the `--output` flag but have no code dependency on each other. Can be built in either order.
- **Env var interpolation is fully independent:** Operates in the config loader layer, before any test execution. No dependency on output formats, CI setup, or linting.

---

## Detailed Feature Specifications

### 1. JSON Output Format

**Convention (HIGH confidence):** Follow the Jest/Vitest JSON output convention. Output a single JSON object to stdout after all tests complete. Vitest explicitly states its JSON reporter generates "a report of test results in JSON format" to stdout.

**Expected schema:**
```json
{
  "version": 1,
  "success": true,
  "summary": {
    "tests": 5,
    "passed": 4,
    "failed": 1,
    "skipped": 0,
    "cached": 3,
    "duration": 12450
  },
  "results": [
    {
      "name": "Login flow",
      "case": "Navigate to /login, enter credentials, verify dashboard",
      "status": "passed",
      "source": "cache",
      "duration": 150,
      "selfHealed": false
    },
    {
      "name": "Checkout flow",
      "case": "Add item to cart, proceed to checkout",
      "status": "failed",
      "source": "ai",
      "duration": 8500,
      "selfHealed": false,
      "error": "Timeout: checkout button not found within 60s"
    }
  ]
}
```

**Key conventions:**
- Single JSON object, not NDJSON. Entire output is one valid JSON blob.
- `version: 1` (integer) at top level for schema evolution.
- `success: boolean` at top level for quick pass/fail check (`jq '.success'`).
- `duration` in milliseconds (integer), not seconds. Matches existing `durationMs` fields.
- `error` field only present on failed tests (omitted, not null).
- `selfHealed` always present (boolean) for consistency.
- Human output continues on stderr simultaneously.
- Pipe-friendly: `superghost -c tests.yaml --output json | jq '.results[] | select(.status == "failed")'`

**Implementation notes:**
- Create `src/output/json-formatter.ts` with `formatJson(result: RunResult, version: string): string`.
- Map `RunResult` to JSON schema: add `version`, `success` (derived from `failed === 0`), rename `durationMs` to `duration`.
- Call from `cli.ts` after `runner.run()`, write to `process.stdout`.

### 2. JUnit XML Output Format

**Convention (HIGH confidence):** Follow the de facto JUnit XML standard documented at [testmoapp/junitxml](https://github.com/testmoapp/junitxml). No official spec exists, but GitHub Actions, GitLab, and Jenkins agree on the core structure.

**Expected output:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="superghost" tests="5" failures="1" errors="0"
            skipped="0" time="12.450"
            timestamp="2026-03-12T15:48:23">
  <testsuite name="superghost" tests="5" failures="1" errors="0"
             skipped="0" time="12.450"
             timestamp="2026-03-12T15:48:23">
    <testcase name="Login flow" classname="superghost" time="0.150">
      <properties>
        <property name="source" value="cache" />
        <property name="selfHealed" value="false" />
      </properties>
    </testcase>
    <testcase name="Checkout flow" classname="superghost" time="8.500">
      <properties>
        <property name="source" value="ai" />
        <property name="selfHealed" value="false" />
      </properties>
      <failure message="Timeout: checkout button not found within 60s"
               type="TestFailure">Timeout: checkout button not found within 60s</failure>
    </testcase>
  </testsuite>
</testsuites>
```

**Key conventions:**
- `time` is in **seconds** (decimal), not milliseconds. This JUnit convention differs from JSON format. Convert: `durationMs / 1000` with 3 decimal places.
- `classname` is "superghost" for all tests (single suite, flat structure).
- `<failure>` for test failures. Both `message` attribute and text content carry the error message.
- `type` attribute on `<failure>` is "TestFailure" (generic -- SuperGhost doesn't distinguish assertion types).
- `timestamp` in ISO 8601 format (e.g., `2026-03-12T15:48:23`).
- `errors="0"` always -- config errors abort before XML generation, so `<error>` elements are never produced.
- `<properties>` per testcase carry SuperGhost-specific metadata: `source` (cache/ai), `selfHealed` (true/false).
- Must XML-escape 5 characters in all attribute values and text content: `&` -> `&amp;`, `<` -> `&lt;`, `>` -> `&gt;`, `"` -> `&quot;`, `'` -> `&apos;`.
- No external dependency. Template literals are sufficient.

**Implementation notes:**
- Create `src/output/junit-formatter.ts` with `formatJunitXml(result: RunResult): string`.
- Helper function `escapeXml(str: string): string` for the 5 special characters.
- Call from `cli.ts` after `runner.run()`, write to `process.stdout`.

**CI integration example (for docs/README):**
```yaml
- name: Run SuperGhost tests
  run: superghost -c tests.yaml --output junit > test-results.xml
  if: always()

- uses: dorny/test-reporter@v2
  if: always()
  with:
    name: SuperGhost Tests
    path: test-results.xml
    reporter: java-junit
```

### 3. The `--output` CLI Flag

**Convention (MEDIUM confidence):** Most tools use `--reporter` for this, but SuperGhost's design is different. The human reporter always runs on stderr. `--output` adds structured output on stdout. This is additive behavior, not a reporter switch.

**Usage:**
```bash
superghost -c tests.yaml --output json    # JSON on stdout + human on stderr
superghost -c tests.yaml --output junit   # JUnit XML on stdout + human on stderr
superghost -c tests.yaml                  # human only on stderr, stdout empty
```

**Commander.js:**
```typescript
.option('--output <format>', 'Structured output format: json, junit')
```

**Validation:** If `--output` is provided with unsupported value, exit 2 with: `Error: Unknown output format "foo". Supported: json, junit`.

### 4. Biome Linting/Formatting

**Convention (HIGH confidence):** Biome v2.x is the standard linter/formatter for Bun-native TypeScript projects in 2025-2026. Single tool replaces ESLint + Prettier, 20-100x faster.

**Setup steps:**
1. `bun add --dev --exact @biomejs/biome`
2. Create `biome.json` (see below)
3. Run `biome check --write .` once to format all existing code
4. Commit formatted code as standalone "chore: format codebase with biome" commit
5. Add scripts to `package.json`

**Recommended `biome.json`:**
```json
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 120
  },
  "files": {
    "ignore": [
      "dist/",
      ".superghost-cache/",
      "node_modules/"
    ]
  }
}
```

**Note on indent style:** Existing codebase uses 2-space indentation (verified in all `.ts` files). Configure Biome to match: `"indentStyle": "space"`, `"indentWidth": 2`.

**Package.json scripts:**
```json
{
  "lint": "biome check .",
  "lint:fix": "biome check --write .",
  "format": "biome format --write ."
}
```

**CI command:** `biome ci .` -- read-only mode, exits non-zero on any lint or format issue. This is the CI-appropriate command (not `biome check` which implies `--write` is available).

### 5. PR Workflow (GitHub Actions)

**Convention (HIGH confidence):** Standard `pull_request` trigger with independent parallel jobs.

**Recommended `.github/workflows/ci.yml`:**
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
      - run: bunx @biomejs/biome ci .

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun test

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bunx tsc --noEmit
```

**Key decisions:**
- **Three independent parallel jobs**, not sequential. All run simultaneously. If lint fails, test still runs. All issues visible at once. Faster total CI time.
- **No E2E in PR gate.** E2E requires `ANTHROPIC_API_KEY` secret and is slow + non-deterministic. Stays on `workflow_dispatch` + weekly schedule in existing `e2e.yml`.
- **Trigger on both `pull_request` and `push` to `main`** -- catches force-pushes and direct commits.
- **No `bun-version` pin** in setup-bun -- let it use latest stable. Only pin if compatibility issues arise.
- **After creating workflow:** Configure branch protection in Settings > Branches > main > Require status checks to pass before merging > select `lint`, `test`, `typecheck`.

### 6. Env Var Interpolation

**Convention (MEDIUM confidence):** Follow Docker Compose's interpolation syntax -- the most widely-recognized `${VAR}` convention. Implement a useful subset.

**Supported syntax:**

| Syntax | Behavior | Example |
|--------|----------|---------|
| `${VAR}` | Replace with env var value. Empty string if unset. | `baseUrl: ${BASE_URL}` |
| `${VAR:-default}` | Use env var if set and non-empty, otherwise use default value. | `baseUrl: ${BASE_URL:-http://localhost:3000}` |
| `${VAR:?error msg}` | Use env var if set and non-empty, otherwise fail with clear error. | `baseUrl: ${BASE_URL:?BASE_URL is required}` |
| `$$` | Literal `$` character (escape sequence). | `case: "Check price is $$9.99"` |

**NOT supported (intentional omissions):**
- `$VAR` (unbraced) -- too easy to accidentally interpolate. Braces make intent explicit.
- `${VAR-default}` (without colon) -- the subtle "unset vs empty" distinction causes confusion. Only support `:-` which treats empty same as unset.
- `${VAR:+replacement}` (alternative value) -- rarely useful in test configs.
- `${VAR:-${OTHER}}` (nested interpolation) -- too complex for a test config tool.

**Implementation approach:**
1. Runs in config loader, after YAML parsing, before Zod validation.
2. Recursive function that walks all string values in the parsed object (handles nested objects and arrays).
3. Regex: `/\$\$|\$\{([^}]+)\}/g` to match escaped `$$` or `${...}` expressions.
4. For each `${...}` match, parse expression:
   - Contains `:-` -> split on first `:-`, var name + default value.
   - Contains `:?` -> split on first `:?`, var name + error message.
   - Otherwise -> entire content is var name.
5. Look up `process.env[varName]`.
6. Apply substitution per syntax table.
7. `$$` becomes literal `$`.

**Error handling:**
- `${VAR:?msg}` when VAR unset/empty: throw `ConfigLoadError("Environment variable VAR is not set: msg")`.
- Unclosed brace (`${VAR` without `}`): throw `ConfigLoadError` with helpful message.
- `${VAR}` when VAR is unset: substitute empty string silently (matches Docker Compose behavior).

**Note on Bun's `.env` loading:** Bun automatically loads `.env` files into `process.env` at startup. This means `${VAR}` in YAML configs automatically reads from `.env` without SuperGhost doing anything special. Document this behavior rather than building `.env` loading.

### 7. Contributor Docs

**Convention (HIGH confidence):** Standard GitHub community health files.

**Files to create:**

1. **`CONTRIBUTING.md`** (root):
   - Prerequisites: Bun >= 1.2.0
   - Setup: `git clone`, `bun install`
   - Running tests: `bun test`, `bun run typecheck`
   - Code style: Biome enforced. Run `bun run lint:fix` before committing.
   - Commit conventions (conventional commits or project style based on git log)
   - PR process: fork, branch, PR against `main`, CI must pass
   - Directory structure overview
   - Optional: local pre-commit hook setup with Biome

2. **`SECURITY.md`** (root):
   - "Do NOT open public issues for security vulnerabilities."
   - Contact method (email or GitHub private vulnerability reporting)
   - Response time commitment (48 hours to acknowledge)
   - Supported versions (current major only)

3. **`.github/ISSUE_TEMPLATE/bug_report.yml`** (YAML-based form):
   - Description (required)
   - Steps to reproduce (required)
   - Expected vs actual behavior (required)
   - SuperGhost version (`superghost --version`)
   - OS and Bun version
   - Config file snippet (sanitized, optional)
   - Error output/logs (optional)

4. **`.github/ISSUE_TEMPLATE/feature_request.yml`** (YAML-based form):
   - Problem description (required)
   - Proposed solution (optional)
   - Alternatives considered (optional)
   - Use case context (required)

5. **`.github/PULL_REQUEST_TEMPLATE.md`**:
   - Description of changes
   - Related issue (if any)
   - Checklist: tests added/updated, `bun run lint` passes, `bun test` passes, `bun run typecheck` passes

---

## MVP Recommendation

### Build Order for v0.3

1. **Biome + linting setup** -- foundational code quality gate. Every subsequent commit benefits. Set up first so all v0.3 code is lint-clean from the start.

2. **`--output` flag + JSON formatter** -- simpler format first. Establishes the flag infrastructure that JUnit also uses. JSON is straightforward serialization of existing types.

3. **JUnit XML formatter** -- more complex format, same `--output` flag. Build after JSON so the flag pattern is proven.

4. **Env var interpolation** -- independent feature. Implement after output formats so the interpolation code itself is lint-clean.

5. **GitHub Actions PR workflow** -- depends on Biome being set up and lint commands existing. Wire after tools it calls are in place.

6. **Contributor docs** -- last, because they document everything built in steps 1-5.

### Defer to v0.4+

- `--output-file <path>` flag -- only if users request (shell redirect suffices)
- `dorny/test-reporter` integration in ci.yml -- once JUnit XML exists, easy enhancement
- TAP output format -- only if specifically requested
- Watch mode + re-run on config changes
- Cost/token tracking per test run

### Out of Scope (Confirmed)

- HTML reports -- dedicated tools do it better
- Built-in `.env` loading -- Bun handles it, avoid precedence confusion
- Pre-commit hooks as default -- optional, documented in CONTRIBUTING.md
- E2E tests in PR gate -- expensive, flaky, keep on schedule
- Multiple simultaneous output formats

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Rationale |
|---------|------------|---------------------|----------|-----------|
| Biome setup | HIGH | LOW | P1 | Foundation for PR workflow. One-time setup, permanent benefit. Must come before ci.yml. |
| JSON output | HIGH | LOW | P1 | Unblocks all programmatic consumption. `RunResult` maps directly to schema. |
| JUnit XML output | HIGH | LOW-MEDIUM | P1 | Required for CI test visualization. Primary reason teams want structured output. |
| PR workflow (ci.yml) | HIGH | LOW | P1 | Depends on Biome. Without this, no quality gate on PRs. |
| Env var interpolation | MEDIUM | MEDIUM | P2 | Important for real-world configs but not blocking CI adoption. Needs careful regex/error work. |
| Contributor docs | MEDIUM | LOW | P2 | Important for open-source health but not blocking functionality. Write last. |

**Priority key:**
- P1: Build first -- enables CI pipeline and team adoption
- P2: Build second -- enhances usability and contributor experience

---

## Competitor Feature Analysis

| Feature | Jest | Vitest | Playwright Test | SuperGhost (v0.3 plan) |
|---------|------|--------|-----------------|------------------------|
| JSON output | `--json` flag, stdout, human on stderr | `--reporter=json`, stdout or file | `--reporter=json`, file only | `--output json`, stdout (stderr for human always) |
| JUnit XML | Via `jest-junit` npm package (external) | `--reporter=junit`, built-in | `--reporter=junit`, built-in | `--output junit`, built-in, no dependency |
| Env vars in config | N/A (JS config files) | N/A (JS config files) | N/A (JS config files) | `${VAR}` in YAML, Docker Compose syntax |
| Linting tool | ESLint + Prettier (common) | ESLint or Biome | ESLint + Prettier (common) | Biome (single tool, fastest) |
| PR gate template | User-configured | User-configured | User-configured | Ships with ci.yml + branch protection docs |
| Multiple reporters | Yes (array config) | Yes (array config) | Yes (array config) | One `--output` at a time (human always on stderr) |
| Simultaneous human + machine output | No (switches modes) | No (switches modes) | No (switches modes) | **Yes** (stderr=human, stdout=machine, always) |

**SuperGhost advantage:** The stderr/stdout split means users always get human-readable output AND structured output simultaneously without configuration. This is architecturally cleaner than the reporter-switching pattern used by Jest/Vitest/Playwright.

---

## Sources

- [Vitest Reporters Documentation](https://vitest.dev/guide/reporters) -- JSON and JUnit reporter conventions, output structure
- [Jest CLI Options](https://jestjs.io/docs/cli) -- `--json` flag behavior, stderr for human output
- [testmoapp/junitxml](https://github.com/testmoapp/junitxml) -- JUnit XML format specification, all element attributes, examples
- [JUnit XML reporting format (LLG)](https://llg.cubic.org/docs/junit/) -- Jenkins-compatible JUnit XML reference
- [JUnit-Schema/JUnit.xsd](https://github.com/windyroad/JUnit-Schema/blob/master/JUnit.xsd) -- XML Schema definition
- [Docker Compose Variable Interpolation](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/) -- `${VAR:-default}`, `${VAR:?error}`, escaping syntax
- [Biome GitHub Repository](https://github.com/biomejs/biome) -- Linter/formatter, installation, v2 features
- [Biome CLI Reference](https://biomejs.dev/reference/cli/) -- `biome ci` vs `biome check` distinction
- [Biome Linter Documentation](https://biomejs.dev/linter/) -- Rule configuration, recommended ruleset
- [dorny/test-reporter](https://github.com/dorny/test-reporter) -- GitHub Actions JUnit XML visualization
- [mikepenz/action-junit-report](https://github.com/mikepenz/action-junit-report) -- Alternative JUnit XML GitHub Action
- [GitHub Docs: Issue and PR Templates](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/about-issue-and-pull-request-templates) -- YAML-based form templates
- [GitHub Docs: Required Status Checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks) -- PR gate configuration
- [CONTRIBUTING.md Best Practices](https://contributing.md/how-to-build-contributing-md/) -- Contributor docs conventions
- [GitHub Docs: Community Health Files](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file) -- SECURITY.md, CONTRIBUTING.md placement
- [oven-sh/setup-bun](https://github.com/oven-sh/setup-bun) -- v2, Bun CI setup action

---

*Feature research for: SuperGhost v0.3 -- CI/CD + Team Readiness*
*Researched: 2026-03-12*
