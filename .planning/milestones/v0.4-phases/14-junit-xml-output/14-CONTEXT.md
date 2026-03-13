# Phase 14: JUnit XML Output - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Add `--output junit` flag that produces valid JUnit XML on stdout for CI test reporting dashboards (GitHub Actions, Jenkins, GitLab). Human-readable progress continues on stderr. Mirrors the batch-formatter pattern established by `json-formatter.ts` in Phase 9.

</domain>

<decisions>
## Implementation Decisions

### Classname derivation
- Derive `classname` from YAML config filename stem: `tests/checkout.yaml` -> classname="checkout"
- Strip path and extension, keep just the stem: `./e2e/login-flow.yaml` -> "login-flow"
- Fallback to "superghost" when config path isn't available (error before config loads)

### Testsuite structure
- Single `<testsuite>` wrapping all testcases (no `<testsuites>` wrapper)
- Testsuite `name` attribute = config filename stem (same as classname)
- Include standard JUnit attributes: `tests`, `failures`, `errors`, `skipped`, `time`, `timestamp`
- `timestamp` in ISO 8601 format (run start time)
- `time` in seconds (not milliseconds) per JUnit convention

### Properties metadata
- Always include both `source` and `selfHealed` properties on every testcase (not conditional like JSON)
- `<property name="source" value="cache|ai" />`
- `<property name="selfHealed" value="true|false" />`

### Failure representation
- Test failures (exitCode 1): `<failure message="..." type="TestFailure">` with error message as both attribute and element text
- Runtime errors (exitCode 2): `<error message="..." type="RuntimeError">` — distinct element per JUnit spec
- Self-healed tests that passed: no failure/error element, rely on properties metadata only
- Strip ANSI escape codes from all error/failure messages
- Escape XML-special characters (`<`, `>`, `&`, `"`, `'`) in all text content

### Dry-run output
- `--output junit --dry-run` emits testsuite with all tests as `<skipped/>` testcases
- Each skipped testcase includes `<properties>` with source metadata
- testsuite attributes: tests=N, skipped=N, failures=0, time=0.00

### Error output
- Runtime errors (unreachable baseUrl, config parse failure) emit a single testcase with `<error>` element
- classname="superghost", name="SuperGhost Error" for error testcases
- `--only <pattern>` matching zero tests: empty testsuite with tests="0" (no error testcase)

### XML formatting
- Pretty-printed with 2-space indentation (matches JSON's `JSON.stringify(null, 2)` precedent)
- XML declaration: `<?xml version="1.0" encoding="UTF-8"?>`

### Claude's Discretion
- XML string builder implementation (template literals vs DOM builder vs library)
- `escapeXml` and `stripAnsi` utility implementation details
- How to extract config filename stem (path parsing approach)
- Where to integrate junit format check in cli.ts alongside existing json check

</decisions>

<specifics>
## Specific Ideas

- Follow the exact same 3-function pattern as `json-formatter.ts`: formatJunitOutput, formatJunitDryRun, formatJunitError
- CLI integration mirrors JSON: add "junit" to the `--output` format validation, add junit branches alongside json branches in cli.ts
- Output should be pipeable: `superghost --output junit --config tests.yaml > results.xml`
- The "stdout reserved" groundwork from Phase 7 means stderr routing is already done

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `json-formatter.ts` (src/output/): Direct pattern to mirror — 3 functions (output, dry-run, error) taking RunResult/metadata/version
- `JsonOutputMetadata` interface: Reuse for config file path extraction (configFile field)
- `RunResult` / `TestResult` (runner/types.ts): All fields needed — testName, testCase, status, source, durationMs, selfHealed, error
- `writeStderr` (output/reporter.ts): Already routes all progress to stderr

### Established Patterns
- `--output <format>` flag already exists in Commander options (cli.ts:65)
- Format validation at cli.ts:87 — extend to accept "junit" alongside "json"
- JSON output branches at cli.ts:159 (dry-run) and cli.ts:251 (run complete) — add junit branches alongside
- Error JSON output in catch blocks — add junit error branches

### Integration Points
- cli.ts:87: Format validation — add "junit" to supported formats
- cli.ts:159: Dry-run structured output — add junit dry-run path
- cli.ts:251: Post-run structured output — add junit output path
- cli.ts catch blocks: Error structured output — add junit error path

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 14-junit-xml-output*
*Context gathered: 2026-03-13*
