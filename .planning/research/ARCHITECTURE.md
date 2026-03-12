# Architecture Research

**Domain:** CLI testing tool — v0.4 feature integration
**Researched:** 2026-03-12
**Confidence:** HIGH (based on direct source code inspection + standard format references)

## Standard Architecture

### System Overview (Current v0.3)

```
┌──────────────────────────────────────────────────────────────┐
│                          CLI Layer                            │
│                        src/cli.ts                             │
│  Commander.js entry point — parses flags, wires subsystems   │
└────────────────────────────┬─────────────────────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌────────────────┐  ┌────────────────┐  ┌────────────────────┐
│  src/config/   │  │  src/output/   │  │   src/infra/       │
│  loader.ts     │  │  reporter.ts   │  │   preflight.ts     │
│  schema.ts     │  │  json-formatter│  │   process-manager  │
│  (YAML→Zod)   │  │  types.ts      │  │   signals.ts       │
└───────┬────────┘  └────────────────┘  └────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────────────┐
│                       Runner Layer                             │
│  src/runner/test-runner.ts  <->  src/runner/test-executor.ts  │
└───────────────────────────────────────────────────────────────┘
        │                                    │
        ▼                                    ▼
┌────────────────┐                  ┌────────────────────────┐
│  src/agent/    │                  │   src/cache/           │
│  agent-runner  │                  │   cache-manager.ts     │
│  mcp-manager   │                  │   step-replayer.ts     │
│  model-factory │                  │   step-recorder.ts     │
└────────────────┘                  └────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | v0.4 Impact |
|-----------|---------------|-------------|
| `src/cli.ts` | Flag parsing, output dispatch, error handling | Modified — add `junit` to `--output` validation; add env var interpolation call site |
| `src/config/loader.ts` | YAML read → Zod validation | Modified — add env var substitution pass between YAML parse and Zod validation |
| `src/config/schema.ts` | Zod schema definition | Unchanged |
| `src/output/reporter.ts` | Console output to stderr | Unchanged |
| `src/output/json-formatter.ts` | Batch formatter — `RunResult` → JSON string | New sibling: `junit-formatter.ts` follows same pattern |
| `src/runner/types.ts` | `TestResult`, `RunResult` interfaces | Unchanged — JUnit formatter consumes these as-is |
| `src/runner/test-runner.ts` | Sequential orchestration, reporter hooks | Unchanged |
| `.github/workflows/release.yml` | Release gate with tests + typecheck | Unchanged |
| `.github/workflows/e2e.yml` | Weekly E2E smoke tests | Unchanged |

---

## v0.4 Integration Points

### 1. JUnit XML Output — New Formatter, Minimal CLI Change

**Integration pattern:** Mirror the existing `json-formatter.ts` batch-formatter pattern exactly.

The JSON formatter is a pure module: it exports named functions (`formatJsonOutput`, `formatJsonDryRun`, `formatJsonError`) that accept `RunResult` + metadata and return a string. No class, no side effects, no I/O.

JUnit XML follows the same contract:

```
src/output/junit-formatter.ts
  exports: formatJunitOutput(result, metadata, version) → string
  exports: formatJunitDryRun(tests, metadata, version) → string
  exports: formatJunitError(message, version, metadata) → string
```

**What changes in `src/cli.ts`:**

1. Extend `--output` validation from `"json"` to `"json" | "junit"`:
   ```
   // Line 87 currently:
   if (options.output && options.output !== "json") {
   // Becomes:
   if (options.output && !["json", "junit"].includes(options.output)) {
   ```

2. Add three parallel output blocks (normal run, dry-run, error) identical to the existing JSON blocks — call `formatJunitOutput` / `formatJunitDryRun` / `formatJunitError` when `options.output === "junit"`.

3. Update the error string in the validation message: `Supported: json, junit`.

4. Import `formatJunit*` from `./output/junit-formatter.ts`.

**JUnit XML structure to generate:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="superghost" tests="N" failures="F" errors="0" time="T.TTT">
  <testsuite name="superghost" tests="N" failures="F" errors="0" time="T.TTT"
             timestamp="ISO8601" hostname="localhost">
    <testcase name="Test Name" classname="superghost" time="T.TTT">
      <!-- no child element for passing tests -->
    </testcase>
    <testcase name="Failing Test" classname="superghost" time="T.TTT">
      <failure message="Error summary" type="TestFailure">
        Full error message
      </failure>
    </testcase>
  </testsuite>
</testsuites>
```

Key decisions:
- Single `<testsuite>` — SuperGhost has no suite hierarchy; all tests are flat
- `classname="superghost"` — CI UIs group by classname; a fixed value is correct for a flat suite
- `time` attribute in seconds (float), not milliseconds — divide `durationMs / 1000`
- `errors` is always 0 — SuperGhost has no concept of "error vs failure"; failed tests map to `<failure>`
- No `<skipped>` element for MVP — `--only` filtering means skipped tests are absent from `RunResult.results`
- Dry-run JUnit: emit all tests as `<testcase>` with no child element (no execution = no result to report)
- Error JUnit (config load failure): emit single `<testcase>` containing `<error>` child

**No new dependencies required.** Template literal string building handles XML serialization for this simple, single-level structure. No external XML library needed.

---

### 2. Env Var Interpolation — Config Loader Modification

**Integration point:** `src/config/loader.ts`, between YAML parse and Zod validation.

The loader has a clean 3-layer pipeline:

```
Layer 1:   File read   →  content: string
Layer 2:   YAML.parse  →  raw: unknown
Layer 3:   Zod.parse   →  Config
```

Env var interpolation inserts as Layer 1.5 — a string transformation on raw YAML content before parsing:

```
Layer 1:    File read             →  content: string
Layer 1.5:  interpolateEnvVars() →  interpolated: string   (NEW)
Layer 2:    YAML.parse            →  raw: unknown
Layer 3:    Zod.parse             →  Config
```

**Why string-level, not object-level:**
- Applied before YAML.parse, so `${VAR}` tokens are resolved before the parser runs — avoids YAML misparse of unquoted tokens
- Consistent with Docker Compose, GitHub Actions, CircleCI — users already know this pattern
- Simpler implementation — no recursive object traversal required

**New private function in `loader.ts`:**

```typescript
function interpolateEnvVars(content: string): string {
  return content.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (match, varName) => {
    const value = process.env[varName];
    if (value === undefined) {
      throw new ConfigLoadError(
        `Env var not set: ${varName}\n  Set it before running: export ${varName}=<value>`
      );
    }
    return value;
  });
}
```

Key decisions:
- **Fail loudly on undefined vars** — silently leaving `${VAR}` in the string causes confusing Zod errors downstream (e.g., "Expected url, received string" for `baseUrl: ${BASE_URL}`)
- **Regex pattern `[A-Z_][A-Z0-9_]*`** — conventional env var naming, avoids matching JavaScript template literal patterns if users write `${someVar}` in test case descriptions (lowercase = no match)
- **No library needed** — `string-env-interpolation` npm package implements this exact same regex; adding a dep for 4 lines is not justified
- **Error is a `ConfigLoadError`** — caught by existing error handling in `cli.ts`, routes to exit code 2 with a helpful message

**What changes in `loader.ts`:** Add `interpolateEnvVars` function (~10 lines). Call it on line ~51 between `content = await file.text()` and `raw = YAML.parse(content)`. `src/config/schema.ts` is unchanged.

---

### 3. GitHub Actions PR Workflow — New Workflow File

**Integration point:** `.github/workflows/pr.yml` (new file; no modifications to existing workflows).

**What the PR workflow needs:**

```yaml
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun test
      - run: bunx tsc --noEmit
      - run: bunx biome check .
```

**Intentional scope limits:**
- No E2E tests — requires `ANTHROPIC_API_KEY` and browser install; too slow/costly per PR and impossible for external contributors who lack secrets access
- No binary builds — `release.yml` handles that on tag push
- No `bunx playwright install` — not needed without E2E

**Relationship to existing workflows:**

| Workflow | Trigger | Unit Tests | Typecheck | Lint | E2E | Binary Build |
|----------|---------|-----------|-----------|------|-----|--------------|
| `pr.yml` (new) | `pull_request` to `main` | Yes | Yes | Yes | No | No |
| `release.yml` | Tag `v*.*.*` | Yes | Yes | No | Smoke | Yes |
| `e2e.yml` | Schedule (weekly) + manual | No | No | No | Full suite | No |

**Branch protection:** The `ci` job in `pr.yml` becomes the required status check via GitHub branch protection rules. CONTRIBUTING.md should document this expectation.

---

### 4. Contributor Docs — New Files, No Code Changes

These are documentation artifacts with zero code integration:

| File | Location | Purpose |
|------|----------|---------|
| `CONTRIBUTING.md` | repo root | Setup, branching, commit conventions, PR process, required CI check |
| `SECURITY.md` | repo root | Vulnerability reporting process |
| `.github/ISSUE_TEMPLATE/bug_report.md` | `.github/ISSUE_TEMPLATE/` | Structured bug reports |
| `.github/ISSUE_TEMPLATE/feature_request.md` | `.github/ISSUE_TEMPLATE/` | Feature proposals |
| `.github/pull_request_template.md` | `.github/` | PR checklist |

No new directories need to be created — `.github/` already exists (contains `workflows/` and `dependabot.yml`).

---

## Data Flow Changes

### Output Path: Current vs v0.4

```
Current:
  RunResult --> formatJsonOutput() --> process.stdout   (when --output json)
  RunResult --> ConsoleReporter    --> Bun.stderr        (always)

v0.4 addition:
  RunResult --> formatJunitOutput() --> process.stdout  (when --output junit)
```

Output formats are mutually exclusive via `options.output`. No multiplexing.

### Config Load Path: Current vs v0.4

```
Current:
  file.text() --> YAML.parse() --> ConfigSchema.safeParse() --> Config

v0.4:
  file.text() --> interpolateEnvVars() --> YAML.parse() --> ConfigSchema.safeParse() --> Config
```

The `Config` type and all downstream consumers are unchanged.

---

## Recommended Build Order

Feature dependency graph:

```
junit-formatter.ts      (no deps on other v0.4 features)
  --> cli.ts wiring     (requires junit-formatter)

loader.ts interpolation (no deps on other v0.4 features, fully parallel)

pr.yml                  (no code deps; best after junit + env var so CI validates new features)

contributor docs        (reference pr.yml, so build last)
```

**Recommended sequence:**
1. Env var interpolation — smallest change, highest CI value, fully self-contained
2. JUnit formatter — pure function module, no external deps
3. CLI `--output junit` wiring — minimal: validation check + 3 output blocks + import
4. PR workflow — validates all code changes in CI gate
5. Contributor docs — reference the complete workflow once it exists

---

## Anti-Patterns

### Anti-Pattern 1: JUnit Formatter as a Reporter Class

**What people do:** Create a `JUnitReporter` implementing the `Reporter` interface, emitting XML progressively via `onTestStart` / `onTestComplete` hooks.

**Why it's wrong:** JUnit XML requires totals in the `<testsuites>` and `<testsuite>` root elements (`tests="N" failures="F"`), which are only known after all tests complete. Streaming construction requires mutable accumulation state or a two-pass approach, adding complexity with no benefit.

**Do this instead:** Follow the `json-formatter.ts` pattern — batch function receiving the complete `RunResult`, returning a string. Called once after `runner.run()` resolves.

### Anti-Pattern 2: Env Var Substitution at Object Level

**What people do:** Walk the parsed `Config` object recursively, substituting `${VAR}` in string fields.

**Why it's wrong:** Requires handling nested objects, arrays, and type-specific fields. Runs after YAML parsing, which means an unquoted `${VAR}` in a URL position can cause a YAML parse error before substitution runs. Also requires changes to `schema.ts` to permit `${...}` as a pre-substitution passthrough.

**Do this instead:** Substitute at raw string level before YAML parsing. One regex pass on the file content. Docker Compose, GitHub Actions, and CircleCI all use this approach.

### Anti-Pattern 3: E2E Tests in PR Workflow

**What people do:** Add E2E smoke tests to every PR for maximum coverage confidence.

**Why it's wrong:** SuperGhost E2E requires a live AI API key (secret) and a browser install. External contributors cannot access repository secrets. Every commit push adds 2-5 minutes and API costs to the feedback loop.

**Do this instead:** PR workflow covers unit tests + typecheck + lint. E2E runs on schedule (`e2e.yml`) and on release tag (`release.yml`) where secrets are controlled and costs are acceptable.

### Anti-Pattern 4: New `--junit` Flag Instead of Extending `--output`

**What people do:** Add `--junit` as a boolean flag alongside `--output json`.

**Why it's wrong:** Creates flag proliferation and inconsistency — one output format gets a flag, another gets an option value.

**Do this instead:** Extend `--output` to accept `junit` as a second valid value. The validation block in `cli.ts` already exists and needs a one-line change.

---

## Integration Summary

| Feature | New Files | Modified Files | Estimated Change Size |
|---------|-----------|----------------|----------------------|
| JUnit XML formatter | `src/output/junit-formatter.ts` | none | ~80 lines |
| CLI `--output junit` wiring | none | `src/cli.ts` | ~20 lines |
| Env var interpolation | none | `src/config/loader.ts` | ~15 lines |
| PR workflow | `.github/workflows/pr.yml` | none | ~25 lines YAML |
| Contributor docs | 5 doc files | none | documentation only |

All four features are independent of each other. None requires changes to the runner, agent, cache, or infra layers.

---

## Sources

- Direct source code inspection: `src/cli.ts`, `src/output/json-formatter.ts`, `src/runner/types.ts`, `src/config/loader.ts`, `src/output/types.ts`, `src/runner/test-runner.ts`, `.github/workflows/release.yml`, `.github/workflows/e2e.yml` (HIGH confidence)
- [JUnit XML format guide (Gaffer)](https://gaffer.sh/blog/junit-xml-format-guide/) — element and attribute reference (MEDIUM confidence)
- [JUnit XML specification (testmoapp/junitxml)](https://github.com/testmoapp/junitxml) — community de-facto standard (MEDIUM confidence)
- [GitHub Actions pull_request trigger](https://oneuptime.com/blog/post/2025-12-20-github-actions-pull-request-triggers/view) — PR workflow patterns (HIGH confidence via official docs)
- [string-env-interpolation npm](https://www.npmjs.com/package/string-env-interpolation) — confirms `/\$\{(\w+)\}/g` regex pattern is standard; no library needed (HIGH confidence)

---
*Architecture research for: SuperGhost v0.4 feature integration*
*Researched: 2026-03-12*
