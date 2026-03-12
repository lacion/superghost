# Phase 14: JUnit XML Output - Research

**Researched:** 2026-03-13
**Domain:** JUnit XML output formatting, XML generation, CI test reporting
**Confidence:** HIGH

## Summary

Phase 14 adds `--output junit` to produce JUnit XML on stdout, mirroring the existing `--output json` pattern from Phase 9. The codebase already has a clean 3-function formatter pattern (`json-formatter.ts`) and all CLI integration points are well-documented in CONTEXT.md. The JUnit XML format is a stable, well-understood specification with no ambiguity in the subset needed.

The implementation is straightforward: create `junit-formatter.ts` with three functions (`formatJunitOutput`, `formatJunitDryRun`, `formatJunitError`), add two small utilities (`escapeXml`, `stripAnsi`), and wire "junit" into the existing CLI format branches. No external libraries are needed -- template literal XML generation is the right approach for this fixed, simple structure.

**Primary recommendation:** Hand-build XML with template literals (no library), following the exact 3-function pattern of `json-formatter.ts`. Use a single `escapeXml()` function for the 5 XML-special characters and a regex-based `stripAnsi()`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Derive `classname` from YAML config filename stem: `tests/checkout.yaml` -> classname="checkout"
- Strip path and extension, keep just the stem: `./e2e/login-flow.yaml` -> "login-flow"
- Fallback to "superghost" when config path isn't available (error before config loads)
- Single `<testsuite>` wrapping all testcases (no `<testsuites>` wrapper)
- Testsuite `name` attribute = config filename stem (same as classname)
- Include standard JUnit attributes: `tests`, `failures`, `errors`, `skipped`, `time`, `timestamp`
- `timestamp` in ISO 8601 format (run start time)
- `time` in seconds (not milliseconds) per JUnit convention
- Always include both `source` and `selfHealed` properties on every testcase (not conditional like JSON)
- `<property name="source" value="cache|ai" />`
- `<property name="selfHealed" value="true|false" />`
- Test failures (exitCode 1): `<failure message="..." type="TestFailure">`
- Runtime errors (exitCode 2): `<error message="..." type="RuntimeError">`
- Self-healed tests that passed: no failure/error element, rely on properties metadata only
- Strip ANSI escape codes from all error/failure messages
- Escape XML-special characters (`<`, `>`, `&`, `"`, `'`) in all text content
- `--output junit --dry-run` emits testsuite with all tests as `<skipped/>` testcases
- Each skipped testcase includes `<properties>` with source metadata
- testsuite attributes: tests=N, skipped=N, failures=0, time=0.00
- Runtime errors emit a single testcase with `<error>` element
- classname="superghost", name="SuperGhost Error" for error testcases
- `--only <pattern>` matching zero tests: empty testsuite with tests="0" (no error testcase)
- Pretty-printed with 2-space indentation
- XML declaration: `<?xml version="1.0" encoding="UTF-8"?>`

### Claude's Discretion
- XML string builder implementation (template literals vs DOM builder vs library)
- `escapeXml` and `stripAnsi` utility implementation details
- How to extract config filename stem (path parsing approach)
- Where to integrate junit format check in cli.ts alongside existing json check

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| OUT-02 | User can run `--output junit` to get JUnit XML on stdout with `classname` attribute and `time` in seconds | JUnit XML spec verified; classname derivation logic defined; time conversion from ms to seconds is `(durationMs / 1000).toFixed(3)` |
| OUT-05 | JUnit XML includes `<properties>` per testcase with SuperGhost-specific metadata (source: cache/ai, selfHealed) | JUnit XML spec confirms `<properties>` is valid child of `<testcase>`; property elements use `name` + `value` attributes |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Template literals | N/A (built-in) | XML string generation | Fixed schema, no dynamic element names; avoids dependency for trivial structure |
| `node:path` | N/A (built-in) | Config filename stem extraction | `path.basename(file, path.extname(file))` is the canonical approach |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None | - | - | No additional dependencies needed |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Template literals | `xmlbuilder2` / `fast-xml-parser` | Overkill for fixed schema; adds dependency; template literals are more readable for this use case |
| Template literals | DOM API (`DOMParser`) | Not available in Bun server runtime without jsdom; unnecessary complexity |
| Custom `stripAnsi` | `strip-ansi` npm package | ESM-only package adds a dependency for a single regex; hand-roll is 1 line |

**Installation:**
```bash
# No new packages needed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── output/
│   ├── json-formatter.ts      # Existing JSON formatter (pattern to mirror)
│   ├── junit-formatter.ts     # NEW: JUnit XML formatter (3 functions)
│   ├── xml-utils.ts           # NEW: escapeXml() + stripAnsi() utilities
│   ├── reporter.ts            # Existing (unchanged)
│   ├── tool-name-map.ts       # Existing (unchanged)
│   └── types.ts               # Existing (unchanged)
tests/
├── unit/
│   └── output/
│       ├── json-formatter.test.ts  # Existing (pattern to mirror)
│       ├── junit-formatter.test.ts # NEW: JUnit formatter tests
│       └── xml-utils.test.ts       # NEW: escapeXml/stripAnsi tests
```

### Pattern 1: Three-Function Formatter (mirror json-formatter.ts)
**What:** Each output format is a module exporting exactly 3 functions: format output, format dry-run, format error.
**When to use:** Every structured output format.
**Example:**
```typescript
// Source: existing json-formatter.ts pattern
export function formatJunitOutput(
  runResult: RunResult,
  metadata: JsonOutputMetadata,
  version: string,
  exitCode: number,
): string { /* ... */ }

export function formatJunitDryRun(
  tests: Array<{ name: string; case: string; source: "cache" | "ai" }>,
  metadata: JsonOutputMetadata,
  version: string,
): string { /* ... */ }

export function formatJunitError(
  errorMessage: string,
  version: string,
  metadata: Partial<JsonOutputMetadata>,
): string { /* ... */ }
```

### Pattern 2: Classname Derivation from Config Path
**What:** Extract the filename stem from the config file path for use as `classname` and testsuite `name`.
**When to use:** Every JUnit output call.
**Example:**
```typescript
import { basename, extname } from "node:path";

function deriveClassname(configFile: string): string {
  if (!configFile) return "superghost";
  const base = basename(configFile);
  const ext = extname(base);
  return ext ? base.slice(0, -ext.length) : base;
}
// "tests/checkout.yaml" -> "checkout"
// "./e2e/login-flow.yaml" -> "login-flow"
// "" -> "superghost"
```

### Pattern 3: CLI Integration (parallel format branches)
**What:** In `cli.ts`, add `"junit"` to format validation and add junit branches alongside every existing json branch.
**When to use:** CLI output dispatch.
**Example:**
```typescript
// Format validation (cli.ts:87)
if (options.output && options.output !== "json" && options.output !== "junit") {
  writeStderr(`${pc.red("Error:")} Unknown output format '${options.output}'. Supported: json, junit`);
  // ...
}

// Output branch (cli.ts:251 area)
if (options.output === "junit") {
  const xml = formatJunitOutput(result, metadata, pkg.version, code);
  process.stdout.write(`${xml}\n`);
}
```

### Anti-Patterns to Avoid
- **Building XML with string concatenation without escaping:** Always pass text content through `escapeXml()` and `stripAnsi()` before embedding in XML.
- **Using milliseconds for `time` attribute:** JUnit spec requires seconds. Convert with `(ms / 1000).toFixed(3)`.
- **Wrapping in `<testsuites>`:** User decision says single `<testsuite>`, no wrapper. Many tools accept both but the decision is locked.
- **Conditional properties:** Unlike JSON output where `selfHealed` is conditional, JUnit properties ALWAYS include both `source` and `selfHealed` on every testcase.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Full XML DOM | Custom XML tree builder | Template literals for fixed schema | The schema is static -- 3 element types, known depth. A builder adds abstraction without value. |
| XML entity encoding | Character-by-character encoder | Simple `replace()` chain for 5 chars | Only 5 XML-special characters exist: `& < > " '` |

**Key insight:** JUnit XML output is a write-only, fixed-schema problem. The output never needs to be parsed back, the structure never varies dynamically, and the element set is tiny. Template literals are the expert choice here.

## Common Pitfalls

### Pitfall 1: Ampersand Double-Escaping
**What goes wrong:** `&amp;` in source text gets escaped to `&amp;amp;` if escapeXml runs on already-escaped content.
**Why it happens:** Applying escapeXml twice, or applying it to text that was already XML-escaped.
**How to avoid:** Escape exactly once, at the point of interpolation into XML. Never pre-escape.
**Warning signs:** `&amp;amp;` or `&amp;lt;` appearing in output.

### Pitfall 2: ANSI Codes in Error Messages
**What goes wrong:** Error messages from picocolors-wrapped output contain ANSI escape sequences like `\x1b[31m` that break XML parsers or produce unreadable output.
**Why it happens:** Error objects sometimes capture formatted terminal output.
**How to avoid:** Always run `stripAnsi()` before `escapeXml()` on any user-facing text (error messages, test names, test cases).
**Warning signs:** XML containing `[31m` or similar sequences.

### Pitfall 3: Time Unit Mismatch
**What goes wrong:** JUnit XML `time` attribute shows milliseconds instead of seconds, causing CI dashboards to report absurd durations.
**Why it happens:** The codebase stores duration as `durationMs` (milliseconds). JUnit requires seconds.
**How to avoid:** Always divide by 1000: `(durationMs / 1000).toFixed(3)`.
**Warning signs:** Test times showing as "5200" instead of "5.200".

### Pitfall 4: Missing XML Declaration
**What goes wrong:** Some strict XML parsers reject the output without `<?xml version="1.0" encoding="UTF-8"?>`.
**Why it happens:** Forgetting to prepend the declaration.
**How to avoid:** Always start output with the XML declaration line.
**Warning signs:** Parser errors in Jenkins or GitLab CI.

### Pitfall 5: Newline in Failure Message Attribute
**What goes wrong:** Multi-line error messages in the `message` attribute break some XML parsers.
**Why it happens:** The `message` attribute gets a raw multi-line string.
**How to avoid:** Replace newlines with spaces in the `message` attribute value; keep the full multi-line text as element text content only.
**Warning signs:** Malformed XML when errors contain stack traces.

## Code Examples

### escapeXml utility
```typescript
// Handles the 5 XML-special characters per XML 1.0 spec
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
```

### stripAnsi utility
```typescript
// Strips all ANSI escape sequences (colors, cursor movement, etc.)
// Regex from the well-known ansi-regex pattern
export function stripAnsi(text: string): string {
  return text.replace(
    // biome-ignore lint: complex regex is intentional
    /[\u001B\u009B][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,
    "",
  );
}
```

### Complete testcase XML generation
```typescript
function formatTestcase(
  testName: string,
  testCase: string,
  classname: string,
  durationMs: number,
  source: string,
  selfHealed: boolean,
  status: string,
  error?: string,
): string {
  const time = (durationMs / 1000).toFixed(3);
  const name = escapeXml(stripAnsi(testName));
  const cn = escapeXml(classname);

  let xml = `  <testcase name="${name}" classname="${cn}" time="${time}">\n`;
  xml += `    <properties>\n`;
  xml += `      <property name="source" value="${source}" />\n`;
  xml += `      <property name="selfHealed" value="${String(selfHealed)}" />\n`;
  xml += `    </properties>\n`;

  if (status === "failed" && error) {
    const msg = escapeXml(stripAnsi(error).replace(/\n/g, " "));
    const detail = escapeXml(stripAnsi(error));
    xml += `    <failure message="${msg}" type="TestFailure">${detail}</failure>\n`;
  }

  xml += `  </testcase>\n`;
  return xml;
}
```

### Testsuite wrapper
```typescript
function wrapTestsuite(
  name: string,
  tests: number,
  failures: number,
  errors: number,
  skipped: number,
  time: string,
  timestamp: string,
  testcaseXml: string,
): string {
  const suiteName = escapeXml(name);
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<testsuite name="${suiteName}" tests="${tests}" failures="${failures}" errors="${errors}" skipped="${skipped}" time="${time}" timestamp="${timestamp}">`,
    testcaseXml,
    `</testsuite>`,
  ].join("\n");
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `<testsuites>` wrapper required | Single `<testsuite>` accepted by all major CI | Always | GitHub Actions, Jenkins, GitLab all accept bare `<testsuite>` |
| JUnit 4 schema (no properties on testcase) | JUnit 5 / de facto standard supports `<properties>` on `<testcase>` | ~2017 | Custom metadata via properties is widely supported |

**Deprecated/outdated:**
- None relevant. JUnit XML format has been stable for 15+ years.

## Open Questions

1. **ANSI regex completeness**
   - What we know: The standard `ansi-regex` pattern covers SGR (colors), cursor movement, and most terminal sequences.
   - What's unclear: Whether Bun's test output or picocolors could produce edge-case sequences not covered.
   - Recommendation: Use the well-known pattern; add test cases for picocolors-specific sequences. If any slip through, they'll be caught by XML escaping as a safety net.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built into Bun runtime) |
| Config file | None (bun:test uses defaults) |
| Quick run command | `bun test tests/unit/output/junit-formatter.test.ts tests/unit/output/xml-utils.test.ts` |
| Full suite command | `bun test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OUT-02 | `--output junit` produces valid JUnit XML with classname and time in seconds | unit | `bun test tests/unit/output/junit-formatter.test.ts -x` | No - Wave 0 |
| OUT-02 | classname derived from config filename stem | unit | `bun test tests/unit/output/junit-formatter.test.ts -x` | No - Wave 0 |
| OUT-02 | time attribute in seconds not milliseconds | unit | `bun test tests/unit/output/junit-formatter.test.ts -x` | No - Wave 0 |
| OUT-05 | Each testcase has properties block with source and selfHealed | unit | `bun test tests/unit/output/junit-formatter.test.ts -x` | No - Wave 0 |
| OUT-02 | XML-special characters properly escaped | unit | `bun test tests/unit/output/xml-utils.test.ts -x` | No - Wave 0 |
| OUT-02 | ANSI escape sequences stripped from messages | unit | `bun test tests/unit/output/xml-utils.test.ts -x` | No - Wave 0 |
| OUT-02 | dry-run produces skipped testcases | unit | `bun test tests/unit/output/junit-formatter.test.ts -x` | No - Wave 0 |
| OUT-02 | error paths produce valid JUnit XML | unit | `bun test tests/unit/output/junit-formatter.test.ts -x` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `bun test tests/unit/output/junit-formatter.test.ts tests/unit/output/xml-utils.test.ts`
- **Per wave merge:** `bun test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/output/junit-formatter.test.ts` -- covers OUT-02, OUT-05 (mirror json-formatter.test.ts structure)
- [ ] `tests/unit/output/xml-utils.test.ts` -- covers escapeXml and stripAnsi utilities

## Sources

### Primary (HIGH confidence)
- [testmoapp/junitxml](https://github.com/testmoapp/junitxml) - Comprehensive JUnit XML format specification with element hierarchy, attributes, and examples
- [JUnit XSD Schema](https://github.com/windyroad/JUnit-Schema/blob/master/JUnit.xsd) - Formal XML schema definition
- Existing codebase: `src/output/json-formatter.ts`, `src/cli.ts`, `src/runner/types.ts` - Direct pattern to mirror

### Secondary (MEDIUM confidence)
- [JUnit XML format reference](https://llg.cubic.org/docs/junit/) - Jenkins-focused JUnit XML documentation confirming attribute names and types

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - No external libraries needed; template literals for fixed XML schema is well-established
- Architecture: HIGH - Exact pattern exists in codebase (`json-formatter.ts`); all integration points documented in CONTEXT.md
- Pitfalls: HIGH - XML escaping and ANSI stripping are well-understood problems; JUnit time unit convention is documented

**Research date:** 2026-03-13
**Valid until:** Indefinite - JUnit XML format is a stable specification with no breaking changes expected
