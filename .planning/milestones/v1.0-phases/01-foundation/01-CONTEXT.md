# Phase 1: Foundation - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can run `superghost --config tests.yaml` and get meaningful feedback on config validity and test structure. Full CLI scaffold wired with process cleanup guaranteed. No AI calls yet — config loading, CLI wiring, output formatting, and MCP subprocess lifecycle management.

Requirements: CONF-01, CONF-02, CONF-03, CONF-04, CONF-05, CLI-01, CLI-02, CLI-03, CLI-04, CLI-05, INFR-01, INFR-02

</domain>

<decisions>
## Implementation Decisions

### Config syntax design
- Named test format: every test is an object with required `name` and `case` fields
- No shorthand string syntax — object-only format for consistency
- camelCase field names throughout (baseUrl, maxAttempts, cacheDir, etc.)
- Example:
  ```yaml
  baseUrl: https://myapp.com
  tests:
    - name: Login Flow
      case: check that login works
    - name: Dashboard
      case: verify dashboard loads
      timeout: 120000
  ```

### CLI output style
- Colored output: green for PASS, red for FAIL, dim for timing/metadata
- Auto-disable colors when not a TTY (piped output, CI without color support)
- Spinner animation while a test is running (auto-disable in non-TTY)
- Header shows version and test count: `superghost v0.1.0 / Running 3 test(s)...`
- Box summary after all tests with bordered layout:
  ```
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    SuperGhost Results
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    Total:   3
    Passed:  2
    Failed:  1
    Cached:  1
    Time:    10.4s
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ```
- Failed tests listed below summary with error messages

### Error reporting
- Show ALL Zod validation errors at once (not just the first one) — user fixes everything in one pass
- Format: numbered list with field path and message
  ```
  Error: Invalid config (3 issues)
    1. tests[0].case: Required
    2. tests[1].timeout: Expected number, received string
    3. baseUrl: Invalid url
  ```
- Missing/unreadable config file: error message + actionable hint
  ```
  Error: Config file not found: tests.yaml
    Create a config file or specify a different path:
      superghost --config <path>
  ```
- YAML syntax errors: show the problematic line from the file with caret pointer
  ```
  Error: Invalid YAML syntax
    tests.yaml:5:3
    5 |   - name Login Flow
               ^ expected ':'
  ```
- Colored errors matching CLI style (red for "Error:", dim for hints/paths)

### Default values
- model: `claude-sonnet-4-6`
- modelProvider: `anthropic` (default; always explicit, no auto-inference from model name)
- browser: `chromium`
- headless: `true`
- timeout: `60000` (60 seconds)
- maxAttempts: `3`
- cacheDir: `.superghost-cache`
- recursionLimit: `500`

### Claude's Discretion
- Spinner library choice (ora, nanospinner, or custom)
- Color library choice (chalk, picocolors, or Bun built-in)
- Exact spacing and typography in output
- MCP process cleanup implementation details
- Project file/folder structure

</decisions>

<specifics>
## Specific Ideas

- Output should feel polished and modern — spinners, colors, clean box summaries
- Error messages should be actionable — always tell the user what to do next
- Config syntax should be strict and consistent — no multiple formats for the same thing
- `modelProvider` is always explicit (overrides PROV-05 auto-inference design) — user must specify provider when using non-default model, but default config needs no `modelProvider` since it defaults to `anthropic`

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- SuperGhost's config schema, CLI wiring, reporter, and test runner follow natural language E2E testing patterns
- The Zod schema supports `name` and `case` fields for named tests with per-test baseUrl and timeout overrides
- ConsoleReporter is extended with colors and spinners for polished terminal output

### Established Patterns
- No existing codebase patterns (greenfield) — patterns will be established in this phase
- Reference uses Commander.js for CLI, Zod for validation, class-based reporter

### Integration Points
- CLI entry point (`src/cli.ts`) will be the `bin` target in package.json
- Config schema types will be imported by all subsequent phases (agent, cache, runner)
- Reporter interface will be extended in Phase 2 for AI/cache source reporting

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-03-10*
