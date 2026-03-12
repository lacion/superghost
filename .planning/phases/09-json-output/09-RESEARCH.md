# Phase 9: JSON Output - Research

**Researched:** 2026-03-12
**Domain:** CLI structured output, Commander.js configureOutput, JSON formatter
**Confidence:** HIGH

## Summary

Phase 9 adds `--output json` to SuperGhost so stdout emits a single valid JSON object while human-readable progress continues on stderr. The codebase is well-prepared: all reporter output already routes to stderr via `writeStderr()` (Phase 7 decision), and the `RunResult`/`TestResult` types already contain every field needed for the JSON schema. The main work is (1) adding the `--output <format>` Commander option, (2) building a JSON formatter function, (3) redirecting Commander's built-in help/version output to stderr via `configureOutput()`, and (4) handling the dry-run JSON path.

Commander.js v14 (installed: `^14.0.3`) provides `configureOutput()` with `writeOut` and `writeErr` callbacks that control where help and version text is written. This is the correct mechanism for OUT-04. The `--output` flag is a standard Commander `.option()` addition, identical to existing flags like `--headed` and `--verbose`.

**Primary recommendation:** Implement a pure `formatJsonOutput()` function that takes `RunResult` plus metadata and returns a JSON string. Write it to stdout with `process.stdout.write()` after `runner.run()` completes. Use `configureOutput({ writeOut: (str) => writeStderr(str) })` unconditionally on the Commander instance to redirect help/version to stderr.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- JSON schema mirrors existing `TestResult` fields per test: testName, testCase, status, source (cache/ai), durationMs, selfHealed, error (message string only)
- Run-level summary stats at top level: passed, failed, cached, skipped, totalDurationMs (from existing `RunResult`)
- Metadata object: model, provider, configFile, baseUrl
- Include exitCode in JSON (1 = test failure, 2 = config/runtime error)
- Include testCase (plain English description) alongside testName
- No per-step tool call data in JSON -- verbose step output stays on stderr only
- JSON schema is stable regardless of --verbose flag
- `--output <format>` flag -- `--output json` now, extensible for `--output junit` in Phase 10
- Omitting `--output` = current human-readable behavior
- Unknown format values exit 2 with error: "Unknown output format 'csv'. Supported: json"
- Redirect all Commander output (help, version) to stderr unconditionally via `configureOutput()`
- Failed tests include error message string only (no stack traces)
- Runtime errors emit valid JSON with success: false, top-level "error" field, and exitCode: 2
- Consumers always get parseable JSON regardless of failure mode when --output json is active
- `--output json --dry-run` produces JSON dry-run output with test list, cache source per test, and `dryRun: true` field
- `--output json --verbose` -- verbose adds step details to stderr only, JSON output unchanged
- `--output json` keeps human-readable spinner/progress on stderr
- `--output json --only <pattern>` includes filter info in metadata

### Claude's Discretion
- Exact JSON field naming convention (camelCase vs snake_case)
- How to implement the JSON formatter (new reporter class vs formatter function)
- Commander `configureOutput()` implementation details
- How to plumb --output flag through to reporter/formatter selection
- Timestamp format in metadata (ISO 8601 vs Unix epoch)

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OUT-01 | `--output json` produces machine-readable JSON on stdout with version, success, and full test results | JSON formatter function + `process.stdout.write()` after run completion; existing `RunResult`/`TestResult` types provide all needed data |
| OUT-03 | Human-readable progress on stderr runs simultaneously with structured stdout output | Already implemented -- `ConsoleReporter` and `writeStderr()` route all progress to stderr; no changes needed to reporter for simultaneous operation |
| OUT-04 | Commander.js help/version output redirected to stderr | `program.configureOutput({ writeOut: (str) => writeStderr(str) })` applied unconditionally to Commander instance |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| commander | ^14.0.3 | CLI flag parsing, `configureOutput()` | Already installed, provides `configureOutput` API for output redirection |
| bun:test | built-in | Unit and integration tests | Project standard test framework |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| picocolors | ^1.1.1 | Colored error messages for invalid format | Already imported in cli.ts |
| nanospinner | ^1.2.2 | Spinner progress on stderr | Already used by ConsoleReporter, continues working during --output json |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Pure formatter function | New JsonReporter class implementing Reporter interface | A class is overkill -- JSON output is a single write after run completion, not incremental. A pure function is simpler and more testable |
| `JSON.stringify()` directly | Zod schema for output validation | Zod validation of output adds complexity with no user benefit; the types guarantee shape at compile time |

**Installation:**
No new dependencies needed. All required libraries are already installed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── output/
│   ├── reporter.ts        # Existing ConsoleReporter + writeStderr (unchanged)
│   ├── json-formatter.ts  # NEW: formatJsonOutput() + formatJsonDryRun() + types
│   └── types.ts           # Existing Reporter interface (unchanged)
├── cli.ts                 # Add --output flag, configureOutput(), JSON write points
```

### Pattern 1: Pure Formatter Function
**What:** A `formatJsonOutput()` function that takes run data + metadata and returns a JSON string. Not a class, not a Reporter implementation.
**When to use:** JSON output is written once at the end of a run, not incrementally. A pure function is the right abstraction.
**Example:**
```typescript
// src/output/json-formatter.ts

export interface JsonOutputMetadata {
  model: string;
  provider: string;
  configFile: string;
  baseUrl: string | undefined;
  timestamp: string; // ISO 8601
  filter?: {
    pattern: string;
    matched: number;
    total: number;
  };
}

export interface JsonOutput {
  version: string;
  success: boolean;
  exitCode: number;
  dryRun?: boolean;
  metadata: JsonOutputMetadata;
  summary: {
    passed: number;
    failed: number;
    cached: number;
    skipped: number;
    totalDurationMs: number;
  };
  tests: Array<{
    testName: string;
    testCase: string;
    status: "passed" | "failed";
    source: "cache" | "ai";
    durationMs: number;
    selfHealed?: boolean;
    error?: string;
  }>;
  error?: string; // Top-level error for runtime failures
}

export function formatJsonOutput(
  runResult: RunResult,
  metadata: JsonOutputMetadata,
  version: string,
  exitCode: number,
): string {
  const output: JsonOutput = {
    version,
    success: runResult.failed === 0,
    exitCode,
    metadata,
    summary: {
      passed: runResult.passed,
      failed: runResult.failed,
      cached: runResult.cached,
      skipped: runResult.skipped,
      totalDurationMs: runResult.totalDurationMs,
    },
    tests: runResult.results.map((r) => ({
      testName: r.testName,
      testCase: r.testCase,
      status: r.status,
      source: r.source,
      durationMs: r.durationMs,
      ...(r.selfHealed ? { selfHealed: true } : {}),
      ...(r.error ? { error: r.error } : {}),
    })),
  };
  return JSON.stringify(output, null, 2);
}
```

### Pattern 2: Commander configureOutput for stderr redirect
**What:** Redirect Commander's built-in `writeOut` (help, version) to stderr unconditionally.
**When to use:** Applied once on the Commander instance, before any parsing.
**Example:**
```typescript
// In cli.ts, after creating program:
program.configureOutput({
  writeOut: (str) => writeStderr(str.trimEnd()),
  writeErr: (str) => writeStderr(str.trimEnd()),
});
```

### Pattern 3: Error-safe JSON Output
**What:** Wrap the entire action in a try/catch that emits valid JSON even on runtime errors when `--output json` is active.
**When to use:** Any catch block in cli.ts when options.output === "json".
**Example:**
```typescript
// In catch block of cli.ts action:
if (options.output === "json") {
  const errorJson = {
    version: pkg.version,
    success: false,
    exitCode: 2,
    error: msg,
    metadata: { configFile: options.config },
    summary: { passed: 0, failed: 0, cached: 0, skipped: 0, totalDurationMs: 0 },
    tests: [],
  };
  process.stdout.write(JSON.stringify(errorJson, null, 2) + "\n");
}
```

### Pattern 4: JSON Dry-Run Output
**What:** When `--output json --dry-run` is used, emit a JSON object with the test list and cache source per test.
**When to use:** In the dry-run section of cli.ts.
**Example:**
```typescript
export function formatJsonDryRun(
  tests: Array<{ name: string; case: string; source: "cache" | "ai" }>,
  metadata: JsonOutputMetadata,
  version: string,
): string {
  return JSON.stringify({
    version,
    success: true,
    exitCode: 0,
    dryRun: true,
    metadata,
    summary: { total: tests.length, cached: tests.filter(t => t.source === "cache").length },
    tests: tests.map(t => ({ testName: t.name, testCase: t.case, source: t.source })),
  }, null, 2);
}
```

### Anti-Patterns to Avoid
- **Writing JSON incrementally during test execution:** JSON must be a single valid object. Never write partial JSON to stdout during the run. All JSON is buffered and written once at the end.
- **Using `console.log()` for JSON output:** `console.log()` adds a trailing newline and can be intercepted by test frameworks. Use `process.stdout.write(json + "\n")` directly.
- **Conditionally routing stderr based on --output flag:** The CONTEXT.md says stderr progress always runs, even with `--output json`. Don't add `if (options.output !== "json")` guards around reporter calls.
- **Making configureOutput conditional on --output flag:** The locked decision says "Redirect all Commander output to stderr unconditionally." Apply it always.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CLI output redirection | Custom process.stdout monkey-patching | Commander `configureOutput()` | Commander has a first-class API for this; monkey-patching breaks other libraries |
| JSON serialization | Custom string concatenation | `JSON.stringify(obj, null, 2)` | JSON.stringify handles escaping, Unicode, nested objects correctly |
| Format validation | Runtime Zod schema for output | TypeScript interface + compiler | Output shape is fully controlled by our code; runtime validation adds cost with no benefit |

## Common Pitfalls

### Pitfall 1: Commander help/version exits before action runs
**What goes wrong:** Commander's `--help` and `--version` write to stdout and call `process.exit(0)` by default. The `--output` flag hasn't been parsed yet when help/version fires.
**Why it happens:** Commander processes `--help` and `--version` before calling the action handler.
**How to avoid:** Apply `configureOutput()` unconditionally (not inside the action), so it takes effect before help/version processing.
**Warning signs:** `superghost --output json --help | jq .` fails with parse error.

### Pitfall 2: Existing integration tests check stdout for help/version
**What goes wrong:** Tests `cli-pipeline.test.ts` lines 58-69 assert `stdout` contains help and version text. After redirecting to stderr, these tests break.
**Why it happens:** The existing tests were written before the stderr redirect decision.
**How to avoid:** Update these tests to check `stderr` instead of `stdout`. Also update lines 92-97 (help showing --only, --no-cache).
**Warning signs:** Test suite fails after adding `configureOutput()`.

### Pitfall 3: Non-JSON text leaking to stdout
**What goes wrong:** Any `console.log()`, `process.stdout.write()` call outside the JSON formatter corrupts stdout.
**Why it happens:** Overlooked console.log in a dependency, or an uncaught warning.
**How to avoid:** Integration test that pipes `--output json` through `JSON.parse()` and verifies no parse errors. Grep codebase for `console.log` and `process.stdout.write` to ensure no leaks.
**Warning signs:** `| jq .` fails intermittently.

### Pitfall 4: Error JSON missing required fields
**What goes wrong:** Runtime errors (unreachable baseUrl, missing API key) emit partial or non-JSON output when `--output json` is active.
**Why it happens:** Error paths exit early before JSON write logic runs.
**How to avoid:** The catch block must check `options.output === "json"` and emit a complete error JSON before exiting. Needs careful placement -- the options variable must be accessible in the catch scope.
**Warning signs:** `superghost --output json --config bad.yaml | jq .` returns parse error.

### Pitfall 5: options.output not accessible in early error paths
**What goes wrong:** Some errors (like `.exitOverride()` for missing --config) fire before the action runs, so `options.output` doesn't exist yet.
**Why it happens:** Commander validates required options before calling the action.
**How to avoid:** For Commander's own errors (missing required flag, unknown option), the `configureOutput({ outputError })` callback handles stderr routing. These errors should NOT emit JSON since the user hasn't successfully invoked `--output json` without a valid command line. Only errors *inside* the action (after options parse) need JSON wrapping.
**Warning signs:** Edge case where `superghost --output json` (no --config) outputs nothing to stdout.

## Code Examples

### Adding --output flag to Commander
```typescript
// In cli.ts, add to the option chain:
.option("--output <format>", "Output format (json)")
```

### Format validation (early in action)
```typescript
// At top of action, after options destructuring:
if (options.output && options.output !== "json") {
  writeStderr(`${pc.red("Error:")} Unknown output format '${options.output}'. Supported: json`);
  setTimeout(() => process.exit(2), 100);
  return;
}
```

### Writing JSON to stdout after run
```typescript
// After runner.run() and before process.exit():
if (options.output === "json") {
  const metadata: JsonOutputMetadata = {
    model: config.model,
    provider,
    configFile: options.config,
    baseUrl: config.baseUrl,
    timestamp: new Date().toISOString(),
    ...(options.only ? {
      filter: { pattern: options.only, matched: config.tests.length, total: totalTestCount }
    } : {}),
  };
  const json = formatJsonOutput(result, metadata, pkg.version, code);
  process.stdout.write(json + "\n");
}
```

### Integration test pattern
```typescript
test("--output json produces valid JSON on stdout", async () => {
  const { exitCode, stdout, stderr } = await runCli(
    ["--config", "tests/fixtures/valid-config.yaml", "--output", "json", "--dry-run"],
    { OPENAI_API_KEY: "fake-key" },
  );
  expect(exitCode).toBe(0);
  const parsed = JSON.parse(stdout); // Must not throw
  expect(parsed.version).toBe("0.2.0");
  expect(parsed.success).toBe(true);
  expect(parsed.dryRun).toBe(true);
  expect(parsed.tests).toBeArray();
  // Human progress still on stderr
  expect(stderr.length).toBeGreaterThan(0);
});

test("--help outputs to stderr, not stdout", async () => {
  const { exitCode, stdout, stderr } = await runCli(["--help"]);
  expect(exitCode).toBe(0);
  expect(stdout).toBe(""); // Nothing on stdout
  expect(stderr).toContain("--config");
  expect(stderr).toContain("superghost");
});

test("unknown --output format exits 2", async () => {
  const { exitCode, stderr } = await runCli(
    ["--config", "tests/fixtures/valid-config.yaml", "--output", "csv"],
    { OPENAI_API_KEY: "fake-key" },
  );
  expect(exitCode).toBe(2);
  expect(stderr).toContain("Unknown output format");
  expect(stderr).toContain("csv");
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Commander writes help/version to stdout | `configureOutput()` redirects to any writable | Commander v7+ | Enables stdout reservation for structured output |
| Custom output format parsing | `.option("--output <format>")` with validation in action | N/A (standard pattern) | Clean extensibility for Phase 10 JUnit |

## Open Questions

1. **camelCase vs snake_case for JSON fields**
   - What we know: The CONTEXT.md lists fields using camelCase (testName, testCase, durationMs, selfHealed, totalDurationMs). The existing TypeScript types also use camelCase.
   - Recommendation: Use **camelCase** consistently. It matches the TypeScript types, avoids field name mapping, and is the convention in Node.js/JavaScript ecosystems.

2. **Timestamp format**
   - What we know: ISO 8601 is the universal standard for machine-readable timestamps. Unix epoch is simpler but less human-readable.
   - Recommendation: Use **ISO 8601** (`new Date().toISOString()`) -- it's what `JSON.stringify` produces for Date objects and is unambiguous across timezones.

3. **Pretty-print vs compact JSON**
   - What we know: `JSON.stringify(obj, null, 2)` produces readable output; `JSON.stringify(obj)` is compact.
   - Recommendation: Use **pretty-printed** (2-space indent) -- it's better for debugging and the size difference is negligible for test results. Users can always pipe through `jq -c` for compact.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in) |
| Config file | none (bun:test works out of the box) |
| Quick run command | `bun test tests/unit/output/json-formatter.test.ts` |
| Full suite command | `bun test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OUT-01 | `--output json` produces valid JSON on stdout with version, success, tests | integration | `bun test tests/integration/cli-pipeline.test.ts -t "output json"` | No -- Wave 0 |
| OUT-01 | JSON formatter produces correct shape from RunResult | unit | `bun test tests/unit/output/json-formatter.test.ts` | No -- Wave 0 |
| OUT-01 | JSON dry-run output includes test list and cache sources | integration | `bun test tests/integration/cli-pipeline.test.ts -t "dry-run.*json"` | No -- Wave 0 |
| OUT-03 | Human-readable stderr output continues during --output json | integration | `bun test tests/integration/cli-pipeline.test.ts -t "stderr.*json"` | No -- Wave 0 |
| OUT-04 | Commander help/version goes to stderr not stdout | integration | `bun test tests/integration/cli-pipeline.test.ts -t "help.*stderr"` | No -- Wave 0 |
| OUT-04 | Unknown format exits 2 with error | integration | `bun test tests/integration/cli-pipeline.test.ts -t "unknown.*format"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test tests/unit/output/json-formatter.test.ts && bun test tests/integration/cli-pipeline.test.ts`
- **Per wave merge:** `bun test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/output/json-formatter.test.ts` -- unit tests for formatJsonOutput(), formatJsonDryRun(), formatJsonError()
- [ ] Integration tests added to existing `tests/integration/cli-pipeline.test.ts` -- covers OUT-01, OUT-03, OUT-04
- [ ] Update existing help/version tests in `tests/integration/cli-pipeline.test.ts` (lines 58-69, 92-97) to check stderr instead of stdout after configureOutput redirect

## Sources

### Primary (HIGH confidence)
- Commander.js v14 TypeScript typings (`node_modules/commander/typings/index.d.ts`) -- `configureOutput()`, `OutputConfiguration` interface verified
- Existing codebase: `src/cli.ts`, `src/output/reporter.ts`, `src/output/types.ts`, `src/runner/types.ts` -- all integration points verified
- Existing tests: `tests/integration/cli-pipeline.test.ts`, `tests/unit/output/reporter.test.ts` -- test patterns and assertion style confirmed

### Secondary (MEDIUM confidence)
- None needed -- all findings verified from installed source code

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all libraries already installed and verified
- Architecture: HIGH -- pure function pattern is straightforward, all integration points identified in existing code
- Pitfalls: HIGH -- existing test suite reveals exact lines that will break, Commander API verified from typings

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable -- no external dependencies or fast-moving APIs)
