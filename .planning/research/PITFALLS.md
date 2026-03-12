# Pitfalls Research

**Domain:** CI/CD + Team Readiness features for existing AI-powered CLI testing tool (SuperGhost v0.3)
**Researched:** 2026-03-12
**Confidence:** HIGH

---

## Critical Pitfalls

### Pitfall 1: JSON Output Leaks Human-Readable Text into stdout Breaking Machine Parsing

**What goes wrong:**
The existing `ConsoleReporter` writes everything to stderr via `writeStderr()`, and the `cli.ts` `printRunHeader()` function also writes to stderr. This is correct. However, when adding `--output json`, any code path that accidentally writes to `process.stdout` (or calls `console.log`) corrupts the JSON output. The most insidious case: third-party libraries (Commander.js help/version output, nanospinner on certain error paths) write to stdout by default. If a user runs `superghost --config tests.yaml --output json` and a Commander validation error fires, Commander writes its error message to stdout before the program can catch it. The JSON parser on the consuming end receives `error: missing required option\n{"results":[...]}` and fails.

**Why it happens:**
The current architecture correctly reserves stdout, but this is an implicit convention enforced only by `ConsoleReporter` and `writeStderr()`. There is no structural guarantee. Adding `--output json` makes the convention load-bearing: any violation that was previously invisible now breaks downstream consumers. Commander.js writes version output (`--version`) and help output (`--help`) to `process.stdout` by default. The existing `.exitOverride()` in `cli.ts` catches Commander errors but Commander may still write to stdout before the override fires.

**How to avoid:**
- Create a `JsonReporter` that implements the `Reporter` interface and buffers all results in memory, emitting a single JSON blob to stdout only in `onRunComplete()`.
- Never emit partial JSON during the run. The JSON must be one atomic write at the end.
- Override Commander's `configureOutput()` to redirect all Commander output to stderr: `program.configureOutput({ writeOut: (str) => writeStderr(str), writeErr: (str) => writeStderr(str) })`.
- Add an integration test that pipes `--output json` output through `JSON.parse()` and asserts validity. Run this test for both success and failure scenarios.
- Errors during the run (config load failure, API key missing) should ALSO produce valid JSON to stdout when `--output json` is active, with a top-level `error` field, then exit with the appropriate code.

**Warning signs:**
- `superghost --output json | jq .` produces parse errors
- CI tool reports "invalid JSON" when consuming superghost output
- JSON output contains ANSI escape codes or spinner characters
- Running `--output json --help` dumps help text to stdout before the JSON blob

**Phase to address:** JSON output format implementation. This must be the first output format added because JUnit XML reuses the same Reporter-based architecture.

---

### Pitfall 2: JUnit XML Missing Required `classname` Attribute Causes CI Tools to Silently Drop Results

**What goes wrong:**
JUnit XML has no official specification -- it originated from the JUnit ANT task and has evolved through conventions. The `classname` attribute on `<testcase>` elements is technically optional in some XSD schemas but is **required by most CI tools** (GitHub Actions, GitLab CI, Jenkins, CircleCI). Omitting `classname` causes some tools to silently skip the test case entirely (no error, just missing from the report). Others display the test case but fail to group it, putting everything under an unnamed root. The `testmoapp/junitxml` reference implementation documents this as a strongly recommended attribute.

**Why it happens:**
SuperGhost's `TestResult` type has `testName` and `testCase` but no concept of a "class" -- it is not a Java test framework. Developers generating JUnit XML from non-Java test runners often skip `classname` because it feels like a Java-ism that does not apply. But the attribute is what CI tools use for grouping and display hierarchy. Without it, results render poorly or disappear.

**How to avoid:**
- Set `classname` to the config file name (e.g., `tests.yaml`) or a configurable suite name. This groups all test cases under a meaningful label.
- Set `<testcase name="...">` to `testResult.testName`.
- Always include `time` as seconds (float), not milliseconds. JUnit XML uses seconds with decimal precision: `time="1.234"` not `time="1234"`.
- Include `<failure message="..." type="TestFailure">` for failed tests with the error message in the element body. Without the `message` attribute, some tools show an empty failure.
- Wrap test suites in `<testsuites>` (plural) as the root element -- some parsers choke on `<testsuite>` as root.
- Validate generated XML against the Testmo XSD schema during development.
- XML-escape all text content: test names, error messages, and case descriptions may contain `<`, `>`, `&`, `"` characters that break XML parsing.

**Warning signs:**
- GitHub Actions test summary shows 0 tests when there should be results
- Jenkins JUnit plugin shows "No test results found"
- CI report shows test names but no grouping/hierarchy
- XML parsing error in CI logs mentioning malformed XML or unescaped characters

**Phase to address:** JUnit XML output format implementation. Should be built after JSON output since both share the same data flow.

---

### Pitfall 3: Env Var Interpolation Exposes Secrets in Cache Files and Error Messages

**What goes wrong:**
Adding `${VAR}` interpolation in YAML configs lets users write `baseUrl: ${API_BASE_URL}` instead of hardcoding URLs. The resolved value flows into the config object, which flows into cache keys (`CacheManager.hashKey(testCase, baseUrl)`), cache file metadata, error messages, and potentially JSON/JUnit output. If `${API_SECRET}` or `${PRIVATE_TOKEN}` is interpolated into a test case description or context field, the resolved secret value ends up in:
1. `.superghost-cache/` JSON files (committed to git if not in `.gitignore`)
2. JUnit XML `<testcase>` attributes and failure messages
3. JSON output `testCase` and `error` fields
4. stderr error messages ("Error: baseUrl unreachable: https://secret-token@api.example.com")

**Why it happens:**
Env var interpolation is typically implemented as a string-replace pass over the raw YAML before or after parsing. The resolved values become indistinguishable from literal config values throughout the rest of the system. No component downstream of the config loader knows which values came from env vars vs. literals. Cache files store the full resolved `testCase` and `baseUrl` in plain JSON. The cache directory is often not in `.gitignore` because users want to commit it for deterministic CI replays.

**How to avoid:**
- Interpolate env vars AFTER YAML parsing but BEFORE Zod validation, so the values are validated but originate from env vars.
- For cache key computation: hash the INTERPOLATED values (so `${API_BASE_URL}` resolving to different values in different environments produces different cache keys). This is correct behavior.
- For cache file storage metadata: store the TEMPLATE form (`${API_BASE_URL}`) in the `testCase`/`baseUrl` metadata fields, not the resolved value. The hash uses the resolved value; the human-readable metadata uses the template.
- For error messages and output: redact any value that came from env var interpolation in stderr error messages. At minimum, truncate to show only the var name: `baseUrl unreachable: ${API_BASE_URL} (resolved)`.
- Add `.superghost-cache/` to the default `.gitignore` recommendation in docs and `--init` scaffolding.
- Never interpolate env vars in test `case` descriptions sent to the AI agent. The AI does not need the secret value -- it needs the instruction. If a user writes `case: "Login with password ${SECRET}"`, that is a misuse. Warn when an env var is found inside a `case` field.

**Warning signs:**
- Git diff shows API keys or tokens appearing in `.superghost-cache/` JSON files
- JUnit XML report in CI artifacts contains secret values in test names
- Error messages in CI logs expose interpolated secret URLs
- Cache files work locally but fail in CI because the env var resolves differently (this is correct behavior, but confusing if the user expects cache portability)

**Phase to address:** Env var interpolation implementation. Must be designed with the cache and output layers in mind from the start.

---

### Pitfall 4: GitHub Actions Required Check Name Mismatch Silently Blocks All PRs

**What goes wrong:**
When setting up PR gates with required status checks, the check name in branch protection must EXACTLY match the job name in the workflow YAML. If the workflow has `jobs: lint:` but branch protection requires `Lint` (capitalized), every PR will hang with "Expected -- Waiting for status to be reported" and can never merge. The reverse is equally dangerous: renaming a job in the workflow YAML (e.g., from `test` to `typecheck-and-test`) causes the required check to reference a name that no longer exists, blocking all PRs until a repo admin fixes branch protection.

**Why it happens:**
GitHub Actions status check names are composed from `workflow name / job name` (e.g., `CI / lint`). Branch protection matches on these composite names, which are case-sensitive strings. There is no validation that a required check name corresponds to an existing workflow job. Renaming a workflow file, a job key, or the workflow `name:` field silently breaks the association. GitHub does not warn about orphaned required checks.

**How to avoid:**
- Use explicit, stable job names with the `name:` field in each job (not just the job key). Example: `jobs: lint: name: "Lint"`. This decouples the display name from the YAML key.
- Document the exact required check names in a comment at the top of each workflow file: `# Required check: "CI / Lint"`.
- After setting up branch protection, immediately test by creating a PR to verify all checks appear and complete.
- Keep the number of required checks minimal. Use a single "CI" workflow with multiple jobs rather than multiple workflows. This keeps the required check list short and manageable.
- Do NOT use path filtering (`on: push: paths:`) on workflows that contain required checks. If the workflow does not trigger (because no matching paths changed), the required check stays in "Pending" forever, blocking the PR.
- Consider a "gate" job that depends on all other jobs (`needs: [lint, test, typecheck]`) and make only that single job required. If individual jobs are renamed, only the `needs` list changes, not branch protection.

**Warning signs:**
- PR stuck at "Some checks haven't completed yet" with a check showing "Expected"
- All PRs blocked after a workflow rename or refactor
- New contributors cannot merge even after all visible checks pass
- Branch protection shows required checks that do not match any workflow job

**Phase to address:** PR workflow gates setup. Must be the LAST CI/CD feature implemented, after all workflow jobs are finalized and their names are stable.

---

### Pitfall 5: Biome Linting Retroactively Applied to Existing Codebase Creates Hundreds of Violations

**What goes wrong:**
Adding Biome (or any linter/formatter) to an existing 3,787 LOC codebase and running `biome ci` immediately fails with hundreds of violations. If this is wired into a pre-commit hook or CI check, all work on the repo is blocked until every violation is fixed. This creates a massive "stop the world" commit that touches every file, making git blame useless for the entire history and creating merge conflicts with any in-flight branches.

**Why it happens:**
Biome's default ruleset is opinionated and comprehensive (423+ rules). A codebase written without a linter will inevitably violate many rules: inconsistent formatting, import ordering, unused variables, non-null assertions, etc. Running `biome check` on the full codebase for the first time surfaces all accumulated style drift at once. The temptation is to run `biome check --write` to auto-fix everything, but this produces a single giant commit that rewrites most files.

**How to avoid:**
- Phase the rollout: first add Biome with `biome init`, configure it, and run `biome format --write .` as a single formatting-only commit. Formatting changes are cosmetic and do not change behavior -- this is the safe "big bang" commit.
- After formatting, enable lint rules incrementally. Start with `recommended` rules and disable any that produce excessive violations using `overrides` or by setting specific rules to `"warn"` instead of `"error"`.
- Configure `biome ci` to check only CHANGED files in CI (not the whole codebase) during the transition period: use `biome ci --changed --since=main`.
- Do the formatting commit on main BEFORE any feature branches diverge, to avoid merge conflicts.
- Use `biome migrate` if coming from ESLint/Prettier -- but SuperGhost has no existing linter, so start fresh.
- Pin Biome version exactly (`-E` flag during install) to prevent rule changes across minor versions from breaking CI.

**Warning signs:**
- First `biome ci` run in CI fails with 200+ violations
- Feature branches cannot pass CI because the linting commit was added to main after they branched
- `git blame` on any file shows the formatting commit for every line
- Pre-commit hook takes 5+ seconds because it checks all files, not just staged ones

**Phase to address:** Linting/formatting enforcement. This should be the FIRST feature in the milestone -- before any other code changes -- so the formatting baseline is established and all subsequent changes comply.

---

### Pitfall 6: Env Var Interpolation Creates Ambiguity Between Literal `$` Characters and Variable References

**What goes wrong:**
YAML config values like `case: "Check that price shows $50"` contain a literal `$` that the interpolation engine might interpret as `${50}` or choke on `$5`. A naive regex like `/\$\{([^}]+)\}/g` correctly handles `${VAR}` syntax but `/\$(\w+)/g` (bare `$VAR` syntax without braces) would falsely match `$50`, `$path`, etc. Even with the `${...}` syntax, edge cases include `$${escaped}` (should this be literal `${escaped}`?), empty `${}` (what happens?), nested `${VAR_${ENV}}` (should this be supported?), and undefined vars `${NONEXISTENT}`.

**Why it happens:**
There is no universal standard for env var interpolation in YAML. Docker Compose uses `${VAR}` and `${VAR:-default}`. Helm uses Go templates `{{ .Values.x }}`. Spring Boot uses `${VAR:default}`. Users bring assumptions from their ecosystem. The implementation must decide: what syntax is supported, what happens on undefined vars, and how to escape literal `$`.

**How to avoid:**
- Support ONLY `${VAR}` syntax (with braces). Never support bare `$VAR` -- it creates too many ambiguities with literal dollar signs, shell escapes, and YAML quoting.
- On undefined env var: FAIL LOUDLY with exit code 2 and a clear error message: `"Environment variable 'API_KEY' is not set (referenced in config field 'baseUrl')"`. Do NOT silently substitute empty string -- this creates mysterious failures downstream ("baseUrl is empty").
- Provide an escape hatch: `$${VAR}` produces literal `${VAR}` (double dollar escapes). This matches Docker Compose convention.
- Do NOT support default value syntax (`${VAR:-default}`) in v0.3. It adds parsing complexity and can be added later. Keep the syntax simple.
- Do NOT support nested interpolation (`${VAR_${ENV}}`). It is rarely needed and creates a recursive parsing problem.
- Apply interpolation to string values only. If a YAML field is typed as `number` (e.g., `timeout`), do not attempt interpolation -- the Zod schema will catch the type mismatch after interpolation.
- Run interpolation BEFORE Zod validation so that missing/malformed env vars produce config validation errors, not runtime crashes.

**Warning signs:**
- Test case with `$50` in the description silently becomes `0` or empty string after interpolation
- Undefined env var produces a blank `baseUrl` that passes validation but causes test failure
- Users confused by `$$` escaping or surprised that `$VAR` without braces is not supported
- YAML with single-quoted strings (`'${VAR}'`) does not interpolate (YAML single quotes are literal)

**Phase to address:** Env var interpolation implementation. Syntax decisions must be locked before implementation begins.

---

### Pitfall 7: JSON and JUnit Output Formats Missing Error Metadata That CI Tools Expect

**What goes wrong:**
The current `TestResult` type contains `testName`, `testCase`, `status`, `source`, `durationMs`, `error?`, and `selfHealed?`. This is sufficient for the console reporter but insufficient for CI consumption. CI tools expect: test suite name, test suite timestamp, test case class/category, number of assertions, environment info, and structured failure details. JSON consumers expect a schema version field so they can detect format changes. JUnit consumers expect `<system-out>` and `<system-err>` capture per test case. Without these, the output "works" but provides degraded value in CI dashboards.

**Why it happens:**
The `TestResult` type was designed for the `ConsoleReporter`, which only needs name, status, and error. The new output formats need richer metadata that does not exist in the current data model. Retrofitting this metadata is straightforward but easy to forget -- the JSON/JUnit reporters can only emit what `TestResult` and `RunResult` provide.

**How to avoid:**
- Extend `RunResult` with: `suiteName` (config file name or explicit name), `timestamp` (ISO 8601 run start time), `superghost version`, `model` used, `provider` used.
- Extend `TestResult` with: `baseUrl` (the resolved base URL for this test), `testType` ("browser" | "api"), `stepCount?` (number of steps executed).
- Add a `schemaVersion` field to JSON output (start at `1`). Increment when the JSON structure changes. This lets consumers detect format changes.
- For JUnit XML: populate `<system-out>` with the step progression log for each test case (not the full AI conversation, just the step summaries). This gives CI dashboards drill-down capability.
- Design the extended `RunResult`/`TestResult` types BEFORE implementing either output format. Both formatters consume the same data.

**Warning signs:**
- JSON output has no version field -- consumers cannot detect schema changes
- JUnit XML test cases show no details beyond pass/fail
- CI dashboard shows test results but no timing, no environment, no grouping
- Adding a field to JSON output later breaks existing consumers (no schema version to key off)

**Phase to address:** Output format data model design. Must happen before JSON or JUnit implementation begins.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Generate JUnit XML with string concatenation instead of an XML builder | No new dependency | XML injection from test names containing `<`, `>`, `&`; breaks on non-ASCII characters | Never -- use proper XML escaping at minimum |
| Skip JSON schema version field | Simpler JSON output | Cannot evolve the JSON format without breaking consumers; no migration path | Never |
| Interpolate env vars with a single regex replace | Quick implementation | Breaks on `$$` escaping, nested `${}`, and literal `$` in non-string contexts | Acceptable for v0.3 if ONLY `${VAR}` syntax is supported and edge cases are tested |
| Run `biome check` on ALL files in CI instead of changed files | Simpler CI config | Slower CI; unrelated formatting issues block PRs for code they did not touch | Acceptable after the initial formatting commit |
| Use `--output json > results.json` as the only documented JSON usage | Simple docs | Users who want both human output AND JSON for CI must run twice | Add `--output-file` option to write structured output to a file while keeping stderr human output |
| Configure all required checks individually in branch protection | Direct mapping | Fragile -- any job rename breaks merging | Never -- use a single gate job that `needs:` all others |
| Store resolved env var values in cache metadata | Correct cache keying | Secrets leak into cache files on disk | Never -- store template form in metadata, resolved form only in hash |

---

## Integration Gotchas

Common mistakes when connecting v0.3 features to the existing system.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `--output json` + Commander.js | Commander writes `--help` and `--version` to stdout, corrupting JSON | Use `program.configureOutput()` to redirect Commander stdout to stderr |
| `--output json` + error paths | Config errors write to stderr but JSON consumer expects errors on stdout too | When `--output json` is active, errors must produce valid JSON on stdout with an `error` field, THEN exit |
| `--output junit` + test name escaping | Test names containing `<`, `>`, `&`, `"` break XML | XML-escape all dynamic content: names, error messages, case descriptions |
| Env var interpolation + Zod validation | Interpolation runs after Zod, so `${VAR}` is validated as a literal string and fails URL validation | Run interpolation BEFORE Zod `safeParse()` -- interpolate raw YAML object, then validate |
| Env var interpolation + cache keys | Cache key uses template `${VAR}` instead of resolved value | Interpolate first, then pass resolved values to `CacheManager`. Cache must key on actual values |
| Biome + existing CI workflows | Add `biome ci` to release workflow but not PR workflow | Add lint check to PR workflow first; release workflow inherits from passing PRs |
| Biome + `.ts` extension imports | Biome may flag `import { X } from "./foo.ts"` depending on config | Configure Biome to allow `.ts` extensions (Bun requires them; Node does not) |
| JUnit XML + `time` attribute | Pass milliseconds instead of seconds | JUnit XML `time` attribute is seconds as a float: `time="1.234"` not `time="1234"` |
| PR gate workflow + E2E tests | Make E2E tests (which need `ANTHROPIC_API_KEY`) a required check on PRs | E2E tests should NOT be required on PRs -- they need secrets, cost money, and are slow. Use a separate workflow triggered by `workflow_dispatch` or `schedule` only |
| Multiple output formats + `onRunComplete` | Reporter writes both human output and structured output in same `onRunComplete` | Create separate reporter instances: `ConsoleReporter` always writes to stderr; `JsonReporter`/`JUnitReporter` writes to stdout. Both receive the same events |
| Contributor docs + dev setup | CONTRIBUTING.md says "run `npm install`" when project uses Bun | All setup instructions must use `bun install`, `bun test`, `bunx` -- never npm/npx equivalents |

---

## Performance Traps

Patterns that work at small scale but cause problems as the test suite grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| JUnit XML building entire DOM in memory | High memory usage with large test suites | Stream XML elements sequentially; do not build a full document tree | Suites with 100+ tests producing verbose failure output |
| JSON output buffering all results before serializing | Memory spike at end of long run | Acceptable for v0.3 (test suites are small); plan for streaming JSON Lines if suites grow | Suites with 500+ tests |
| Env var interpolation scanning all string values recursively | Slow config loading with deeply nested configs | Only scan known string fields (baseUrl, case, context, name) | Configs with 50+ tests each with multiple string fields |
| Biome checking all files on every commit | Slow pre-commit hook | Configure pre-commit to check only staged files: `biome check --staged --changed` | Repos with 100+ source files |
| Single CI workflow running lint, test, typecheck sequentially | CI takes 3x longer than needed | Run lint, test, typecheck as parallel jobs in the same workflow | Any CI run -- parallel from the start |

---

## Security Mistakes

Domain-specific security issues for this milestone.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Env var interpolation resolving secrets into cache files | API keys, tokens stored in plain JSON on disk, possibly committed to git | Store template form in metadata; only use resolved values in hash computation and runtime execution |
| JUnit XML or JSON output containing resolved env var secrets | CI artifacts expose secrets in test reports | Redact or template-ify any value that originated from env var interpolation in output |
| YAML env var interpolation supporting `${PATH}` or `${HOME}` | Users accidentally interpolate system vars, leaking system info into cache/output | Consider a prefix requirement (e.g., only `${SUPERGHOST_*}` or `${SG_*}` vars) or at minimum document that ALL env vars are eligible |
| GitHub Actions workflow with `pull_request_target` trigger | External PRs from forks run with write permissions and access to secrets | Use `pull_request` trigger (not `pull_request_target`) for PR checks; only use `pull_request_target` if explicitly needed for comment APIs |
| SECURITY.md without actual security contact | Users report vulnerabilities publicly in GitHub issues | Include a real email or use GitHub's private vulnerability reporting feature |

---

## UX Pitfalls

Common user experience mistakes when adding these features.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| `--output json` replaces all output (no human feedback during run) | User sees nothing for 60+ seconds during AI execution, then gets a JSON dump | Keep stderr human output (spinner, progress) always active; JSON goes to stdout only at the end |
| JUnit XML has no test case details beyond pass/fail | CI dashboard is useless for debugging failures | Include failure message in `<failure message="...">` and step log in `<system-out>` |
| Env var error says "config validation failed" without mentioning which var was undefined | User has no idea which env var to set | Error message must name the var: `"Environment variable 'API_BASE_URL' is not set (referenced in 'baseUrl')"` |
| CONTRIBUTING.md assumes deep TypeScript/Bun knowledge | New contributors bounce off setup instructions | Include exact commands, expected output, and troubleshooting for common "bun not found" issues |
| `--output json` and `--output junit` are mutually exclusive with no way to get both | CI needs JUnit for test reporting AND JSON for custom dashboards | Support `--output-file results.xml` to write structured output to file while still emitting the other format to stdout |
| Biome formatting changes all files on first run, confusing contributors | "I only changed one file but the diff shows 50 files" | Do the formatting commit BEFORE any contributor-facing docs; mention in CONTRIBUTING.md that formatting is enforced |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **JSON output:** Often missing -- verify that config errors ALSO produce valid JSON (not just stderr text) when `--output json` is active. Test: `superghost --config nonexistent.yaml --output json | jq .`
- [ ] **JSON schema version:** Often missing -- verify JSON output includes a `version` or `schemaVersion` field at the top level. Without it, format changes are breaking changes.
- [ ] **JUnit XML classname:** Often missing -- verify every `<testcase>` has a `classname` attribute. Test: upload to GitHub Actions and verify tests appear in the test summary.
- [ ] **JUnit XML time format:** Often wrong -- verify `time` attributes are in seconds (float), not milliseconds. `time="1.234"` not `time="1234"`.
- [ ] **JUnit XML escaping:** Often missing -- verify test names with `<`, `>`, `&`, `"`, `'` characters produce valid XML. Test: create a test named `Check <script> & "quotes"` and verify XML parses.
- [ ] **Env var undefined handling:** Often wrong -- verify undefined `${VAR}` produces exit code 2 with a clear error, not empty string substitution.
- [ ] **Env var in cache metadata:** Often missing -- verify cache JSON files store `${VAR}` template form, not the resolved secret value.
- [ ] **Env var literal dollar sign:** Often missing -- verify `case: "Price is $50"` works without attempting interpolation (no braces = no interpolation).
- [ ] **Biome + `.ts` imports:** Often missing -- verify Biome does not flag Bun-style `.ts` extension imports as errors.
- [ ] **PR gate workflow + secrets:** Often wrong -- verify PR workflow does NOT require `ANTHROPIC_API_KEY` or other secrets. Fork PRs have no access to secrets and would fail silently.
- [ ] **CONTRIBUTING.md + Bun commands:** Often wrong -- verify all commands use `bun`/`bunx`, not `npm`/`npx`. Test: follow the doc from scratch on a clean checkout.
- [ ] **Commander stdout redirect:** Often missing -- verify `--help` and `--version` output goes to stderr when `--output json` is active (or at least does not corrupt JSON on stdout).
- [ ] **Multiple reporters wired correctly:** Often missing -- verify that `ConsoleReporter` (stderr) and `JsonReporter` (stdout) both receive `onTestStart`, `onTestComplete`, and `onRunComplete` events. A common bug is wiring only one.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| JSON output contains non-JSON text on stdout | LOW | Identify the source (Commander, console.log, third-party lib), redirect to stderr, release patch |
| JUnit XML missing `classname`, CI tools drop results | LOW | Add `classname` attribute, re-generate reports. No data loss -- just regenerate from next run |
| Secrets in cache files committed to git | HIGH | Rotate exposed secrets immediately. Run `git filter-branch` or `bfg-repo-cleaner` to remove from history. Add cache dir to `.gitignore`. Add secret scanning |
| GitHub Actions required check name mismatch blocking all PRs | MEDIUM | Repo admin updates branch protection rules to match current workflow job names. Document exact names in workflow comments |
| Biome formatting commit conflicts with in-flight branches | MEDIUM | Each branch must rebase on main after the formatting commit. Conflicts are cosmetic (whitespace) and auto-resolvable with `git checkout --theirs` for formatting files |
| Env var undefined produces empty string (silent failure) | MEDIUM | Add validation to fail on undefined vars. Re-run affected CI pipelines that may have passed with empty values |
| JUnit XML time in milliseconds instead of seconds | LOW | Fix the division, re-run. CI dashboards will show corrected timing on next run |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Biome formatting explosion on existing code | Phase 1: Linting setup (do FIRST, before any feature code) | Run `biome ci` in CI; verify 0 violations on main after formatting commit |
| JSON output stdout corruption | Phase 2: JSON output format | Integration test: pipe `--output json` through `JSON.parse()`; test error paths too |
| JUnit XML missing classname | Phase 3: JUnit output format | Upload XML to GitHub Actions; verify test summary displays all tests |
| JUnit XML time format (ms vs seconds) | Phase 3: JUnit output format | Unit test: assert `time` attribute value matches `durationMs / 1000` |
| JUnit XML escaping | Phase 3: JUnit output format | Unit test: test name with `<>&"'` characters produces valid XML |
| Env var interpolation syntax ambiguity | Phase 4: Env var interpolation | Unit test: `$50` is literal, `${VAR}` interpolates, `$${VAR}` escapes, `${}` errors |
| Env var secrets in cache/output | Phase 4: Env var interpolation | Inspect cache JSON after run with env vars; verify no resolved secrets in metadata |
| Env var undefined silent failure | Phase 4: Env var interpolation | Integration test: unset var in config, assert exit code 2 with named var in error message |
| Output format data model gaps | Phase 2: Before JSON/JUnit implementation | Code review: verify `RunResult`/`TestResult` have all fields needed by both formatters |
| GitHub Actions check name mismatch | Phase 5: PR workflow gates (do LAST) | Create test PR after setup; verify all checks appear and complete |
| PR workflow requiring secrets | Phase 5: PR workflow gates | Create PR from a fork; verify CI checks pass without secrets |
| CONTRIBUTING.md with wrong commands | Phase 5: Contributor docs | Follow CONTRIBUTING.md on a fresh clone; verify every command works |
| Commander stdout in JSON mode | Phase 2: JSON output format | Test: `superghost --output json --help 2>/dev/null \| jq .` should not produce valid JSON (help goes to stderr) |

---

## Sources

- JUnit XML format specification and conventions (Testmo): https://github.com/testmoapp/junitxml
- JUnit XML `classname` required by ESLint reporter (GitHub issue): https://github.com/eslint/eslint/issues/11068
- Tips on Adding JSON Output to Your CLI App (Kelly Brazil): https://blog.kellybrazil.com/2021/12/03/tips-on-adding-json-output-to-your-cli-app/
- npm CLI bug: --json outputs errors to stdout instead of stderr: https://github.com/npm/cli/issues/2150
- GitHub Actions required checks for conditional jobs: https://devopsdirective.com/posts/2025/08/github-actions-required-checks-for-conditional-jobs/
- GitHub Docs: Troubleshooting required status checks: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks
- GitHub community: Status checks "required if run" discussion: https://github.com/orgs/community/discussions/26092
- GitHub community: Stuck in "Expected -- Waiting for status to be reported": https://github.com/orgs/community/discussions/26698
- Biome migration guide for 2026: https://dev.to/pockit_tools/biome-the-eslint-and-prettier-killer-complete-migration-guide-for-2026-27m
- Biome Git Hooks recipe: https://biomejs.dev/recipes/git-hooks/
- Biome Roadmap 2026: https://biomejs.dev/blog/roadmap-2026/
- YAML security risks (Kusari): https://www.kusari.dev/learning-center/yaml-security
- Vector env var interpolation (newline rejection): https://vector.dev/docs/reference/environment_variables/
- SuperGhost codebase analysis: `src/cli.ts`, `src/output/reporter.ts`, `src/output/types.ts`, `src/runner/types.ts`, `src/config/loader.ts`, `src/config/schema.ts`

---
*Pitfalls research for: SuperGhost v0.3 CI/CD + Team Readiness*
*Researched: 2026-03-12*
