# Phase 9: JSON Output - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Add `--output json` flag that produces a single valid JSON object on stdout containing version, success, summary stats, and full test results. Human-readable progress (spinners, step descriptions) continues on stderr simultaneously. Commander.js help and version output is redirected to stderr so stdout is never corrupted by non-JSON content.

</domain>

<decisions>
## Implementation Decisions

### JSON schema design
- Mirror existing `TestResult` fields per test: testName, testCase, status, source (cache/ai), durationMs, selfHealed, error (message string only)
- Include run-level summary stats at top level: passed, failed, cached, skipped, totalDurationMs (from existing `RunResult`)
- Include metadata object: model, provider, configFile, baseUrl
- Include exitCode in JSON (1 = test failure, 2 = config/runtime error) so consumers can distinguish without checking process exit
- Include testCase (plain English description) alongside testName for report readability
- No per-step tool call data in JSON — verbose step output stays on stderr only
- JSON schema is stable regardless of --verbose flag

### Flag design
- `--output <format>` flag — `--output json` now, extensible for `--output junit` in Phase 10
- Omitting `--output` = current human-readable behavior (no explicit "human" value needed)
- Unknown format values (e.g., `--output csv`) exit 2 with error: "Unknown output format 'csv'. Supported: json"
- Redirect all Commander output (help, version) to stderr unconditionally via `configureOutput()` — not just when --output is active. Matches Phase 7's "stdout reserved" decision

### Error handling in JSON
- Failed tests include error message string only (no stack traces, no structured error objects)
- Runtime errors (unreachable baseUrl, missing API key) still emit valid JSON with success: false, a top-level "error" field, and exitCode: 2
- Consumers always get parseable JSON regardless of failure mode when --output json is active

### Flag interactions
- `--output json --dry-run` produces JSON dry-run output with test list, cache source per test, and `dryRun: true` field
- `--output json --verbose` — verbose adds step details to stderr only, JSON output is unchanged
- `--output json` keeps human-readable spinner/progress on stderr (required by OUT-03)
- `--output json --only <pattern>` includes filter info in metadata (pattern, matched count, total count)

### Claude's Discretion
- Exact JSON field naming convention (camelCase vs snake_case)
- How to implement the JSON formatter (new reporter class vs formatter function)
- Commander `configureOutput()` implementation details
- How to plumb --output flag through to reporter/formatter selection
- Timestamp format in metadata (ISO 8601 vs Unix epoch)

</decisions>

<specifics>
## Specific Ideas

- The "stdout reserved" groundwork from Phase 7 means most of the stderr routing is already done — this phase focuses on the JSON writing to stdout and Commander redirect
- JSON should be `JSON.parse()`-able by piping directly: `superghost --output json --config tests.yaml | jq .`
- Runtime error JSON keeps the same shape so consumers don't need two parsing paths

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ConsoleReporter` (output/reporter.ts): Already routes all output to stderr. Can serve as reference for a new JSON reporter or be extended
- `writeStderr` (output/reporter.ts): Centralized stderr writer, used everywhere
- `RunResult` / `TestResult` (runner/types.ts): Already contain all fields needed for JSON schema — testName, testCase, status, source, durationMs, selfHealed, error, passed, failed, cached, skipped, totalDurationMs
- `Reporter` interface (output/types.ts): Has `onTestStart`, `onTestComplete`, `onRunComplete`, `onStepProgress?` — new JSON formatter can implement this or be a post-run formatter

### Established Patterns
- Commander `.option()` for flags — add `--output <format>` same way as `--headed`, `--verbose`
- Commander `.exitOverride()` already configured for exit code 2 on config errors
- `Bun.write(Bun.stderr, ...)` for stderr, `process.stdout.write()` or `console.log()` available for stdout JSON
- `pkg.version` from package.json already imported in cli.ts

### Integration Points
- `cli.ts:49`: Commander options — add `.option("--output <format>", ...)`
- `cli.ts:63-69`: Options type — add `output?: string`
- `cli.ts:206-207`: After `runner.run()` and before `process.exit()` — write JSON to stdout
- `cli.ts:43`: Commander instance — add `.configureOutput()` for help/version stderr redirect
- `cli.ts:231-236`: Help request handler with animated banner — needs stderr routing
- `cli.ts:110-138`: Dry-run section — add JSON dry-run path

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-json-output*
*Context gathered: 2026-03-12*
