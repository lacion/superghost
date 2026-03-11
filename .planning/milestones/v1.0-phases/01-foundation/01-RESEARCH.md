# Phase 1: Foundation - Research

**Researched:** 2026-03-11
**Domain:** CLI scaffold, YAML config validation, terminal output, process lifecycle management
**Confidence:** HIGH

## Summary

Phase 1 is a greenfield CLI tool build using Bun as the runtime, Commander.js for CLI parsing, Zod v4 for config validation, and the `yaml` package for YAML parsing. SuperGhost's natural language E2E testing architecture uses a config schema, loader, reporter, and test runner pattern -- all built with SuperGhost-specific requirements (named tests, colored output, spinners, better error formatting).

The core technical challenges are: (1) rich YAML error reporting with line context using the `yaml` package's `YAMLParseError` properties, (2) showing ALL Zod validation errors at once with field paths, (3) polished terminal output with colors and spinners that auto-disable in non-TTY, and (4) MCP subprocess cleanup on SIGINT/SIGTERM to prevent orphaned processes.

**Primary recommendation:** Follow SuperGhost's architecture (schema/loader/runner/reporter separation) replacing plain `console.log` with picocolors for coloring and nanospinner for progress animation. Use Bun's built-in test runner (`bun test`) instead of vitest for testing.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Named test format: every test is an object with required `name` and `case` fields
- No shorthand string syntax -- object-only format for consistency
- camelCase field names throughout (baseUrl, maxAttempts, cacheDir, etc.)
- Colored output: green for PASS, red for FAIL, dim for timing/metadata
- Auto-disable colors when not a TTY (piped output, CI without color support)
- Spinner animation while a test is running (auto-disable in non-TTY)
- Header shows version and test count: `superghost v0.1.0 / Running 3 test(s)...`
- Box summary with bordered layout using line characters
- Failed tests listed below summary with error messages
- Show ALL Zod validation errors at once (numbered list with field path and message)
- Missing/unreadable config file: error message + actionable hint
- YAML syntax errors: show the problematic line from the file with caret pointer
- Colored errors matching CLI style (red for "Error:", dim for hints/paths)
- Default model: `claude-sonnet-4-6`
- Default modelProvider: `anthropic`
- Default browser: `chromium`
- Default headless: `true`
- Default timeout: `60000`
- Default maxAttempts: `3`
- Default cacheDir: `.superghost-cache`
- Default recursionLimit: `500`
- `modelProvider` is always explicit (no auto-inference from model name for default)

### Claude's Discretion
- Spinner library choice (ora, nanospinner, or custom)
- Color library choice (chalk, picocolors, or Bun built-in)
- Exact spacing and typography in output
- MCP process cleanup implementation details
- Project file/folder structure

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CONF-01 | User can define test cases in plain English via YAML | yaml package v2.8.x for parsing; Zod v4 `TestCaseSchema` with required `name` and `case` fields |
| CONF-02 | Config validated with Zod; clear error messages with line context | Zod v4 `safeParse` + `issues` array for all-at-once errors; yaml `YAMLParseError.linePos` for line context |
| CONF-03 | Global settings: baseUrl, browser, headless, timeout, maxAttempts, model, modelProvider, cacheDir, recursionLimit | Zod v4 schema with `.default()` for each setting; reference schema pattern proven |
| CONF-04 | Per-test override of baseUrl and timeout | Optional fields on TestCaseSchema; runner resolves `test.baseUrl ?? config.baseUrl` |
| CONF-05 | Sensible defaults | Zod `.default()` applies defaults during parse; locked values in CONTEXT.md |
| CLI-01 | Run tests with `superghost --config tests.yaml` | Commander.js v14 `.requiredOption("-c, --config <path>")` + `.parseAsync()` |
| CLI-02 | Clear error and exit code 1 on missing/malformed config | ConfigLoadError class; file existence check, YAML parse error, Zod validation error -- three error paths |
| CLI-03 | `[RUNNING]`, `[PASS]`, `[FAIL]` for each test with source and timing | ConsoleReporter pattern from reference; enhanced with picocolors and nanospinner |
| CLI-04 | Summary: total, passed, failed, cached count, wall time | RunResult aggregation from reference; box-styled output with line chars |
| CLI-05 | Exit code 0 all pass, 1 any fail | `process.exit(runResult.failed > 0 ? 1 : 0)` -- proven in reference |
| INFR-01 | MCP subprocess cleanup on SIGINT/SIGTERM | ProcessManager class tracking child PIDs; `process.on("SIGINT"/"SIGTERM")` handlers; `proc.kill()` for each tracked process |
| INFR-02 | Configurable recursionLimit to prevent runaway costs | Config field with Zod validation; passed to agent in Phase 2 but schema defined now |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| commander | ^14.0.3 | CLI argument parsing | Reference uses it; most popular Node.js CLI framework; works with Bun; TypeScript types included |
| zod | ^4.3.6 | Config schema validation | Reference uses v4; 14x faster than v3; `safeParse` + `issues` array provides all-at-once error reporting |
| yaml | ^2.8.2 | YAML parsing | Reference uses it; `YAMLParseError` provides `linePos` for line-level error context; `prettyErrors: true` by default |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| picocolors | ^1.1.1 | Terminal colors | All colored output (PASS/FAIL/errors/timing); 14x smaller than chalk; auto-detects TTY/NO_COLOR/FORCE_COLOR |
| nanospinner | ^1.2.2 | Terminal spinner | Test-in-progress animation; 15x smaller than ora; depends on picocolors (shared dep); `createSpinner` API |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| picocolors | chalk | chalk is 14x larger (101kB vs 7kB); picocolors is faster and lighter with same API surface needed |
| picocolors | Bun built-in ANSI | No built-in color library in Bun; would require hand-rolling ANSI codes |
| nanospinner | ora | ora is 15x larger; nanospinner has simpler API and already depends on picocolors |
| nanospinner | custom spinner | Spinner logic is deceptively complex (cursor management, TTY detection, cleanup on exit); not worth hand-rolling |
| commander | citty/yargs | Commander is proven in the reference; largest ecosystem; TypeScript built-in |

**Installation:**
```bash
bun add commander@^14.0.3 zod@^4.3.6 yaml@^2.8.2 picocolors@^1.1.1 nanospinner@^1.2.2
```

**Dev Dependencies:**
```bash
bun add -d @types/bun typescript
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  cli.ts              # CLI entry point (Commander setup, error handling, process exit)
  config/
    schema.ts         # Zod schemas (ConfigSchema, TestCaseSchema)
    loader.ts         # loadConfig(): file read -> YAML parse -> Zod validate
    types.ts          # Config, TestCase types (inferred from Zod)
  runner/
    test-runner.ts    # Sequential test execution orchestrator
    types.ts          # TestResult, RunResult, TestStatus, TestSource types
  output/
    reporter.ts       # ConsoleReporter: colors, spinners, summary box
    types.ts          # Reporter interface
  infra/
    process-manager.ts # MCP subprocess tracking and cleanup
    signals.ts        # SIGINT/SIGTERM handler registration
tests/
  unit/
    config/
      schema.test.ts  # Schema validation (valid configs, invalid configs, defaults)
      loader.test.ts  # File loading (missing file, bad YAML, validation failure)
    runner/
      test-runner.test.ts  # Sequential execution, result aggregation
    output/
      reporter.test.ts     # Output formatting verification
  integration/
    cli-pipeline.test.ts   # End-to-end CLI invocation
    config-loading.test.ts # Full config load + validate pipeline
package.json
tsconfig.json
```

### Pattern 1: Three-Layer Config Loading
**What:** Separate file I/O, YAML parsing, and Zod validation into distinct error domains
**When to use:** Always -- each layer has different error types and messages
**Example:**
```typescript
// Source: SuperGhost src/config/loader.ts
import { parse as parseYaml } from "yaml";
import { ConfigSchema } from "./schema.ts";
import type { Config } from "./types.ts";

export class ConfigLoadError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "ConfigLoadError";
    if (cause) this.cause = cause;
  }
}

export async function loadConfig(filePath: string): Promise<Config> {
  // Layer 1: File existence
  const file = Bun.file(filePath);
  if (!(await file.exists())) {
    throw new ConfigLoadError(
      `Config file not found: ${filePath}\n` +
      `  Create a config file or specify a different path:\n` +
      `    superghost --config <path>`
    );
  }

  // Layer 2: YAML parsing
  let raw: unknown;
  try {
    const content = await file.text();
    raw = parseYaml(content, { prettyErrors: true });
  } catch (error) {
    // YAMLParseError has linePos with { line, col }
    if (error instanceof Error && error.name === "YAMLParseError") {
      throw new ConfigLoadError(formatYamlError(error, filePath), error);
    }
    throw new ConfigLoadError(`Failed to parse YAML: ${String(error)}`, error);
  }

  // Layer 3: Zod validation
  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue, i) => `  ${i + 1}. ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new ConfigLoadError(
      `Invalid config (${result.error.issues.length} issue${result.error.issues.length > 1 ? "s" : ""})\n${issues}`
    );
  }
  return result.data;
}
```

### Pattern 2: Reporter Interface for Testability
**What:** Abstract output behind a Reporter interface; ConsoleReporter is the production impl
**When to use:** Always -- enables testing without console.log side effects
**Example:**
```typescript
// Source: SuperGhost src/output/types.ts
import type { TestStatus, TestSource, RunResult } from "../runner/types.ts";

export interface Reporter {
  onTestStart(testName: string): void;
  onTestComplete(testName: string, status: TestStatus, source: TestSource, durationMs: number): void;
  onRunComplete(data: RunResult): void;
}
```

### Pattern 3: ProcessManager for Subprocess Tracking
**What:** Singleton that tracks spawned MCP subprocesses and kills them on shutdown
**When to use:** Any time a subprocess is spawned (MCP servers in Phase 2, but scaffold now)
**Example:**
```typescript
// ProcessManager tracks all child processes for cleanup
export class ProcessManager {
  private processes = new Set<import("bun").Subprocess>();

  track(proc: import("bun").Subprocess): void {
    this.processes.add(proc);
    proc.exited.then(() => this.processes.delete(proc));
  }

  async killAll(): Promise<void> {
    const kills = [...this.processes].map(async (proc) => {
      if (!proc.killed) {
        proc.kill("SIGTERM");
        // Force kill after timeout
        const timeout = setTimeout(() => {
          if (!proc.killed) proc.kill("SIGKILL");
        }, 5000);
        await proc.exited;
        clearTimeout(timeout);
      }
    });
    await Promise.allSettled(kills);
    this.processes.clear();
  }
}

// Signal registration (in cli.ts or signals.ts)
const pm = new ProcessManager();

function setupSignalHandlers(pm: ProcessManager): void {
  const handler = async () => {
    await pm.killAll();
    process.exit(130); // 128 + SIGINT(2)
  };
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
}
```

### Pattern 4: Stub Test Executor for Phase 1
**What:** Since Phase 1 has no AI/cache, the test executor returns a stub result
**When to use:** Phase 1 only -- replaced with real executor in Phase 2
**Example:**
```typescript
// Phase 1 stub: all tests "pass" immediately to validate the pipeline
async function stubExecute(testCase: string, baseUrl: string): Promise<TestResult> {
  return {
    testCase,
    status: "passed",
    source: "ai", // stub
    durationMs: 0,
  };
}
```

### Anti-Patterns to Avoid
- **Mixing error domains:** Do NOT catch YAML errors and Zod errors in the same try/catch. Each has different formatting needs.
- **process.exit() in library code:** Only call `process.exit()` in `cli.ts` (the entry point). Library functions should throw.
- **Hardcoded colors in output strings:** Use picocolors functions, not raw ANSI codes. Picocolors auto-disables in non-TTY.
- **Global mutable state for process tracking:** Use a ProcessManager instance, not module-level variables. Makes testing possible.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Terminal colors | ANSI escape codes | picocolors | TTY detection, NO_COLOR support, FORCE_COLOR support; many edge cases |
| Spinner animation | setInterval + cursor manipulation | nanospinner | Cursor position management, cleanup on unexpected exit, non-TTY detection |
| YAML parsing | Custom parser | yaml v2 | YAML spec is enormous; line position tracking; error codes for different failure types |
| Schema validation | if/else chains | Zod v4 | Type inference, all-at-once error reporting, `.default()` for defaults, composable schemas |
| CLI argument parsing | process.argv manual parsing | Commander.js | Help generation, required options, version flag, error handling, TypeScript types |
| Process signal handling | Raw process.on only | ProcessManager class pattern | Need to track multiple subprocesses, handle both SIGINT and SIGTERM, timeout for force-kill |

**Key insight:** Every "simple" terminal feature (colors, spinners, YAML parsing) has a long tail of edge cases. Libraries handle them; hand-rolling does not.

## Common Pitfalls

### Pitfall 1: Zod v4 Error Object Is Not an Error Instance
**What goes wrong:** Code checks `result.error instanceof Error` and it fails silently
**Why it happens:** Zod v4 removed Error prototype from safeParse error objects for performance
**How to avoid:** Always check `result.success` boolean, never `instanceof Error`
**Warning signs:** Error handling code that silently passes through without reporting errors

### Pitfall 2: YAML Parse Errors Losing Line Context
**What goes wrong:** Catching YAML errors as generic `Error` loses the `linePos` property
**Why it happens:** `YAMLParseError` has `linePos` and `pos` properties not on base Error
**How to avoid:** Check `error.name === "YAMLParseError"` and access `(error as any).linePos` for `[{line, col}, {line, col}]`
**Warning signs:** Error messages say "parse failed" without showing which line

### Pitfall 3: Spinner Interference with Error Output
**What goes wrong:** Spinner animation corrupts error messages or test output
**Why it happens:** Spinner uses cursor manipulation; writing to stdout during spin clobbers output
**How to avoid:** Always call `spinner.stop()` / `spinner.error()` / `spinner.success()` before writing other output. Use nanospinner's built-in state transitions.
**Warning signs:** Garbled terminal output, partial lines, duplicate spinner frames in CI logs

### Pitfall 4: process.exit() Preventing Cleanup
**What goes wrong:** Calling `process.exit()` immediately skips async cleanup (killing child processes)
**Why it happens:** `process.exit()` is synchronous and doesn't wait for promises
**How to avoid:** Perform all async cleanup BEFORE calling `process.exit()`. In signal handlers, await `pm.killAll()` then exit.
**Warning signs:** Orphaned MCP server processes visible in `ps aux` after Ctrl-C

### Pitfall 5: Colors in Non-TTY Environments
**What goes wrong:** CI logs contain raw ANSI escape codes that look like garbage
**Why it happens:** Output is piped (not a TTY) but colors are still applied
**How to avoid:** picocolors auto-detects and disables. For nanospinner, it auto-disables animation in non-TTY. No manual check needed as long as you use these libraries.
**Warning signs:** Test output in CI shows `\x1b[32m` instead of colored text

### Pitfall 6: Commander.js parseAsync Required for Async Actions
**What goes wrong:** `.parse()` returns before async action completes; process exits early
**Why it happens:** Commander's `.parse()` fires-and-forgets async action handlers
**How to avoid:** Always use `.parseAsync()` when the action handler is async
**Warning signs:** CLI exits with code 0 before any tests run

### Pitfall 7: Bun.file() vs Node fs for File Existence
**What goes wrong:** Using `fs.access()` when Bun has a simpler API
**Why it happens:** Following Node.js patterns instead of Bun-native
**How to avoid:** Use `Bun.file(path).exists()` for existence checks and `Bun.file(path).text()` for reading. These are Bun-native and faster.
**Warning signs:** Importing `node:fs/promises` when Bun alternatives exist

## Code Examples

Verified patterns from official sources and reference implementation:

### Zod v4 Config Schema with Defaults
```typescript
// Source: Adapted from reference + Zod v4 docs (zod.dev/v4)
import { z } from "zod";

export const TestCaseSchema = z.object({
  name: z.string().min(1, "Test name cannot be empty"),
  case: z.string().min(1, "Test case description cannot be empty"),
  baseUrl: z.string().url().optional(),
  timeout: z.number().positive().optional(),
});

export const ConfigSchema = z.object({
  baseUrl: z.string().url().optional(),
  browser: z.enum(["chromium", "firefox", "webkit"]).default("chromium"),
  headless: z.boolean().default(true),
  timeout: z.number().positive().default(60_000),
  maxAttempts: z.number().int().positive().max(10).default(3),
  model: z.string().default("claude-sonnet-4-6"),
  modelProvider: z.string().default("anthropic"),
  cacheDir: z.string().default(".superghost-cache"),
  recursionLimit: z.number().int().positive().default(500),
  tests: z.array(TestCaseSchema).min(1, "At least one test case is required"),
});
```

### YAML Error with Line Context
```typescript
// Source: yaml package docs (eemeli.org/yaml/#errors)
// YAMLParseError has: name, code, message, pos: [number, number], linePos: [{line, col}, {line, col}]
function formatYamlError(error: Error & { linePos?: Array<{line: number; col: number}> }, filePath: string): string {
  const linePos = error.linePos;
  if (linePos && linePos[0]) {
    const { line, col } = linePos[0];
    return `Invalid YAML syntax\n  ${filePath}:${line}:${col}\n  ${error.message}`;
  }
  return `Invalid YAML syntax: ${error.message}`;
}
```

### Colored Reporter with Spinner
```typescript
// Source: picocolors (github.com/alexeyraspopov/picocolors), nanospinner (github.com/usmanyunusov/nanospinner)
import pc from "picocolors";
import { createSpinner } from "nanospinner";
import type { Reporter } from "./types.ts";
import type { TestStatus, TestSource, RunResult } from "../runner/types.ts";

export class ConsoleReporter implements Reporter {
  private spinner: ReturnType<typeof createSpinner> | null = null;

  onTestStart(testName: string): void {
    this.spinner = createSpinner(testName).start();
  }

  onTestComplete(testName: string, status: TestStatus, source: TestSource, durationMs: number): void {
    const duration = pc.dim(`(${source}, ${formatDuration(durationMs)})`);
    if (status === "passed") {
      this.spinner?.success({ text: `${testName} ${duration}` });
    } else {
      this.spinner?.error({ text: `${testName} ${duration}` });
    }
    this.spinner = null;
  }

  onRunComplete(data: RunResult): void {
    const bar = "\u2501".repeat(40); // box drawing heavy horizontal
    console.log("");
    console.log(`  ${bar}`);
    console.log(`    SuperGhost Results`);
    console.log(`  ${bar}`);
    console.log(`    Total:   ${data.results.length}`);
    console.log(`    Passed:  ${pc.green(String(data.passed))}`);
    console.log(`    Failed:  ${data.failed > 0 ? pc.red(String(data.failed)) : String(data.failed)}`);
    console.log(`    Cached:  ${data.cached}`);
    console.log(`    Time:    ${pc.dim(formatDuration(data.totalDurationMs))}`);
    console.log(`  ${bar}`);

    if (data.failed > 0) {
      console.log("");
      console.log(pc.red("  Failed tests:"));
      for (const result of data.results) {
        if (result.status === "failed") {
          console.log(`    ${pc.red("-")} ${result.testCase}`);
          if (result.error) {
            console.log(`      ${pc.dim(result.error)}`);
          }
        }
      }
    }
  }
}

function formatDuration(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}
```

### Commander CLI Entry Point
```typescript
// Source: commander.js docs (npmjs.com/package/commander), SuperGhost src/cli.ts
#!/usr/bin/env bun
import { Command } from "commander";
import pc from "picocolors";
import { loadConfig, ConfigLoadError } from "./config/loader.ts";
import { TestRunner } from "./runner/test-runner.ts";
import { ConsoleReporter } from "./output/reporter.ts";
import { ProcessManager } from "./infra/process-manager.ts";

const program = new Command();

program
  .name("superghost")
  .description("AI-powered end-to-end browser and API testing")
  .version("0.1.0")
  .requiredOption("-c, --config <path>", "Path to YAML config file")
  .action(async (options: { config: string }) => {
    const pm = new ProcessManager();
    setupSignalHandlers(pm);

    try {
      const config = await loadConfig(options.config);
      const reporter = new ConsoleReporter();

      console.log(`\n${pc.bold("superghost")} v0.1.0 / Running ${config.tests.length} test(s)...\n`);

      // Phase 1: stub executor (replaced in Phase 2)
      const runner = new TestRunner(config, reporter, stubExecute);
      const result = await runner.run();

      await pm.killAll();
      process.exit(result.failed > 0 ? 1 : 0);
    } catch (error) {
      if (error instanceof ConfigLoadError) {
        console.error(`${pc.red("Error:")} ${error.message}`);
        await pm.killAll();
        process.exit(1);
      }
      throw error;
    }
  });

await program.parseAsync();
```

### Signal Handlers with Process Cleanup
```typescript
// Source: Bun spawn docs (bun.sh/docs/api/spawn), Node.js process docs
function setupSignalHandlers(pm: ProcessManager): void {
  let shuttingDown = false;

  const handler = async (signal: string) => {
    if (shuttingDown) return; // Prevent double-cleanup
    shuttingDown = true;

    await pm.killAll();
    process.exit(signal === "SIGINT" ? 130 : 143); // 128 + signal number
  };

  process.on("SIGINT", () => handler("SIGINT"));
  process.on("SIGTERM", () => handler("SIGTERM"));
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Zod v3 (20kB, slow types) | Zod v4 (57% smaller, 14x faster parse, ~175 type instantiations) | June 2025 | Much faster CI builds and runtime validation |
| chalk for colors | picocolors (14x smaller, 2x faster) | 2023+ | Smaller bundle, faster startup; picocolors now the standard for new projects |
| ora for spinners | nanospinner (15x smaller) | 2023+ | Lighter dependency; simpler API sufficient for CLI tools |
| Node.js fs | Bun.file() API | Bun 1.0+ | Simpler API, native performance; `Bun.file(path).exists()` and `.text()` |
| vitest for testing | `bun test` built-in | Bun 1.0+ | Zero-config, Jest-compatible, dramatically faster execution |

**Deprecated/outdated:**
- Zod v3 `.format()` and `.flatten()`: Deprecated in v4. Use `z.prettifyError()` for formatted strings or iterate `issues` array directly.
- Zod v3 `.merge()`: Deprecated in v4. Use `.extend()` or spread instead.
- `node:fs/promises` in Bun projects: Prefer `Bun.file()` API for file operations.

## Open Questions

1. **Exact YAML line context format with source line display**
   - What we know: `YAMLParseError.linePos` gives `{line, col}` coordinates; the error `message` includes context
   - What's unclear: Whether `yaml` package automatically includes the source line snippet in the error message or if we need to read the file line manually for the caret-pointer display
   - Recommendation: Read the source file line manually when formatting YAML errors to guarantee the exact display format from CONTEXT.md (line number + source line + caret pointer)

2. **TestRunner name field usage in Phase 1**
   - What we know: CONTEXT.md requires `name` field; reference implementation uses `case` as display text
   - What's unclear: Whether `name` or `case` should be the primary display string in reporter output
   - Recommendation: Use `name` as the display label in `[RUNNING]`/`[PASS]`/`[FAIL]` output since it is the human-friendly identifier; `case` is the AI instruction for Phase 2

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in, Jest-compatible) |
| Config file | bunfig.toml (optional; no config needed for defaults) |
| Quick run command | `bun test` |
| Full suite command | `bun test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONF-01 | YAML test cases parsed with name+case | unit | `bun test tests/unit/config/schema.test.ts -x` | Wave 0 |
| CONF-02 | Zod validation errors with paths; YAML errors with line context | unit | `bun test tests/unit/config/loader.test.ts -x` | Wave 0 |
| CONF-03 | Global config fields validated | unit | `bun test tests/unit/config/schema.test.ts -x` | Wave 0 |
| CONF-04 | Per-test baseUrl/timeout override | unit | `bun test tests/unit/config/schema.test.ts -x` | Wave 0 |
| CONF-05 | Defaults applied when fields omitted | unit | `bun test tests/unit/config/schema.test.ts -x` | Wave 0 |
| CLI-01 | CLI invocation with --config flag | integration | `bun test tests/integration/cli-pipeline.test.ts -x` | Wave 0 |
| CLI-02 | Error + exit 1 on bad config | integration | `bun test tests/integration/cli-pipeline.test.ts -x` | Wave 0 |
| CLI-03 | RUNNING/PASS/FAIL output per test | unit | `bun test tests/unit/output/reporter.test.ts -x` | Wave 0 |
| CLI-04 | Summary with totals and timing | unit | `bun test tests/unit/output/reporter.test.ts -x` | Wave 0 |
| CLI-05 | Exit codes 0/1 | integration | `bun test tests/integration/cli-pipeline.test.ts -x` | Wave 0 |
| INFR-01 | Subprocess cleanup on signals | unit | `bun test tests/unit/infra/process-manager.test.ts -x` | Wave 0 |
| INFR-02 | recursionLimit in config schema | unit | `bun test tests/unit/config/schema.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test`
- **Per wave merge:** `bun test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/config/schema.test.ts` -- covers CONF-01, CONF-03, CONF-04, CONF-05, INFR-02
- [ ] `tests/unit/config/loader.test.ts` -- covers CONF-02 (file missing, bad YAML, validation errors)
- [ ] `tests/unit/output/reporter.test.ts` -- covers CLI-03, CLI-04
- [ ] `tests/unit/runner/test-runner.test.ts` -- covers sequential execution and result aggregation
- [ ] `tests/unit/infra/process-manager.test.ts` -- covers INFR-01
- [ ] `tests/integration/cli-pipeline.test.ts` -- covers CLI-01, CLI-02, CLI-05
- [ ] `package.json` -- project initialization with dependencies
- [ ] `tsconfig.json` -- TypeScript configuration

## Sources

### Primary (HIGH confidence)
- Bun spawn API docs (bun.sh/docs/api/spawn) -- subprocess management, kill, signals, onExit, unref
- Bun test runner docs (bun.sh/docs/test) -- test patterns, file discovery, CLI flags, lifecycle hooks
- yaml package error handling docs (eemeli.org/yaml/#errors) -- YAMLParseError properties, linePos, prettyErrors
- Zod v4 changelog (zod.dev/v4/changelog) -- safeParse changes, error object not instanceof Error, deprecated APIs
- Zod v4 release notes (zod.dev/v4) -- issues array structure, prettifyError, performance improvements

### Secondary (MEDIUM confidence)
- Commander.js v14 docs (npmjs.com/package/commander) -- parseAsync, requiredOption, TypeScript support
- picocolors GitHub (github.com/alexeyraspopov/picocolors) -- API surface, isColorSupported, createColors, NO_COLOR support
- nanospinner GitHub (github.com/usmanyunusov/nanospinner) -- createSpinner API, start/stop/success/error methods

### Tertiary (LOW confidence)
- None -- all findings verified with official sources

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries verified via official docs and reference implementation
- Architecture: HIGH -- directly adapted from working reference implementation with known patterns
- Pitfalls: HIGH -- verified against official docs (Zod v4 breaking changes, yaml error properties, Bun spawn behavior)

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (stable domain; all libraries at recent stable versions)
