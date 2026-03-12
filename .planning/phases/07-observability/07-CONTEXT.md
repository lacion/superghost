# Phase 7: Observability - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Add `--verbose` flag for per-step tool call output during AI execution, real-time spinner step progress updates in default mode, and route all output to stderr with ANSI suppression in non-TTY environments. Cache replays, test results, summary, and header all go to stderr — stdout stays empty (reserved for future `--output json` in v0.3).

</domain>

<decisions>
## Implementation Decisions

### Verbose output format
- Numbered log lines: `Step 1: Navigate → /login` — one dimmed line per tool call, indented under the test name
- Real-time: each step line prints as soon as the tool call completes (not batched after test)
- Step lines use `pc.dim()` — visually subordinate to test results, consistent with Phase 5-6 annotation styling
- AI execution only — cached tests show normal `✔ result (cache)` with no step breakdown
- When `--verbose` is active, spinner shows test name only (no step description on spinner to avoid redundancy with printed lines)
- `(verbose)` as a stacked header annotation, following the Phase 5-6 annotation pattern

### Spinner step progress (non-verbose)
- Spinner text updates with current tool description: `⠋ Login flow — Clicking "Sign In" button`
- Em-dash separator between test name and step description
- AI execution only — cache replays show plain test name on spinner (too fast for descriptions to matter)
- Truncate step descriptions at ~60 characters to prevent terminal line wrapping
- When `--verbose` is active, spinner stays as test name only (steps print as separate lines instead)

### Tool name mapping
- Auto-derive from tool name: `browser_navigate` → `Navigate`, `browser_click` → `Click`
- Strip known prefixes (`browser_`) for cleaner output; unknown prefixes kept as-is
- Include key argument with arrow separator: `Navigate → /login`, `Click → button.submit`, `Type → #username`
- Arrow separator `→` between tool name and key argument (distinct from em-dash spinner separator)
- Unknown/unmapped tools fall back to raw tool name
- Capitalize first letter of derived name

### Output routing
- Everything to stderr — spinner, step progress, verbose lines, test results (✔/✘), summary box, header banner, error messages
- Stdout stays empty — reserved for future structured output (`--output json` in v0.3 CI-01)
- Non-TTY (pipes, CI): static lines replace spinner — `Login flow... passed (cache, 45ms)`, no ANSI codes
- `--verbose` step lines appear in non-TTY too — plain text without dimming. The whole point of `--verbose` in CI is debugging
- ANSI suppression via picocolors auto-detection (already handles non-TTY)

### Claude's Discretion
- How to hook into Vercel AI SDK step callbacks (`onStepFinish` or similar) for real-time step progress
- Which tool argument to pick as the "key arg" for each tool type
- Exact truncation strategy for spinner descriptions (hard cut vs word boundary)
- nanospinner stderr configuration and non-TTY fallback implementation
- How to plumb step callbacks from agent-runner through test-executor to reporter

</decisions>

<specifics>
## Specific Ideas

- The annotation stacking pattern from Phase 5-6 continues: `(verbose)` joins `(filtered by --only "...")` and `(cache disabled)` as stacked dim lines under the header
- Non-TTY CI format: `Login flow... passed (cache, 45ms)` / `Search flow... FAILED (ai, 8.2s)` — "FAILED" uppercase for grep-ability
- The "everything to stderr" decision sets up cleanly for v0.3's `--output json` which would use stdout

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ConsoleReporter` (output/reporter.ts): Has spinner lifecycle (`onTestStart`, `onTestComplete`). Needs new `onStepProgress` method and stderr migration
- `nanospinner`: Already used for spinners — supports `.update({ text })` for changing spinner text mid-spin
- `picocolors` (`pc`): Auto-disables color in non-TTY — already handles ANSI suppression
- `Reporter` interface (output/types.ts): Add `onStepProgress?(step: StepInfo): void` optional method

### Established Patterns
- `Bun.write(Bun.stderr, ...)` for error output — extend to all reporter output
- `pc.dim()` for annotations and metadata — reuse for verbose step lines
- Header annotation stacking: `console.log(pc.dim("  (annotation)"))` — add `(verbose)` annotation
- Commander `.option()` for boolean flags — add `--verbose` same way as `--headed`, `--dry-run`

### Integration Points
- `agent-runner.ts:47-54`: `generateText()` call — needs `onStepFinish` callback for step progress
- `test-executor.ts:102-110`: `executeAgentFn()` call — needs to forward step callbacks to reporter
- `cli.ts:47`: Options type — add `verbose?: boolean`
- `cli.ts:185-200`: Header printing — add `(verbose)` annotation
- `cli.ts:63`: `new ConsoleReporter()` — pass verbose flag and stderr writer
- `cli.ts` lines using `console.log` for header — migrate to `Bun.write(Bun.stderr, ...)`

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-observability*
*Context gathered: 2026-03-12*
