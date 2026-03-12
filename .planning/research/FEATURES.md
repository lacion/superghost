# Feature Research

**Domain:** CI/CD testing CLI — v0.4 additions to SuperGhost
**Researched:** 2026-03-12
**Confidence:** HIGH (JUnit XML, env interpolation, GitHub Actions conventions are stable and well-documented)

---

## Scope Note

This file covers ONLY the four new features targeted for v0.4. Everything else (YAML config, AI agent execution, step caching, JSON output, exit codes, CLI flags, Biome, preflight checks) already exists and is not in scope.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features that CI/CD users assume exist. Missing these = SuperGhost cannot be used in standard CI toolchains.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| JUnit XML output (`--output junit`) | Every CI system (Jenkins, GitHub Actions, GitLab CI, CircleCI) natively ingests JUnit XML. Teams expect test frameworks to emit it. | LOW | JSON formatter already exists as pattern to follow. Pure function `formatJunitOutput(RunResult) → string`. Use `xml` or hand-roll (simple enough given shallow structure). |
| Env var interpolation in YAML (`${VAR}`) | `baseUrl`, `model`, API keys should never be hardcoded. Docker Compose, GitHub Actions, Kubernetes, Terraform all use `${VAR}` syntax. Users cannot safely share config files without it. | LOW | Regex-replace pass over raw YAML string before parsing, or post-parse walk of string values. `${VAR}` is the canonical form; `${VAR:-default}` for fallback is a highly expected extension. |
| PR workflow with test gates (GitHub Actions) | Teams expect `on: pull_request` workflow that blocks merges on lint/test failure. Without it, CI is incomplete. | LOW | `.github/workflows/ci.yml` — runs `bun test`, `bunx tsc --noEmit`, Biome lint check. Pattern already established by existing `e2e.yml` and `release.yml`. |
| CONTRIBUTING.md | GitHub community health checklist surfaces it prominently. Contributors won't submit PRs without knowing the process. | LOW | Document: dev setup (bun install, bun test), branch naming, commit message style, PR process, how to run tests. |
| SECURITY.md | GitHub's security tab actively prompts for it. Required for npm package trust signals. | LOW | Private disclosure instructions (GitHub Security Advisories recommended), response SLA, supported versions. |
| Issue templates | GitHub auto-surfaces them on "New Issue". Bug reports without a template get poor signal. | LOW | Two templates: bug report (repro steps, config snippet, expected vs actual) and feature request (use case, proposed behavior). |
| PR template | `.github/PULL_REQUEST_TEMPLATE.md` — GitHub inserts it automatically. Standard expectation for any active OSS repo. | LOW | Checklist: tests added/updated, `bun test` passing, `bun run check` passing, docs updated if needed. |

### Differentiators (Competitive Advantage)

Features that go beyond convention and align with SuperGhost's core value proposition.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `${VAR:-default}` fallback syntax in interpolation | Beyond basic `${VAR}`, fallback syntax lets teams specify safe defaults (e.g., `${BASE_URL:-http://localhost:3000}`) without requiring every env var to be set in every environment. Docker Compose uses this; teams expect parity. | LOW | Small addition to the interpolation regex. Catch undefined env vars without fallback as a warning or error, not silent empty string. |
| JUnit XML `<properties>` for SuperGhost metadata | Embed model, provider, cache source per test as `<property>` elements inside `<testsuite>`. CI dashboards (TestRail, Allure, Xray) surface this. Distinguishes SuperGhost results from generic test runners. | LOW | Optional extension inside the standard `<testsuite>` element — CI tools ignore unknown properties, so safe to include. |
| PR workflow uploads JUnit XML as artifact | `actions/upload-artifact` after test run means the JUnit file is inspectable per-PR run. GitHub's native test summary annotations depend on this. | LOW | Single `uses: actions/upload-artifact@v4` step after test run. Pairs naturally with `--output junit`. |
| Undefined env var error with actionable message | When `${MISSING_VAR}` has no value and no default, fail with a clear error listing the missing variable names instead of running with empty strings. | LOW | Validates interpolation results before passing to Zod. Surfaces as exit code 2 (config error), consistent with existing error taxonomy. |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| `.env` file auto-loading in CLI | Convenient — no need to export vars in shell. | Creates ambiguity about which env wins (shell env vs `.env` file), silently overrides CI-injected secrets, requires dotenv dependency. | Document that users should use `direnv`, `dotenv` CLI prefix, or their CI platform's secret injection. SuperGhost reads `process.env`; population is the user's responsibility. |
| Recursive `${VAR}` expansion (vars referencing vars) | Seems powerful for DRY configs. | Adds parse complexity, cycle detection, and confusing error messages. No standard tool supports it. | Keep interpolation single-pass, one level deep. |
| JUnit XML test attachments / screenshots | CI dashboards support them in extended JUnit formats. | Browser automation screenshots in SuperGhost require non-standard JUnit extensions that most CI tools do not render. Adds binary output complexity. | Out of scope for v0.4; defer to a dedicated artifact upload step if needed. |
| Parallel job matrix in PR workflow | Faster CI by splitting test files. | SuperGhost tests are sequential by design (v1.0 decision); matrix splitting is premature before parallel execution is supported. | Run full suite in a single job. Parallel execution is a v2 concern. |
| Code coverage gate in PR workflow | Common CI checklist item. | SuperGhost's tests are AI-driven E2E tests; unit test coverage is only for the CLI source itself. Coverage thresholds on a CLI tool add noise without signal. | Run `bun test` (unit tests pass/fail) and typecheck. Coverage reporting is optional, not a hard gate. |

---

## Feature Dependencies

```
Env var interpolation
    └──required by──> Any YAML config using ${VAR} syntax
                          └──used in──> PR workflow (ANTHROPIC_API_KEY via GitHub secrets)

JUnit XML output
    └──requires──> RunResult (already exists in src/runner/types.ts)
    └──mirrors pattern of──> JSON formatter (src/output/json-formatter.ts)
    └──enhanced by──> PR workflow artifact upload (optional)

PR workflow (ci.yml)
    └──requires──> bun test (already works)
    └──requires──> Biome lint (already configured)
    └──requires──> tsc --noEmit (already in release.yml)
    └──enhanced by──> JUnit XML artifact upload

CONTRIBUTING.md
    └──references──> PR workflow (links to CI requirements)
    └──references──> Biome (code style commands)

SECURITY.md
    └──standalone (no code dependencies)

Issue/PR templates
    └──standalone (GitHub UI feature, no code dependencies)
```

### Dependency Notes

- **Env var interpolation requires no new deps.** The YAML loader already reads the raw string; interpolation is a preprocessing step before `yaml.parse()`. No library needed — regex replace is sufficient.
- **JUnit XML requires no new deps.** The XML structure is shallow (3 levels deep). Hand-rolling is ~80 lines and avoids an xml-builder dependency. If a library is preferred, `fast-xml-parser` is the ecosystem standard.
- **PR workflow depends on existing tooling.** `bun test`, `bunx tsc --noEmit`, and `bunx biome check` all already work. The workflow is purely additive.
- **Contributor docs are independent.** CONTRIBUTING.md, SECURITY.md, and templates are markdown/YAML files with no code dependencies.

---

## MVP Definition

### This Milestone (v0.4) — All Four Features

This is a subsequent milestone, not a greenfield MVP. All four features are targeted and scoped:

- [ ] JUnit XML output — CI toolchain integration; `--output junit` flag already wired, need formatter implementation
- [ ] Env var interpolation — CI-safe configs; without it, API keys must be hardcoded in YAML
- [ ] PR workflow — blocks merges on broken builds/tests; foundational CI hygiene
- [ ] Contributor docs — CONTRIBUTING.md, SECURITY.md, issue templates, PR template

### Recommended Implementation Order

1. **Env var interpolation** — foundational; PR workflow demos it with `${ANTHROPIC_API_KEY}`
2. **JUnit XML output** — independent of interpolation; mirrors JSON formatter pattern
3. **PR workflow** — consumes both above; uses interpolation in workflow env block
4. **Contributor docs** — independent; can be done in parallel or last

### Future Consideration (v2+)

- [ ] `.env` file loading — deferred; document "use direnv" as alternative
- [ ] JUnit XML attachments/screenshots — deferred; requires non-standard extensions
- [ ] Parallel job matrix in CI — deferred until parallel test execution ships

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Env var interpolation | HIGH — CI pipelines cannot use hardcoded secrets | LOW — regex preprocessing before yaml.parse() | P1 |
| JUnit XML output | HIGH — required by Jenkins, GitHub Actions test summary, most CI dashboards | LOW — JSON formatter is the pattern, XML is ~80 lines | P1 |
| PR workflow (ci.yml) | HIGH — merge gates are CI table stakes | LOW — existing workflow patterns in repo; copy and adapt | P1 |
| CONTRIBUTING.md | MEDIUM — needed for contributors, not end users | LOW — documentation only | P1 |
| SECURITY.md | MEDIUM — npm package trust signal, GitHub health checklist | LOW — documentation only | P1 |
| Issue templates | MEDIUM — improves bug report quality | LOW — two YAML files | P2 |
| PR template | LOW-MEDIUM — reduces reviewer friction | LOW — one markdown file | P2 |
| `${VAR:-default}` fallback | MEDIUM — smooth local dev without full env setup | LOW — small regex extension | P2 |
| Undefined var error message | MEDIUM — prevents silent failures with empty baseUrl | LOW — validation pass on interpolated values | P2 |

**Priority key:**
- P1: Must have for v0.4
- P2: Should have, include in v0.4 if time allows
- P3: Future consideration

---

## Implementation Conventions (From Research)

### JUnit XML Structure SuperGhost Should Emit

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="SuperGhost" tests="3" failures="1" errors="0" time="12.4">
  <testsuite name="tests.yaml" tests="3" failures="1" errors="0" time="12.4"
             timestamp="2026-03-12T10:00:00Z">
    <properties>
      <property name="superghost.model" value="claude-sonnet-4-6"/>
      <property name="superghost.provider" value="anthropic"/>
    </properties>
    <testcase name="Login flow" classname="tests.yaml" time="4.2"/>
    <testcase name="Checkout flow" classname="tests.yaml" time="5.1">
      <failure message="Expected checkout confirmation page" type="AssertionError">
        AI could not locate the confirm button after 3 attempts
      </failure>
    </testcase>
    <testcase name="Search API" classname="tests.yaml" time="3.1"/>
  </testsuite>
</testsuites>
```

Key conventions (HIGH confidence — from testmoapp/junitxml spec):
- `time` attribute is in **seconds** (not milliseconds) — divide `durationMs` by 1000
- `timestamp` is ISO 8601 format
- `classname` on `<testcase>` is typically the suite/file name, not a Java class
- A `<testcase>` with no child elements = passed
- `<failure>` child element = test failed; `message` attribute is short; element body is detailed error
- `<error>` child element = unexpected error (distinct from test assertion failure)
- SuperGhost maps exit code 2 (config/runtime errors) to `<error>`, test failures to `<failure>`
- `time` at `<testsuite>` level is the sum of all `<testcase>` times
- `tests` count excludes skipped in some tools — emit both `tests` and `skipped` attributes to be safe

### Env Var Interpolation Conventions

Standard pattern across Docker Compose, Elastic Beats, Kubernetes ConfigMaps (HIGH confidence):
- `${VAR}` — substitute value of VAR from `process.env`
- `${VAR:-default}` — use `default` if VAR is unset or empty (Bash-compatible syntax)
- Interpolation happens **before YAML parsing** (string preprocessing on raw YAML text)
- Undefined vars without defaults should produce an **error**, not a silent empty string
- The dollar-sign escape `$$` → literal `$` is conventional but optional for v0.4
- Error message should list all missing variable names at once, not fail on first one

### GitHub Actions PR Workflow Conventions

Standard `ci.yml` trigger and job structure for a TypeScript CLI (MEDIUM-HIGH confidence):

```yaml
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
```

Jobs:
1. `bun test` — unit tests
2. `bunx tsc --noEmit` — type safety
3. `bunx biome check .` — lint + format

All three can be one job for a small CLI (no parallelism benefit). Split only if individual job durations justify it.

Branch protection rule: require all status checks to pass before merging (documented in CONTRIBUTING.md, enabled in repo settings by maintainer).

### Contributor Docs Conventions

**CONTRIBUTING.md must include** (GitHub community health checklist):
- Prerequisites and dev environment setup (`bun install`, Playwright install)
- How to run tests (`bun test`) and lint (`bun run check`)
- Branch and commit message conventions (matches existing repo style)
- PR submission process
- Link to issue templates for bugs/features

**SECURITY.md must include** (GitHub security tab requirement):
- Supported versions table
- How to report a vulnerability — GitHub Security Advisories is the recommended private channel
- Response timeline (e.g., acknowledge within 72 hours)
- Scope: what is and is not covered

**Issue templates** (`.github/ISSUE_TEMPLATE/`):
- `bug_report.yml` — repro steps, config snippet (with secrets redacted), CLI version (`superghost --version`), expected vs actual output
- `feature_request.yml` — use case, proposed behavior, alternatives considered

**PR template** (`.github/PULL_REQUEST_TEMPLATE.md`):
- Checklist: tests added/updated, `bun test` passes, `bun run check` passes, docs updated if behavior changed

---

## Sources

- [JUnit XML Format Specification — testmoapp/junitxml](https://github.com/testmoapp/junitxml) — authoritative community spec (HIGH confidence)
- [JUnit XML Schema — windyroad/JUnit-Schema](https://github.com/windyroad/JUnit-Schema/blob/master/JUnit.xsd) — XSD reference
- [Docker Compose Variable Interpolation](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/) — canonical `${VAR}` and `${VAR:-default}` conventions (HIGH confidence)
- [Elastic Beats Environment Variables](https://www.elastic.co/guide/en/beats/winlogbeat/current/using-environ-vars.html) — preprocessing-before-parse convention
- [GitHub Actions PR Workflow Guide 2026](https://oneuptime.com/blog/post/2026-02-02-github-actions-pull-requests/view)
- [GitHub Actions CI Test Automation](https://mastersoftwaretesting.com/automation-academy/ci-cd-integration/github-actions-test-automation)
- [Enforce Code Quality Gates in GitHub Actions](https://graphite.com/guides/enforce-code-quality-gates-github-actions)
- [GitHub Community Health Files — GitHub Docs](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file) (HIGH confidence — official)

---
*Feature research for: SuperGhost v0.4 CI/CD + Team Readiness*
*Researched: 2026-03-12*
