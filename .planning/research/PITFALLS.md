# Pitfalls Research

**Domain:** CI/CD + Team Readiness features for existing AI-powered CLI testing tool (SuperGhost v0.4)
**Researched:** 2026-03-12
**Confidence:** HIGH

---

## Critical Pitfalls

### Pitfall 1: JUnit XML Missing Required `classname` Attribute Causes CI Tools to Silently Drop Results

**What goes wrong:**
JUnit XML has no official specification — it originated from the JUnit ANT task and has evolved through conventions. The `classname` attribute on `<testcase>` elements is technically optional in some XSD schemas but is required by most CI tools (GitHub Actions, GitLab CI, Jenkins, CircleCI). Omitting `classname` causes some tools to silently skip the test case entirely (no error, just missing from the report). Others display the test case but fail to group it, placing everything under an unnamed root. The `testmoapp/junitxml` reference implementation documents this as a strongly recommended attribute.

**Why it happens:**
SuperGhost's `TestResult` type has `testName` and `testCase` but no concept of a "class" — it is not a Java test framework. Developers generating JUnit XML from non-Java test runners often skip `classname` because it feels like a Java-ism that does not apply. But the attribute is what CI tools use for grouping and display hierarchy.

**How to avoid:**
- Set `classname` to the config file name (e.g., `tests.yaml`) or a configurable suite name. This groups all test cases under a meaningful label.
- Set `<testcase name="...">` to `testResult.testName`.
- Always include `time` as seconds (float), not milliseconds. JUnit XML uses seconds with decimal precision: `time="1.234"` not `time="1234"`.
- Include `<failure message="..." type="TestFailure">` for failed tests with the error message in the element body. Without the `message` attribute, some tools show an empty failure.
- Wrap test suites in `<testsuites>` (plural) as the root element — some parsers reject `<testsuite>` as root.
- Validate generated XML against the Testmo XSD schema during development.
- XML-escape all text content: test names, error messages, and case descriptions may contain `<`, `>`, `&`, `"` characters that break XML parsing.

**Warning signs:**
- GitHub Actions test summary shows 0 tests when there should be results
- Jenkins JUnit plugin shows "No test results found"
- CI report shows test names but no grouping or hierarchy
- XML parsing error in CI logs mentioning malformed XML or unescaped characters

**Phase to address:** Phase 10 (JUnit XML output). Must validate against at least one real CI tool (GitHub Actions dorny/test-reporter) during testing.

---

### Pitfall 2: ANSI Escape Codes and Control Characters in JUnit CDATA Produce Unparseable XML

**What goes wrong:**
SuperGhost's `ConsoleReporter` uses `picocolors` for colored output. When AI execution produces error messages or step logs that include ANSI escape sequences (color codes beginning with `\x1B[`), and those strings flow into JUnit XML `<failure>` bodies or `<system-out>` CDATA sections, the resulting XML is unparseable. The escape character `\x1B` (U+001B) is not a legal XML 1.0 character. XML 1.0 only permits characters `\x09` (tab), `\x0A` (newline), `\x0D` (carriage return), and `\x20`-`\xD7FF`. Any other control character breaks the entire document, not just the element containing it.

This is a documented, recurring bug across JUnit implementations in pytest, behave, mocha, bats, and OpenShift's test framework. The failure mode is silent at generation time (the file is written successfully) but fatal at parse time in CI.

**Why it happens:**
The `error` field on `TestResult` captures the raw error message from the AI agent or tool execution. These messages can include ANSI sequences if the underlying tool emits them. The `testCase` string in configs may also contain terminal formatting if users copy-paste from colored terminal output. JUnit XML generators that don't strip control characters before serialization produce invalid output every time one of these strings hits a failure.

**How to avoid:**
- Create a dedicated `stripControlChars(str: string): string` utility function that removes all characters with code points below `\x20` EXCEPT tab (`\x09`), newline (`\x0A`), and carriage return (`\x0D`).
- Apply `stripControlChars` to EVERY dynamic string value written into XML: test names, classnames, error messages, failure bodies, `<system-out>` content.
- Strip ANSI escape sequences separately using a regex like `/\x1B\[[0-9;]*[a-zA-Z]/g` BEFORE the control character strip.
- Add a unit test: pass a string containing `\x1B[31mfailed\x1B[0m` through the JUnit formatter and verify the output parses as valid XML.

**Warning signs:**
- XML parser in CI reports `illegal character code U+001B`
- JUnit report works in some test runs (no failures) but breaks on the first failure
- CI log shows "not well-formed XML" only when tests fail
- `xmllint --noout results.xml` exits non-zero

**Phase to address:** Phase 10 (JUnit XML output). This must be caught in unit tests before the formatter is used in real CI runs.

---

### Pitfall 3: JUnit XML `time` Attribute in Milliseconds Instead of Seconds

**What goes wrong:**
SuperGhost's `TestResult.durationMs` stores duration in milliseconds. JUnit XML's `time` attribute is specified in seconds as a decimal float. Writing milliseconds directly produces values like `time="4521"` (4.521 seconds rendered as 4521 seconds = 75 minutes). CI tools do not error on this — they display the inflated value. GitLab CI has a documented issue with this exact mistake. The test run appears to have taken hours.

**Why it happens:**
`durationMs` is named for its unit. The division by 1000 is a one-line conversion but is easy to forget when focusing on XML structure. Because CI tools don't reject the value, the bug goes undetected until someone looks at timing data.

**How to avoid:**
- In the JUnit formatter, convert with `(durationMs / 1000).toFixed(3)` to produce `"4.521"`.
- Add a unit test asserting that a 1500ms duration produces `time="1.500"` not `time="1500"`.

**Warning signs:**
- GitHub Actions test summary shows tests taking hours
- GitLab pipeline shows test duration wildly inconsistent with wall clock time
- Jenkins marks test suite as having impossibly long duration

**Phase to address:** Phase 10 (JUnit XML output). Simple unit test catches this before it reaches CI.

---

### Pitfall 4: Env Var Interpolation Exposes Secrets in Cache Files and Output

**What goes wrong:**
Adding `${VAR}` interpolation in YAML configs lets users write `baseUrl: ${API_BASE_URL}`. The resolved value flows into the config object, which flows into cache keys (`CacheManager.hashKey(testCase, baseUrl)`), cache file metadata, error messages, and JUnit/JSON output. If `${API_SECRET}` or `${PRIVATE_TOKEN}` is interpolated into a test case description or context field, the resolved secret value ends up in:

1. `.superghost-cache/` JSON files (plain text on disk, potentially committed to git if the cache dir is not in `.gitignore`)
2. JUnit XML `<testcase>` attributes and failure messages
3. JSON output `testCase` and `error` fields
4. stderr error messages: `"Error: baseUrl unreachable: https://secret-token@api.example.com"`

This is the known concern flagged in the milestone: secret leakage in cache metadata when env vars resolve API keys.

**Why it happens:**
Env var interpolation is typically implemented as a replace pass over parsed config values. The resolved values become indistinguishable from literal config values throughout the rest of the system. No downstream component knows which values came from env vars vs. literals. The cache file stores the full resolved `testCase` and `baseUrl` in human-readable JSON. The cache directory is often committed because users want deterministic CI replays.

**How to avoid:**
- Interpolate env vars AFTER YAML parsing but BEFORE Zod validation, so the values are validated correctly.
- For cache file storage metadata: store the TEMPLATE form (`${API_BASE_URL}`) in `testCase`/`baseUrl` metadata fields, not the resolved value. The hash uses the resolved value (so different environments produce different cache keys, which is correct behavior); the human-readable metadata uses the template.
- For error messages: redact any value that came from env var interpolation. At minimum, show only the var name: `"baseUrl unreachable: ${API_BASE_URL} (resolved)"`.
- Add `.superghost-cache/` to the default `.gitignore` recommendation in docs.
- Warn when an env var is found inside a `case` field (the AI does not need the secret value — it needs the instruction text).

**Warning signs:**
- Git diff shows API keys or tokens in `.superghost-cache/` JSON files
- JUnit XML in CI artifacts contains secret values in test names or failure bodies
- Error messages in CI logs expose full interpolated secret URLs
- Cache files work locally but fail in CI because env var resolves differently (correct behavior but confusing)

**Phase to address:** Phase 11 (env var interpolation). Must be designed with the cache and output layers in mind from the start — cannot be retrofitted.

---

### Pitfall 5: Env Var Interpolation with Default/Error Syntax Creates Ambiguous Parsing Edge Cases

**What goes wrong:**
The v0.4 roadmap specifies three interpolation syntaxes: `${VAR}`, `${VAR:-default}`, and `${VAR:?error message}`. These introduce parsing ambiguity when the default value or error message itself contains special characters: `${DB_URL:-postgres://user:pass@host/db}` contains `:`, `@`, and `/` which a naive regex would misparse. `${MSG:?Please set MSG — it is required}` contains `—` and spaces. A regex like `/\$\{([^}]+)\}/g` splits on the first `}`, which fails for nested braces. A split-on-`:-` regex fails when the default value contains `:-`.

Additionally: `${VAR}` syntax must NOT interpolate inside single-quoted YAML strings. YAML single-quote strings are literal — no escape processing. If a user writes `case: 'Check $50 off sale'`, that must never attempt interpolation.

**Why it happens:**
Implementing `${VAR}` alone is simple. The default-value (`:-`) and error-message (`:?`) syntaxes require a proper parser, not a single regex. The YAML quoting interaction is easy to miss because Bun's YAML parser has already stripped the quotes by the time interpolation runs on the parsed JS object — both single-quoted and double-quoted strings look the same after parsing.

**How to avoid:**
- Implement interpolation as a proper token parser rather than a single regex:
  1. Find the outermost `${` ... `}` boundary by tracking brace depth.
  2. Split the interior on the first `:-` or `:?` (only the first occurrence).
  3. The part before the separator is the var name; the part after is the default/message.
- Apply interpolation to string values in the parsed JS object (post-YAML-parse), not to the raw YAML string. This sidesteps the YAML quoting issue.
- Limit interpolation to specific fields: `baseUrl`, `context`, `name`, `case`. Do not interpolate `timeout` (number) or `headless` (boolean).
- On undefined `${VAR}` without a default: FAIL LOUDLY with exit code 2: `"Environment variable 'API_KEY' is not set (referenced in config field 'baseUrl')"`. Never silently substitute empty string.
- On `${VAR:?message}` with unset var: exit code 2, show the message verbatim.
- On `$${VAR}` (double dollar): produce literal `${VAR}`. Matches Docker Compose convention.
- Do NOT support bare `$VAR` without braces — too many ambiguities with literal dollar signs.
- Do NOT support nested interpolation `${VAR_${ENV}}`.

**Warning signs:**
- Test case with `$50` description silently becomes `0` or empty after interpolation
- `baseUrl: ${DB_URL:-postgres://...}` produces a truncated URL at the first `:`
- Undefined env var produces blank `baseUrl` that passes Zod URL validation but causes test failure with a misleading error
- `${VAR:?This is required — set it}` truncates the message at `—`

**Phase to address:** Phase 11 (env var interpolation). Syntax specification must be locked before implementation begins. Unit tests must cover each syntax variant and every edge case.

---

### Pitfall 6: GitHub Actions PR Workflow Uses `pull_request_target` and Exposes Secrets to Fork PRs

**What goes wrong:**
Using the `pull_request_target` event trigger (instead of `pull_request`) for PR checks causes workflow runs to execute with access to repository secrets, even for PRs from external forks. An attacker submitting a malicious PR can exfiltrate the `ANTHROPIC_API_KEY` or any other stored secret by modifying the workflow to echo it or send it to an external server. GitHub's security lab calls this a "pwn request."

The SuperGhost release workflow already uses `pull_request_target` is not present, but someone adding the PR CI workflow could accidentally choose `pull_request_target` for the wrong reason (e.g., wanting to post PR comments with test results), which grants secret access.

**Why it happens:**
`pull_request_target` exists to allow workflows to post comments or update PR statuses for fork PRs (which `pull_request` cannot do, as forks have no secret access). The distinction is subtle and the GitHub documentation does not make the security implication obvious at a glance. As of November 2025, GitHub changed `pull_request_target` behavior to always use the default branch for workflow source, but secret exposure remains if checkout and code execution occur.

**How to avoid:**
- Use `pull_request` (not `pull_request_target`) for the PR CI workflow. This provides no secret access — correct behavior for lint, typecheck, and unit tests which need no secrets.
- E2E tests requiring `ANTHROPIC_API_KEY` must NOT be required checks on PRs. Use a separate `e2e.yml` triggered by `workflow_dispatch` or `schedule` only. The existing `e2e.yml` in the repo already follows this pattern — do not break it.
- In the new `ci.yml` workflow, do not include any step that uses `secrets.*` context. The lint/typecheck/test jobs should need no secrets at all.
- Add a comment in the workflow file documenting why `pull_request` is used: `# Uses pull_request (not pull_request_target) — no secret access needed or granted`.

**Warning signs:**
- CI workflow uses `pull_request_target` without explicit justification
- PR workflow step references `secrets.ANTHROPIC_API_KEY` or any other secret
- Fork PR CI runs succeed only because secrets are available (should fail without them)
- Security scanner flags workflow with `pull_request_target` + `actions/checkout` combination

**Phase to address:** Phase 12 (GitHub Actions PR workflow). The workflow must be reviewed for secret exposure before merging.

---

### Pitfall 7: GitHub Actions Required Check Name Mismatch Silently Blocks All PRs

**What goes wrong:**
When setting up PR gates with required status checks, the check name in branch protection must EXACTLY match the job display name in the workflow YAML. If the workflow has `jobs: lint:` but branch protection requires `CI / Lint` (which is what GitHub displays), every PR hangs with "Expected — Waiting for status to be reported" and can never merge. The reverse is equally dangerous: renaming a job in the workflow YAML (e.g., from `test` to `typecheck-and-test`) causes the required check to reference a name that no longer exists, blocking all PRs until a repo admin updates branch protection.

**Why it happens:**
GitHub Actions status check names are composed from `workflow name / job name` (e.g., `CI / lint`). Branch protection matches on these composite strings, which are case-sensitive. There is no validation that a required check name corresponds to an existing workflow job. Renaming a workflow file, a job key, the workflow `name:` field, or the job `name:` field silently breaks the association.

**How to avoid:**
- Use a single `gate` job that `needs: [lint, typecheck, test]` and depends on all check jobs. Make ONLY the `gate` job a required check. When individual jobs are renamed, only the `needs:` list changes — branch protection is unchanged.
- Document the exact required check name in a comment at the top of the workflow file: `# Required check name: "CI / gate"`.
- After setting up branch protection, immediately test by creating a throwaway PR to verify the gate check appears and completes.
- Do NOT use path filtering (`on: push: paths:`) on workflows containing required checks. If the workflow does not trigger (no matching paths changed), the required check stays "Pending" forever, blocking the PR.

**Warning signs:**
- PR stuck at "Some checks haven't completed yet" with a check showing "Expected"
- All PRs blocked after a workflow rename or refactor
- New contributors cannot merge even after all visible checks pass
- Branch protection settings list check names that no longer match any workflow

**Phase to address:** Phase 12 (GitHub Actions PR workflow). Workflow job names must be finalized and stable before branch protection is configured.

---

### Pitfall 8: Contributor Docs Written Before the Tooling Is Final Describe Non-Existent Commands

**What goes wrong:**
CONTRIBUTING.md is written in Phase 13 (last), but if written before phases 10-12 are fully stable, the commands documented can be wrong in subtle ways: the lint command might change names, a test flag might be added, or the CI workflow structure might differ from what's documented. Worse, if CONTRIBUTING.md is written speculatively before all phases complete, contributors following it encounter silent failures ("my tests passed locally but CI failed") because the documented process mismatches the actual required process.

**Why it happens:**
Contributor docs are typically written as a "wrap-up" step and the author is writing from memory or partial notes rather than following the instructions verbatim on a clean checkout. The docs describe the intended state, not the verified state. Commands like `bun run lint:fix` sound right but `lint:fix` might be named `format` in `package.json`. The CONTRIBUTING.md is the only document not testable by the CI pipeline that enforces it.

**How to avoid:**
- Write CONTRIBUTING.md LAST (Phase 13 is correctly positioned). Do not write it speculatively.
- Verify every command in CONTRIBUTING.md by executing it verbatim on a clean `git clone` into a fresh directory. Do not trust memory.
- All setup/test/lint commands must use `bun`/`bunx`, never `npm`/`npx`. The project is Bun-native.
- Run `bun install`, then every command documented in setup, then every command in "running tests", then every command in "linting" — in sequence, on a machine without prior state.
- Add a "verified on" date and Bun version to CONTRIBUTING.md so staleness is detectable.

**Warning signs:**
- CONTRIBUTING.md references `npm install` instead of `bun install`
- A command in the docs exits non-zero on a clean clone
- The setup section omits `bunx playwright install chromium` (required for browser tests)
- The PR checklist refers to a CI check name that doesn't match the actual workflow

**Phase to address:** Phase 13 (contributor docs). Must be written AFTER phases 10-12 are complete, and verified on a fresh checkout.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Generate JUnit XML with string concatenation instead of a proper XML serializer | No new dependency | XML injection from test names containing `<`, `>`, `&`; control chars produce unparseable XML | Never — use proper XML escaping at minimum, or `fast-xml-parser` / a lightweight builder |
| Skip JSON schema version field (already in `version` field in v0.3) | N/A — already mitigated | N/A | N/A — `version` field exists in current JSON output |
| Interpolate env vars with a single regex replace | Quick implementation | Breaks on `${VAR:-default}` containing `:`, nested braces, and `$${escape}` | Never for the full v0.4 syntax — implement a proper token parser |
| Use `pull_request_target` to enable PR comments | Enables richer PR feedback | Secrets exposed to fork PRs | Never for CI lint/test workflows |
| Store resolved env var values in cache metadata | Correct cache keying | Secrets leak into cache files on disk | Never — store template form in metadata, resolved form in hash only |
| Configure required checks per-job instead of using a gate job | Simpler initial setup | Fragile — any job rename breaks merging silently | Never — always use a single gate job |
| Write CONTRIBUTING.md before tooling is finalized | Checks a box early | Documents wrong commands; contributors have a bad first experience | Never — write last, verify on clean clone |

---

## Integration Gotchas

Common mistakes when connecting v0.4 features to the existing system.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `--output junit` + test name escaping | Test names containing `<`, `>`, `&`, `"` break XML | XML-escape all dynamic content: names, error messages, case descriptions |
| `--output junit` + ANSI error messages | `error` field contains `\x1B[31m` color codes — illegal XML chars | Strip ANSI sequences AND all non-XML control characters before writing into XML |
| `--output junit` + `time` attribute | Pass `durationMs` directly: `time="4521"` | Divide by 1000: `time="4.521"` — JUnit XML `time` is seconds as decimal |
| `--output junit` + `classname` attribute | Omit `classname`, CI tools drop or misgroup results | Set `classname` to config file name (e.g., `tests.yaml`) |
| Env var interpolation + Zod validation | Interpolation runs after Zod, so `${VAR}` is validated as a literal string and fails URL validation | Run interpolation BEFORE `ConfigSchema.safeParse()` — interpolate the raw parsed object, then validate |
| Env var interpolation + cache keys | Cache key hashes the template `${VAR}` instead of the resolved value | Pass resolved values to `CacheManager.hashKey()`. Cache must key on actual runtime values. |
| Env var interpolation + cache metadata | Resolved secret stored in `testCase`/`baseUrl` fields of cache JSON | Store the pre-interpolation template in metadata fields; only use resolved values in the hash |
| Env var `${VAR:-default}` + YAML types | Default value `"123"` for a `timeout` (number) field passes as a string | After interpolation, Zod catches the type error. Document that env var defaults are strings and Zod coerces numbers. |
| GitHub Actions PR workflow + E2E tests | Include `e2e:smoke` as a required PR check | E2E tests require `ANTHROPIC_API_KEY` and cost money. Keep them in `e2e.yml` (scheduled/manual only) — never required on PR |
| GitHub Actions PR workflow + `bun install` | Use `bun install` without `--frozen-lockfile` | Use `bun install --frozen-lockfile` so CI fails loudly if `bun.lock` drifts from `package.json` |
| `--output junit` + Commander.js | Commander `--help` or `--version` writes to stdout, corrupting JUnit XML | `configureOutput()` already redirects Commander stdout to stderr in v0.3 — verify this also covers `--output junit` |
| Multiple output formats + `onRunComplete` | `JUnitReporter` writes to stdout while `ConsoleReporter` also writes to stdout | `ConsoleReporter` writes only to stderr. `JUnitReporter` writes only to stdout at `onRunComplete`. They can both be active simultaneously. |

---

## Performance Traps

Patterns that work at small scale but cause problems as the test suite grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Building JUnit XML DOM entirely in memory before writing | High memory usage with large test suites producing verbose failure output | Serialize elements sequentially; do not build a full document tree in memory | Suites with 100+ tests each producing multi-line failure output |
| Env var interpolation recursively scanning all object values | Slow config loading with large test arrays | Scan only known string fields: `baseUrl`, `context`, `name`, `case` | Configs with 100+ tests each with multiple fields |
| Single CI workflow running lint, typecheck, test sequentially | CI takes 3x longer than needed | Run lint, typecheck, test as parallel jobs from the start | Any CI run — sequential is always wasteful |
| Installing all Playwright browsers in PR CI (`playwright install`) | Adds 2+ minutes to every PR | Install only `chromium` (`bunx playwright install chromium`) | Every PR — install all browsers only in release/e2e workflows |

---

## Security Mistakes

Domain-specific security issues for v0.4.

| Mistake | Risk | Prevention |
|---------|------|------------|
| Env var interpolation resolving secrets into cache metadata JSON | API keys, tokens stored in plain text on disk, possibly committed to git | Store template form `${VAR}` in metadata; use resolved values only in hash computation and runtime execution |
| JUnit XML or JSON output containing resolved env var secrets | CI artifacts expose secrets in downloadable test reports | Avoid interpolating secrets into `name`, `case`, or `context` fields. Warn when env var appears in `case` field |
| `${PATH}` or `${HOME}` accidentally interpolated | System paths leak into cache files and output | Document clearly that ALL env vars are eligible for interpolation — users must use specific var names |
| GitHub Actions workflow using `pull_request_target` | External fork PRs run with secret access, enabling secret exfiltration | Use `pull_request` for CI checks; never `pull_request_target` |
| GitHub Actions `bun install` cache key includes resolved env var values | Cache entries poisoned or leaked secrets exposed in cache metadata | Never include secret values in cache keys; use only `bun.lock` hash as cache key |
| SECURITY.md with no real contact method | Vulnerabilities reported publicly in GitHub issues, disclosing them before a fix exists | Use GitHub's private vulnerability reporting (Settings > Security > Advisories) or provide a monitored security email |

---

## UX Pitfalls

Common user experience mistakes when adding these features.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| `--output junit` replaces all output with no feedback during run | User sees nothing for 60+ seconds during AI execution, then gets an XML dump | Keep stderr human output (spinner, progress) always active; JUnit XML goes to stdout only at the end of the run |
| JUnit XML has no details beyond pass/fail | CI dashboard useless for debugging failures | Include failure message in `<failure message="...">` and step log in `<system-out>` |
| Env var error says "config validation failed" without naming the undefined var | User has no idea which env var to set | Error message must name the var: `"Environment variable 'API_BASE_URL' is not set (referenced in config field 'baseUrl')"` |
| CONTRIBUTING.md assumes deep TypeScript/Bun knowledge | New contributors bounce off setup instructions | Include exact commands, expected output, and troubleshooting for common "bun not found" and "playwright not found" issues |
| `--output json` and `--output junit` are mutually exclusive with no way to get both | CI needs JUnit for test reporting AND JSON for custom dashboards | Consider `--output-file results.xml` to write structured output to a file while stdout serves the other format. Defer to v0.5 if not in scope |
| Undefined env var in config fails after preflight check instead of at startup | User waits for `baseUrl` reachability check before seeing the "VAR not set" error | Interpolate and validate env vars BEFORE the preflight check — fail fast at config load time |

---

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **JUnit XML classname:** Often missing — verify every `<testcase>` has a `classname` attribute. Test: upload to GitHub Actions dorny/test-reporter and verify tests appear in the test summary.
- [ ] **JUnit XML time format:** Often wrong — verify `time` attributes are seconds as float, not milliseconds. `time="1.234"` not `time="1234"`. Unit test: 1500ms duration produces `time="1.500"`.
- [ ] **JUnit XML escaping:** Often missing — verify test names with `<`, `>`, `&`, `"`, `'` characters produce valid XML. Test: create a test named `Check <script> & "quotes"` and verify XML parses with `xmllint`.
- [ ] **JUnit XML ANSI/control chars:** Often missing — verify error messages containing `\x1B[31m` color codes are stripped before writing into XML. Test: run a failing test and verify `xmllint --noout` passes on the output.
- [ ] **Env var undefined handling:** Often wrong — verify undefined `${VAR}` produces exit code 2 with the var name in the error message, not empty string substitution.
- [ ] **Env var in cache metadata:** Often missing — verify `.superghost-cache/` JSON files store `${VAR}` template form in `testCase`/`baseUrl` fields, not the resolved secret value.
- [ ] **Env var literal dollar sign:** Often missing — verify `case: "Price is $50"` works without attempting interpolation (no braces = no interpolation).
- [ ] **Env var default with special chars:** Often broken — verify `${DB_URL:-postgres://user:pass@host/db}` correctly produces the full Postgres URL including `://`, `:`, and `@`.
- [ ] **PR gate workflow + secrets:** Often wrong — verify PR workflow does NOT reference `secrets.*` anywhere. Fork PRs must complete all checks successfully without any secrets.
- [ ] **PR gate workflow + E2E tests:** Often wrong — verify `e2e:smoke` is NOT a required PR check. E2E tests belong only in the scheduled/manual `e2e.yml`.
- [ ] **PR gate job name stable:** Often wrong — verify branch protection is configured against the `gate` job name (not individual job names) so job renames don't break merging.
- [ ] **CONTRIBUTING.md Bun commands:** Often wrong — verify all commands use `bun`/`bunx`, not `npm`/`npx`. Follow the doc verbatim on a clean clone.
- [ ] **CONTRIBUTING.md Playwright step:** Often missing — verify the setup section includes `bunx playwright install chromium` for contributors who need to run browser tests.
- [ ] **Commander stdout in JUnit mode:** Often missing — verify `--output junit --help` does not write help text to stdout (it must go to stderr). The `configureOutput()` redirect from Phase 9 must also cover `--output junit`.
- [ ] **`--output junit` exit codes:** Often missing — verify that a run with all tests passing exits 0, any test failure exits 1, and config errors exit 2 — regardless of `--output junit` being active.

---

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| JUnit XML missing `classname`, CI tools drop results | LOW | Add `classname` attribute, re-generate reports. No data loss — regenerate from next run. |
| JUnit XML ANSI chars causing parse failure | LOW | Add `stripControlChars` function, release patch. No data lost — CI just needs a new run. |
| JUnit XML time in milliseconds instead of seconds | LOW | Fix the division (`/ 1000`), release patch. CI dashboards correct on next run. |
| Secrets in cache files committed to git | HIGH | Rotate exposed secrets immediately. Use `git filter-branch` or `bfg-repo-cleaner` to remove from history. Add cache dir to `.gitignore`. Enable secret scanning in repo settings. |
| Env var undefined produces empty string (silent failure) | MEDIUM | Add fail-fast validation. Re-run affected CI pipelines that may have silently passed with empty values. |
| GitHub Actions required check name mismatch blocking all PRs | MEDIUM | Repo admin updates branch protection to match current workflow job names. Document exact names in workflow comments. |
| `pull_request_target` secret exposure discovered | HIGH | Rotate all exposed secrets immediately. Change trigger to `pull_request`. Audit workflow run logs for exfiltration. |
| CONTRIBUTING.md has wrong commands | LOW | Correct the doc, create PR. No user data at risk — only contributor friction. |

---

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| JUnit XML missing classname | Phase 10: JUnit XML | Upload to GitHub Actions dorny/test-reporter; verify all tests appear |
| JUnit XML ANSI/control chars in CDATA | Phase 10: JUnit XML | Unit test: error with `\x1B[31m` color code; assert XML parses with `xmllint` |
| JUnit XML time in milliseconds | Phase 10: JUnit XML | Unit test: 1500ms duration produces `time="1.500"` |
| JUnit XML special char escaping | Phase 10: JUnit XML | Unit test: test name with `<>&"'` produces valid XML |
| Env var secrets in cache metadata | Phase 11: Env var interpolation | Inspect `.superghost-cache/` JSON after run; verify `${VAR}` not resolved value in metadata |
| Env var undefined silent failure | Phase 11: Env var interpolation | Integration test: unset var, assert exit code 2 with named var in error |
| Env var default-value parsing edge cases | Phase 11: Env var interpolation | Unit test: `${DB_URL:-postgres://user:pass@host/db}` produces full URL |
| Env var literal dollar sign | Phase 11: Env var interpolation | Unit test: `$50` passes through unchanged |
| PR workflow `pull_request_target` secret exposure | Phase 12: PR workflow | Code review: no `pull_request_target`, no `secrets.*` in PR workflow |
| GitHub Actions check name mismatch | Phase 12: PR workflow | Create test PR after branch protection setup; verify gate check appears and completes |
| PR workflow requiring secrets | Phase 12: PR workflow | Open PR from fork; verify all checks pass without secrets |
| CONTRIBUTING.md wrong commands | Phase 13: Contributor docs | Follow doc verbatim on fresh `git clone`; verify every command succeeds |
| CONTRIBUTING.md missing Playwright step | Phase 13: Contributor docs | Follow setup section; run browser tests; verify no missing step |

---

## Sources

- JUnit XML format specification and conventions (Testmo): https://github.com/testmoapp/junitxml
- JUnit XML format guide with attribute reference (Gaffer): https://gaffer.sh/blog/junit-xml-format-guide/
- ANSI escape codes in JUnit CDATA causing invalid XML (bats-core issue #311): https://github.com/bats-core/bats-core/issues/311
- ANSI escape codes invalid XML (mocha issue #4526): https://github.com/mochajs/mocha/issues/4526
- OpenShift strip ANSI chars from JUnit XML (PR #27801): https://github.com/openshift/origin/pull/27801
- Jenkins JUnit plugin: illegal XML characters not handled (issue #580): https://github.com/jenkinsci/junit-plugin/issues/580
- JUnit XML time in ms vs seconds (GitLab issue #26247): https://gitlab.com/gitlab-org/gitlab/-/issues/26247
- GitHub Actions pull_request_target security: preventing pwn requests (GitHub Security Lab): https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/
- GitHub Actions pull_request_target behavior change November 2025: https://github.blog/changelog/2025-11-07-actions-pull_request_target-and-environment-branch-protections-changes/
- GitHub Actions cache poisoning research: https://adnanthekhan.com/2024/05/06/the-monsters-in-your-build-cache-github-actions-cache-poisoning/
- Masking env vars in GitHub Actions logs: https://akarshseggemu.medium.com/github-actions-best-practices-masking-secrets-and-managing-environment-variables-0099015b1f52
- YAML security risks including env var interpolation injection (Kusari): https://www.kusari.dev/learning-center/yaml-security
- Vector env var interpolation security (newline rejection): https://vector.dev/docs/reference/environment_variables/
- GitHub Actions secure use reference: https://docs.github.com/en/actions/reference/security/secure-use
- Open Source Guides: maintaining CONTRIBUTING.md: https://contributing.md/how-to-build-contributing-md/
- SuperGhost codebase analysis: `src/cli.ts`, `src/output/reporter.ts`, `src/output/json-formatter.ts`, `src/runner/types.ts`, `src/config/loader.ts`, `src/config/schema.ts`, `src/cache/cache-manager.ts`, `src/cache/types.ts`, `.github/workflows/release.yml`, `.github/workflows/e2e.yml`

---
*Pitfalls research for: SuperGhost v0.4 CI/CD + Team Readiness (JUnit XML, Env Var Interpolation, PR Workflow, Contributor Docs)*
*Researched: 2026-03-12*
