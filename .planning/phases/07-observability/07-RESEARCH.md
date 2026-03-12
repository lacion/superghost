# Phase 7: Observability - Research

**Researched:** 2026-03-12
**Domain:** CLI observability, Vercel AI SDK callbacks, stderr output routing, TTY detection
**Confidence:** HIGH

## Summary

Phase 7 adds real-time observability during AI test execution via two mechanisms: (1) a `--verbose` flag that prints per-tool-call step lines, and (2) spinner text updates showing current tool descriptions in the default mode. All output must route to stderr with ANSI suppression in non-TTY environments.

The project already has all necessary dependencies installed (`ai@^6.0.116`, `nanospinner@^1.2.2`, `picocolors@^1.1.1`). The Vercel AI SDK's `experimental_onToolCallFinish` callback on `generateText()` provides exactly the per-tool-call granularity needed. Nanospinner already defaults to `process.stderr` and has `.update()` for live spinner text changes. Picocolors auto-detects non-TTY and suppresses ANSI codes. The main engineering work is plumbing the callback from `executeAgent()` through `TestExecutor` and into `ConsoleReporter`, plus migrating all `console.log` calls to `Bun.write(Bun.stderr, ...)`.

**Primary recommendation:** Use `experimental_onToolCallFinish` on `generateText()` for real-time per-tool-call progress, pipe events through a callback chain from agent-runner to test-executor to reporter, and migrate all output to stderr using `Bun.write(Bun.stderr, ...)`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Verbose output format: Numbered log lines `Step 1: Navigate -> /login` -- one dimmed line per tool call, indented under test name. Real-time printing as each tool call completes. Uses `pc.dim()`. AI execution only (not cached tests). When verbose active, spinner shows test name only (no step description). `(verbose)` as stacked header annotation.
- Spinner step progress (non-verbose): Spinner text updates with current tool description `Login flow -- Clicking "Sign In" button`. Em-dash separator. AI execution only. Truncate at ~60 chars. When verbose active, spinner stays as test name only.
- Tool name mapping: Auto-derive from tool name stripping `browser_` prefix. Capitalize first letter. Include key argument with arrow separator. Unknown/unmapped tools fall back to raw name.
- Output routing: Everything to stderr. Stdout stays empty (reserved for future `--output json`). Non-TTY: static lines replace spinner, no ANSI codes. `--verbose` step lines appear in non-TTY too as plain text. ANSI suppression via picocolors auto-detection.

### Claude's Discretion
- How to hook into Vercel AI SDK step callbacks (`onStepFinish` or similar) for real-time step progress
- Which tool argument to pick as the "key arg" for each tool type
- Exact truncation strategy for spinner descriptions (hard cut vs word boundary)
- nanospinner stderr configuration and non-TTY fallback implementation
- How to plumb step callbacks from agent-runner through test-executor to reporter

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FLAG-02 | User can run `--verbose` to see per-step AI tool call output during test execution | Commander `.option('--verbose')`, `experimental_onToolCallFinish` callback on `generateText()`, `ConsoleReporter.onStepProgress()` method, tool name mapping utility |
| OBS-01 | CLI shows real-time step progress during AI execution (tool call names mapped to human descriptions) | `experimental_onToolCallFinish` provides `toolCall.toolName` and `toolCall.input` per-call, nanospinner `.update()` for live text changes, tool-name-map module for `browser_navigate` -> `Navigate` |
| OBS-02 | All progress/spinner output routes to stderr (not stdout), with TTY detection gating ANSI output | nanospinner already defaults to `process.stderr`, picocolors auto-disables color on non-TTY, migrate all `console.log` to `Bun.write(Bun.stderr, ...)` |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ai | ^6.0.116 | `experimental_onToolCallFinish` callback on `generateText()` | Provides per-tool-call events during agent execution |
| nanospinner | ^1.2.2 | Spinner with `.update()` for live text changes | Already defaults to `process.stderr`, supports `.update(text)` |
| picocolors | ^1.1.1 | `pc.dim()` for step lines, auto ANSI suppression on non-TTY | `isColorSupported` checks `stdout.isTTY` and `NO_COLOR` env |
| commander | ^14.0.3 | `.option('--verbose')` flag registration | Same pattern as existing `--headed`, `--dry-run`, `--no-cache` |

### Supporting
No new libraries required. All dependencies already installed.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `experimental_onToolCallFinish` | `onStepFinish` | `onStepFinish` fires per LLM call (step), not per tool call. A single step may include multiple tool calls. `experimental_onToolCallFinish` gives per-tool-call granularity which is what we need for `Step 1: Navigate`, `Step 2: Click` |

## Architecture Patterns

### Callback Chain Pattern (agent-runner -> test-executor -> reporter)
```
cli.ts
  |-- creates ConsoleReporter(verbose, isTTY)
  |-- passes onStepProgress callback to TestExecutor
  |
  v
TestExecutor.execute()
  |-- passes onStepProgress to executeAgent() (only for AI execution, not cache)
  |
  v
executeAgent() -- generateText({ ..., experimental_onToolCallFinish })
  |-- on each tool call finish: calls onStepProgress(stepInfo)
  |
  v
ConsoleReporter.onStepProgress(stepInfo)
  |-- verbose mode: prints dim step line to stderr
  |-- default mode: updates spinner text with tool description
```

### Recommended New/Modified Files
```
src/
  output/
    reporter.ts      # MODIFY: add onStepProgress, migrate console.log -> stderr
    types.ts         # MODIFY: add StepInfo type and onStepProgress to Reporter
    tool-name-map.ts # NEW: tool name -> human description mapping
  agent/
    agent-runner.ts  # MODIFY: accept + wire onStepProgress callback
  runner/
    test-executor.ts # MODIFY: accept + forward onStepProgress callback
  cli.ts             # MODIFY: add --verbose, wire callback, migrate output to stderr
```

### Pattern 1: Tool Name Mapping
**What:** Map raw MCP tool names to human-readable descriptions with key argument
**When to use:** Every tool call event, for both spinner and verbose output
**Example:**
```typescript
// src/output/tool-name-map.ts

const PREFIX_MAP: Record<string, string> = {
  browser_navigate: "Navigate",
  browser_click: "Click",
  browser_type: "Type",
  browser_screenshot: "Screenshot",
  browser_wait_for_text: "Wait for text",
  browser_hover: "Hover",
  browser_select_option: "Select",
  browser_go_back: "Go back",
  browser_go_forward: "Go forward",
  browser_press_key: "Press key",
  browser_drag: "Drag",
  browser_resize: "Resize",
  browser_handle_dialog: "Handle dialog",
  browser_file_upload: "Upload file",
  browser_pdf_save: "Save PDF",
  browser_close: "Close",
  browser_console_messages: "Console messages",
  browser_install: "Install browser",
  browser_tab_list: "List tabs",
  browser_tab_new: "New tab",
  browser_tab_select: "Select tab",
  browser_tab_close: "Close tab",
  browser_network_requests: "Network requests",
  browser_snapshot: "Snapshot",
};

// Key argument selection per tool
const KEY_ARG_MAP: Record<string, string> = {
  browser_navigate: "url",
  browser_click: "element",   // or "ref" depending on MCP tool schema
  browser_type: "element",
  browser_hover: "element",
  browser_select_option: "element",
  browser_press_key: "key",
  browser_wait_for_text: "text",
};

export interface StepDescription {
  action: string;       // "Navigate", "Click", etc.
  keyArg?: string;      // "/login", "button.submit", etc.
  full: string;         // "Navigate -> /login"
}

export function describeToolCall(
  toolName: string,
  input: Record<string, unknown>,
): StepDescription {
  // Look up human name, or capitalize raw name as fallback
  const action = PREFIX_MAP[toolName]
    ?? toolName.replace(/^browser_/, "").replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase());

  const keyArgField = KEY_ARG_MAP[toolName];
  const keyArg = keyArgField ? String(input[keyArgField] ?? "") : undefined;

  const full = keyArg ? `${action} \u2192 ${keyArg}` : action;

  return { action, keyArg: keyArg || undefined, full };
}
```

### Pattern 2: Callback-Based Step Progress
**What:** Pass an optional callback function through the execution chain
**When to use:** Connecting agent-runner events to reporter without tight coupling
**Example:**
```typescript
// StepInfo type for the callback
export interface StepInfo {
  stepNumber: number;   // 1-based counter across all tool calls in this test
  toolName: string;     // raw tool name e.g. "browser_navigate"
  input: Record<string, unknown>;
  description: StepDescription; // pre-computed from describeToolCall()
}

// Callback type
export type OnStepProgress = (step: StepInfo) => void;

// In agent-runner.ts - wire into generateText
export async function executeAgent(config: {
  // ... existing fields ...
  onStepProgress?: OnStepProgress;
}): Promise<AgentExecutionResult> {
  let stepCounter = 0;

  const { output } = await generateText({
    // ... existing options ...
    experimental_onToolCallFinish: (event) => {
      if (event.success && config.onStepProgress) {
        stepCounter++;
        config.onStepProgress({
          stepNumber: stepCounter,
          toolName: event.toolCall.toolName,
          input: event.toolCall.input as Record<string, unknown>,
          description: describeToolCall(
            event.toolCall.toolName,
            event.toolCall.input as Record<string, unknown>,
          ),
        });
      }
    },
  });
  // ...
}
```

### Pattern 3: Stderr Output Migration
**What:** Replace all `console.log` calls with `Bun.write(Bun.stderr, ...)` in reporter and CLI
**When to use:** Every piece of user-visible output
**Example:**
```typescript
// Helper for consistent stderr writing
function writeStderr(text: string): void {
  Bun.write(Bun.stderr, text + "\n");
}

// Before (reporter.ts):
console.log(`  ${bar}`);

// After:
writeStderr(`  ${bar}`);

// Before (cli.ts header):
console.log(header);

// After:
Bun.write(Bun.stderr, header + "\n");
```

### Pattern 4: Non-TTY Fallback for Spinner
**What:** In non-TTY environments, replace spinner animation with static text lines
**When to use:** When piping output or running in CI
**Notes:**
```
Nanospinner already handles this:
- Line 49 of nanospinner source: `isTTY ? spinner.write('\x1b[?25l') : (str += '\n')`
- Line 27 of consts.js: `isTTY = tty.isatty(1) && process.env.TERM !== 'dumb' && !('CI' in process.env)`
- Non-TTY: frames = ['-'], no cursor hide, adds newline per render

CRITICAL ISSUE: nanospinner checks `tty.isatty(1)` which is stdout FD 1,
even though it writes to stderr. This means in a `cmd | pipe` scenario where
stdout is piped but stderr is a TTY, nanospinner will incorrectly detect non-TTY.
This is acceptable behavior for CI (where both are piped) but worth noting.

For the --verbose non-TTY output, step lines just print without pc.dim()
since picocolors auto-suppresses. No special handling needed.

For non-TTY without --verbose, spinner degrades to static lines automatically.
The .update() calls will just change text between static renders, which is fine.
```

### Anti-Patterns to Avoid
- **Modifying StepRecorder for progress reporting:** StepRecorder is for caching. Progress reporting is a separate concern that should use the AI SDK callback chain, not the tool wrapper.
- **Using `onStepFinish` instead of `experimental_onToolCallFinish`:** A "step" in AI SDK is one LLM call, which can include multiple tool calls. We need per-tool-call granularity.
- **Writing to stdout for any output:** All output must go to stderr. Stdout is reserved for future `--output json`.
- **Using `console.error` for stderr:** Use `Bun.write(Bun.stderr, ...)` for consistency with existing error patterns.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TTY detection | Custom `process.stdout.isTTY` checks | `picocolors.isColorSupported` + nanospinner's built-in `isTTY` | Both already handle edge cases (dumb terminal, CI env, NO_COLOR) |
| ANSI suppression | Conditional wrapping of color functions | `picocolors` auto-detection | picocolors returns identity functions when color is unsupported |
| Spinner animation in non-TTY | Custom static line fallback | nanospinner's built-in non-TTY mode | It already outputs static `-` prefix with newline instead of animation |
| Tool call interception | Custom tool wrapper for progress | `experimental_onToolCallFinish` on `generateText()` | SDK-level callback, fires for every tool call with toolName and input |

**Key insight:** The existing libraries (nanospinner, picocolors, Vercel AI SDK) already handle the hard parts of TTY detection, ANSI suppression, and tool call observation. The engineering work is purely plumbing callbacks and output routing.

## Common Pitfalls

### Pitfall 1: onStepFinish vs experimental_onToolCallFinish confusion
**What goes wrong:** Using `onStepFinish` and expecting per-tool-call events, getting per-LLM-call events instead
**Why it happens:** AI SDK terminology: a "step" is one LLM call (which may invoke 0 or multiple tools). `onStepFinish` fires once per step.
**How to avoid:** Use `experimental_onToolCallFinish` which fires after each individual tool execution completes.
**Warning signs:** Step counter jumps (e.g., Step 1 then Step 4) because multiple tools executed in one step.

### Pitfall 2: console.log writes to stdout, not stderr
**What goes wrong:** Some output goes to stdout, breaking the "stdout reserved for JSON" guarantee
**Why it happens:** Easy to miss `console.log` calls in reporter and CLI header, especially in `onRunComplete`
**How to avoid:** grep for all `console.log` in src/ and systematically replace with `Bun.write(Bun.stderr, ...)`
**Warning signs:** `superghost --config x.yaml 2>/dev/null` shows output (should show nothing since all goes to stderr)

### Pitfall 3: Spinner .update() race condition with .success()/.error()
**What goes wrong:** A late tool call finish event arrives after the test completes, calling `.update()` after `.success()`
**Why it happens:** `experimental_onToolCallFinish` is async; there could be a timing edge case
**How to avoid:** Guard `.update()` calls with `.isSpinning()` check, or set a flag when test completes
**Warning signs:** Garbled terminal output, extra lines appearing after the success/error mark

### Pitfall 4: Truncation breaking multi-byte characters
**What goes wrong:** Truncating at byte offset 60 can split a multi-byte character (e.g., the arrow `\u2192`)
**Why it happens:** String slicing at arbitrary positions
**How to avoid:** Use character-level truncation (`str.slice(0, 60)` is fine for JS strings which are UTF-16), and add `...` suffix. Check that truncation point is not in the middle of a surrogate pair (unlikely with typical tool args but worth a guard).
**Warning signs:** Garbled characters at the end of truncated spinner text

### Pitfall 5: StepRecorder wrapTools vs experimental_onToolCallFinish ordering
**What goes wrong:** StepRecorder wraps tool execute functions. `experimental_onToolCallFinish` fires after the wrapped execute. Step recording and progress reporting may fire in unexpected order.
**Why it happens:** StepRecorder.wrapTools replaces `tool.execute` with a wrapper that calls original then records. The AI SDK's `experimental_onToolCallFinish` fires after the (wrapped) execute completes.
**How to avoid:** This is actually fine -- both fire after successful execution. The callback and the recording are independent. No conflict.

### Pitfall 6: Non-TTY verbose output should NOT use pc.dim()
**What goes wrong:** In non-TTY, `pc.dim()` returns the raw string without ANSI codes, which is correct. But if someone conditionally adds/removes dim, they might forget.
**How to avoid:** Always use `pc.dim()` unconditionally. Picocolors handles suppression automatically. The context doc says "plain text without dimming" but `pc.dim()` already produces plain text in non-TTY.

## Code Examples

### Verified: nanospinner defaults to stderr
```typescript
// Source: node_modules/nanospinner/dist/index.js line 16
// stream = opts.stream || process.stderr
// Nanospinner ALREADY writes to stderr by default.
// No configuration change needed for stderr routing of spinner output.
```

### Verified: nanospinner .update() API
```typescript
// Source: node_modules/nanospinner/dist/index.d.ts
// update(opts: Options | string): Spinner;
// Can pass a string directly: spinner.update("new text")
// Or options object: spinner.update({ text: "new text" })

spinner.update("Login flow \u2014 Clicking 'Sign In' button");
```

### Verified: nanospinner non-TTY behavior
```typescript
// Source: node_modules/nanospinner/dist/consts.js line 27
// isTTY = tty.isatty(1) && process.env.TERM !== 'dumb' && !('CI' in process.env)
//
// When isTTY is false:
// - frames = ['-'] (single frame, no animation)
// - render() appends '\n' instead of cursor manipulation
// - loop() does NOT set timeout (no animation loop)
// So spinner degrades gracefully to static line output.
```

### Verified: experimental_onToolCallFinish event shape
```typescript
// Source: node_modules/ai/dist/index.d.ts lines 1018-1049
// OnToolCallFinishEvent has:
//   - stepNumber: number | undefined (0-based step index)
//   - toolCall: { toolName: string, input: unknown, toolCallId: string }
//   - success: true (with output) | false (with error)
//   - durationMs: number

experimental_onToolCallFinish: (event) => {
  if (event.success) {
    const { toolName, input } = event.toolCall;
    // toolName: "browser_navigate"
    // input: { url: "http://localhost:3000/login" }
  }
}
```

### Verified: picocolors auto-detection
```typescript
// Source: node_modules/picocolors/picocolors.js lines 2-4
// isColorSupported =
//   !(!!env.NO_COLOR || argv.includes("--no-color")) &&
//   (!!env.FORCE_COLOR || argv.includes("--color") || p.platform === "win32"
//    || ((p.stdout || {}).isTTY && env.TERM !== "dumb") || !!env.CI)
//
// When NOT supported: all color functions return identity (passthrough)
// pc.dim("text") returns "text" without ANSI codes
```

### Commander --verbose flag registration
```typescript
// Following existing pattern from cli.ts lines 37-39:
.option("--verbose", "Show per-step tool call output during execution")
// In options type:
options: { config: string; headed?: boolean; only?: string; cache: boolean; dryRun?: boolean; verbose?: boolean }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `onStepFinish` only | `experimental_onToolCallFinish` + `experimental_onToolCallStart` | AI SDK v4+ | Per-tool-call granularity for progress reporting |
| Tool wrapper interception | SDK-native callbacks | AI SDK v4+ | No need to modify tool wrappers for observability |

**Note on `experimental_` prefix:** The `experimental_onToolCallFinish` callback is marked experimental in the AI SDK. This means it could change in minor versions. However, it is the only way to get per-tool-call events, and the project already pins `ai@^6.0.116`. If the API changes, it will be caught at compile time (TypeScript).

## Open Questions

1. **Which tool argument to use as "key arg" for each tool type**
   - What we know: MCP Playwright tools expose `url` for navigate, various selectors for click/type
   - What's unclear: Exact field names depend on the MCP server implementation (could be `element`, `ref`, `selector`, `text`)
   - Recommendation: Inspect actual tool call inputs from existing cache files or a test run. Start with `url` for navigate, `element` or `ref` for click/type, `text` for type. Fall back gracefully if field missing.

2. **Exact truncation strategy**
   - What we know: User wants ~60 character limit to prevent terminal wrapping
   - What's unclear: Hard cut at 60 vs word boundary
   - Recommendation: Hard cut at 60 characters with `...` suffix (simpler, predictable). Word boundary adds complexity for marginal benefit on spinner text that flashes by quickly.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built into Bun runtime) |
| Config file | None (Bun auto-discovers `tests/**/*.test.ts`) |
| Quick run command | `bun test tests/unit/output/` |
| Full suite command | `bun test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FLAG-02 | `--verbose` flag registered and parsed | unit | `bun test tests/unit/output/reporter.test.ts` | Needs update |
| FLAG-02 | Verbose step lines printed as dim text | unit | `bun test tests/unit/output/reporter.test.ts` | Needs update |
| OBS-01 | Tool name mapping (browser_navigate -> Navigate) | unit | `bun test tests/unit/output/tool-name-map.test.ts` | Wave 0 |
| OBS-01 | onStepProgress callback wired through executeAgent | unit | `bun test tests/unit/agent/agent-runner.test.ts` | Needs update |
| OBS-01 | Spinner text updates with tool descriptions | unit | `bun test tests/unit/output/reporter.test.ts` | Needs update |
| OBS-02 | All reporter output writes to stderr (not stdout) | unit | `bun test tests/unit/output/reporter.test.ts` | Needs update |
| OBS-02 | CLI header/annotations write to stderr | integration | `bun test tests/integration/cli-pipeline.test.ts` | Needs update |

### Sampling Rate
- **Per task commit:** `bun test tests/unit/output/ tests/unit/agent/agent-runner.test.ts`
- **Per wave merge:** `bun test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/output/tool-name-map.test.ts` -- covers OBS-01 tool name mapping
- Existing files (`reporter.test.ts`, `agent-runner.test.ts`, `cli-pipeline.test.ts`) need new test cases but the files already exist

## Sources

### Primary (HIGH confidence)
- `node_modules/ai/dist/index.d.ts` -- Vercel AI SDK v6 type definitions: `experimental_onToolCallFinish`, `OnToolCallFinishEvent`, `TypedToolCall`, `generateText` options
- `node_modules/nanospinner/dist/index.js` -- nanospinner source: `stream = opts.stream || process.stderr`, `.update()` method, non-TTY detection
- `node_modules/nanospinner/dist/consts.js` -- `isTTY` detection: `tty.isatty(1) && TERM !== 'dumb' && !CI`
- `node_modules/picocolors/picocolors.js` -- `isColorSupported` auto-detection, identity functions for non-TTY
- `src/agent/agent-runner.ts` -- Current `generateText()` call site (line 47-54)
- `src/output/reporter.ts` -- Current `ConsoleReporter` with spinner lifecycle
- `src/runner/test-executor.ts` -- Current execution chain (executeAgentFn call at line 102)
- `src/cli.ts` -- Current CLI options, header printing, reporter instantiation

### Secondary (MEDIUM confidence)
- None needed -- all critical information verified from installed package source code

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all packages already installed and verified from source
- Architecture: HIGH -- callback pattern well-understood, all integration points identified in source
- Pitfalls: HIGH -- identified from direct source code reading of nanospinner, AI SDK types, and existing codebase
- Tool name mapping: MEDIUM -- exact MCP tool argument field names need verification from actual tool calls

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable -- all dependencies pinned, AI SDK experimental API only risk)
