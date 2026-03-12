# Project Research Summary

**Project:** SuperGhost v0.4 — CI/CD + Team Readiness
**Domain:** CLI testing tool — JUnit XML output, env var interpolation, GitHub Actions PR workflow, contributor docs
**Researched:** 2026-03-12
**Confidence:** HIGH

## Executive Summary

SuperGhost v0.4 is a targeted CI/CD readiness milestone for an existing AI-powered CLI testing tool. The four features — JUnit XML output, env var interpolation, GitHub Actions PR workflow, and contributor docs — are all well-understood, low-complexity additions that follow established patterns already present in the codebase. No new runtime dependencies are needed; every feature is implementable as pure TypeScript or configuration/Markdown files using existing infrastructure. The recommended approach is to treat each feature as a small, isolated unit that integrates into clearly defined seams: `src/output/` for the JUnit formatter, `src/config/loader.ts` for interpolation, `.github/workflows/` for CI, and repo root for docs. The existing `json-formatter.ts` batch-function pattern is the direct template for the JUnit formatter; the existing `release.yml` and `e2e.yml` workflows supply all required actions at the correct pinned versions.

The dominant risk in this milestone is not implementation complexity but correctness in the details. JUnit XML has no formal specification and CI tools behave inconsistently when attributes are missing or values are formatted incorrectly — most notably `classname` (causes silent result grouping failures), `time` in milliseconds instead of seconds (produces wildly inflated timing displays), and control characters or ANSI escape sequences in failure message bodies (produces unparseable XML that only breaks when tests fail). Env var interpolation carries a distinct secret-leakage risk: resolved values must not flow into cache file metadata or CI artifact outputs. Both categories of risk are fully preventable with targeted unit tests written alongside the implementations.

The correct implementation sequence is: env var interpolation first (foundational, enables all CI configs to reference secrets safely), JUnit XML formatter second (pure function, no dependencies on interpolation, mirrors `json-formatter.ts` exactly), CLI wiring for `--output junit` third (minimal change to `cli.ts`), PR workflow fourth (validates all code changes in CI using `pull_request` trigger exclusively), and contributor docs last (written after all tooling is finalized and verified command-by-command on a clean checkout). All four features are independent of the runner, agent, cache, and infra layers.

---

## Key Findings

### Recommended Stack

No new runtime dependencies are required for v0.4. The entire milestone is implementable within the existing stack (Bun, Vercel AI SDK, Commander.js, Zod, `yaml`, Biome, Playwright MCP). JUnit XML generation is approximately 80 lines of pure TypeScript using template literals with proper XML escaping — adding `junit-report-builder` or any XML library for a structure this shallow contradicts the project's demonstrated lean-dependency posture. Env var interpolation is 10–15 lines in `src/config/loader.ts`. The PR workflow reuses `actions/checkout@v4` and `oven-sh/setup-bun@v2` already pinned in the existing `release.yml` and `e2e.yml` — keeping versions consistent matters more than upgrading to `actions/checkout@v6` for a patch release.

**Core technologies (v0.4 — no new dependencies):**
- Pure TypeScript `junit-formatter.ts`: JUnit XML generation — mirrors `json-formatter.ts` exactly; no library justified for a shallow, known XML schema
- `process.env` string preprocessing: Env var interpolation — `yaml-env-defaults` explicitly avoided because it wraps `js-yaml` (inconsistent with the `yaml` package already in use)
- `actions/checkout@v4` + `oven-sh/setup-bun@v2`: PR workflow actions — already in project at these versions; no upgrade for consistency

### Expected Features

All four v0.4 features are P1 table stakes. CI/CD users treat JUnit XML, env var interpolation, and PR merge gates as prerequisites for adopting any test framework in a real pipeline. Contributor docs (CONTRIBUTING.md, SECURITY.md, issue templates, PR template) are required by GitHub's community health checklist and necessary for npm package trust signals.

**Must have (table stakes):**
- JUnit XML output (`--output junit`) — every CI system (Jenkins, GitHub Actions, GitLab CI, CircleCI) natively ingests JUnit XML; without it, SuperGhost cannot integrate into standard CI dashboards
- Env var interpolation (`${VAR}`) — CI configs cannot safely reference API keys or base URLs without it; hardcoded secrets in YAML are a non-starter
- PR workflow (`ci.yml` or `pr.yml`) — merge gates blocking on lint/typecheck/test failure are standard CI hygiene; their absence signals an immature project
- CONTRIBUTING.md + SECURITY.md — GitHub community health checklist; required for external contributions and npm package trust

**Should have (differentiators within v0.4):**
- `${VAR:-default}` fallback syntax — smooth local dev without requiring every env var to be set; Docker Compose parity
- Undefined var error with actionable message — fail with named variable and exit code 2, not generic config error
- JUnit XML `<properties>` for SuperGhost metadata (model, provider) — CI dashboards surface this; distinguishes SuperGhost reports from generic test runners
- Issue templates (bug report, feature request) + PR template — improves bug report signal and reduces reviewer friction

**Defer (v2+):**
- `.env` file auto-loading — creates shell env vs. file ambiguity; document "use direnv" as the alternative
- JUnit XML test attachments/screenshots — requires non-standard extensions most CI tools do not render
- Parallel job matrix in PR workflow — premature before parallel execution is supported in the runner

### Architecture Approach

All four v0.4 features integrate at well-defined, isolated seams in the current architecture without touching the runner, agent, cache, or infra layers. The JUnit formatter follows the `json-formatter.ts` batch-function pattern exactly: a pure function receiving the complete `RunResult` after the run completes and returning a string, called once in `cli.ts` after `runner.run()` resolves. Env var interpolation inserts as a string-preprocessing layer in `src/config/loader.ts` between `file.text()` and `YAML.parse()` — matching the approach used by Docker Compose, GitHub Actions, and CircleCI. The PR workflow is a new `.github/workflows/pr.yml` file with no modifications to existing workflows.

**Components and their v0.4 impact:**
1. `src/output/junit-formatter.ts` (new, ~80 lines) — pure function `formatJunitOutput(RunResult) → string`; sibling to `json-formatter.ts`; also exports `formatJunitDryRun` and `formatJunitError` variants
2. `src/config/loader.ts` (modified, ~15 lines) — `interpolateEnvVars()` private function called between `file.text()` and `YAML.parse()`; throws `ConfigLoadError` on undefined variables
3. `src/cli.ts` (modified, ~20 lines) — extend `--output` validation from `"json"` to `["json", "junit"]`; add three parallel JUnit output blocks; import `formatJunit*` functions
4. `.github/workflows/pr.yml` (new, ~25 lines) — lint + typecheck + test on `pull_request` to `main`; single `gate` job for branch protection stability
5. Five contributor doc files (new, documentation only) — `CONTRIBUTING.md`, `SECURITY.md`, two issue templates, PR template

### Critical Pitfalls

1. **JUnit XML missing `classname` attribute** — CI tools silently drop or misgroup test results; `classname` is technically optional in some XSD schemas but required by every real CI tool. Set `classname` to the config file name on every `<testcase>` element. Validate by uploading to GitHub Actions `dorny/test-reporter`.

2. **ANSI escape codes and control characters in failure bodies** — `\x1B` (the escape character from `picocolors` color output) is an illegal XML 1.0 character; it produces unparseable XML that only breaks when tests fail (a confusing silent-until-real-failure failure mode). Strip ANSI sequences (`/\x1B\[[0-9;]*[a-zA-Z]/g`) and all control characters below `\x20` (except tab, newline, carriage return) from every dynamic string before writing into XML. This is a documented recurring bug in pytest, mocha, bats, and OpenShift.

3. **JUnit XML `time` in milliseconds instead of seconds** — `TestResult.durationMs` divided by 1000 is a one-line conversion that is easy to forget. CI tools accept the wrong value silently, displaying test durations as hours. Unit test: 1500ms produces `time="1.500"`.

4. **Env var secrets leaking into cache metadata** — resolved values from interpolation must not flow into `.superghost-cache/` JSON metadata fields. Store the template form (`${VAR}`) in human-readable metadata; use the resolved value only for hash computation and runtime execution. High recovery cost: secrets committed to git require key rotation and history rewriting.

5. **GitHub Actions `pull_request_target` secret exposure** — using `pull_request_target` instead of `pull_request` grants fork PRs access to repository secrets, enabling secret exfiltration. Use `pull_request` exclusively for CI lint/test workflows that need no secrets.

---

## Implications for Roadmap

Based on combined research, the four features map naturally to four sequential phases. All are small and independent, but ordering matters: the PR workflow is most valuable after the code features exist (so CI validates them), and contributor docs must be written after all tooling is finalized (so commands documented in CONTRIBUTING.md match actual repository state).

### Phase 10: JUnit XML Formatter

**Rationale:** Pure function with no dependencies on other v0.4 features. The `json-formatter.ts` pattern is already proven and the `--output` seam in `cli.ts` is already prepared from Phase 9. This is the highest-value CI integration feature — once shipped, SuperGhost results appear natively in Jenkins, GitHub Actions test summary, GitLab CI, and CircleCI dashboards.
**Delivers:** `src/output/junit-formatter.ts` plus CLI wiring in `src/cli.ts`; `--output junit` flag produces spec-compliant XML consumable by all major CI systems
**Addresses:** JUnit XML output (P1 table stakes), `<properties>` metadata (P2 differentiator)
**Avoids:** Missing `classname` attribute, ANSI control chars in failure bodies, milliseconds-not-seconds `time` attribute, XML injection from unescaped special characters — all four must be unit-tested before the formatter ships

### Phase 11: Env Var Interpolation

**Rationale:** Fully self-contained change to `loader.ts`. Foundational for CI-safe configs: once implemented, the PR workflow can reference `${ANTHROPIC_API_KEY}` and all documentation examples can demonstrate interpolated configs safely. The secret leakage concern (resolved values in cache metadata) must be designed in from the start, not retrofitted.
**Delivers:** `${VAR}` and `${VAR:-default}` interpolation in YAML configs; fail-fast error on undefined vars naming the missing variable; exit code 2 on config errors consistent with existing taxonomy
**Addresses:** Env var interpolation (P1 table stakes), `${VAR:-default}` fallback (P2), actionable error messages (P2)
**Avoids:** Secrets leaking into cache metadata (store template form, not resolved value), silent empty-string substitution on undefined vars, `${VAR:-default}` parsing edge cases with special characters (`:`, `@`, `/`) in default values

### Phase 12: GitHub Actions PR Workflow

**Rationale:** Best added after phases 10 and 11 so the workflow validates real functionality. Uses `pull_request` trigger exclusively — no secrets needed or granted, fork PRs work correctly. A single `gate` job depending on lint + typecheck + test must be the only required status check, preventing job rename from silently blocking all PRs.
**Delivers:** `.github/workflows/pr.yml` running lint, typecheck, and unit tests on every PR to `main`; single `gate` job as the required status check
**Addresses:** PR workflow with test gates (P1 table stakes)
**Avoids:** `pull_request_target` secret exposure, required check name mismatch from per-job branch protection, E2E tests in PR workflow (stays in `e2e.yml`)

### Phase 13: Contributor Docs

**Rationale:** Must be written last. CONTRIBUTING.md references the PR workflow (Phase 12), Biome lint commands, `--output junit` (Phase 10), and env var interpolation syntax (Phase 11). Writing it before those features are finalized guarantees stale documentation. Every command in CONTRIBUTING.md must be verified by executing it verbatim on a clean `git clone`.
**Delivers:** `CONTRIBUTING.md`, `SECURITY.md`, `.github/ISSUE_TEMPLATE/bug_report.md`, `.github/ISSUE_TEMPLATE/feature_request.md`, `.github/PULL_REQUEST_TEMPLATE.md`
**Addresses:** Contributor docs (P1 table stakes), issue templates (P2), PR template (P2)
**Avoids:** Documenting non-existent or renamed commands, using `npm`/`npx` instead of `bun`/`bunx`, omitting `bunx playwright install chromium`, CI check name mismatches in the PR checklist

### Phase Ordering Rationale

- Phases 10 and 11 are fully independent of each other and could be implemented in either order or in parallel; the recommended sequential ordering is for implementation focus, not technical necessity
- Phase 12 (PR workflow) benefits from phases 10 and 11 being complete so the CI workflow exercises real `--output junit` and interpolation functionality in its test gate
- Phase 13 (contributor docs) is non-negotiably last — this is a hard constraint identified by research; docs written before tooling is final describe the wrong commands and give contributors a broken first experience

### Research Flags

No phases in this milestone require `/gsd:research-phase` during planning. All technical decisions are fully resolved in the existing research files. This is an execution milestone, not a discovery milestone.

Phases with standard patterns confirmed (skip additional research):
- **Phase 10 (JUnit XML):** JUnit XML schema is fully documented in testmoapp/junitxml; `json-formatter.ts` is the direct pattern template; all edge cases enumerated in PITFALLS.md
- **Phase 11 (Env var interpolation):** Pattern is standard across Docker Compose, GitHub Actions, CircleCI; implementation is ~15 lines; all edge cases documented including the token-parser requirement for `${VAR:-default}` with special chars in defaults
- **Phase 12 (PR workflow):** Pattern established by existing `release.yml` and `e2e.yml`; no new actions needed; all security considerations documented
- **Phase 13 (Contributor docs):** Documentation task; GitHub community health file requirements are fully specified by official GitHub docs

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | No new dependencies; existing stack is validated. JUnit XML schema confirmed against testmoapp/junitxml authoritative spec. Existing workflow action versions confirmed in repository. `yaml-env-defaults` explicitly evaluated and rejected for sound technical reasons. |
| Features | HIGH | JUnit XML, env interpolation, and GitHub Actions conventions are stable and well-documented. All anti-features documented with rationale. Contributor doc requirements confirmed from official GitHub docs. |
| Architecture | HIGH | Based on direct source code inspection of `src/cli.ts`, `src/output/json-formatter.ts`, `src/config/loader.ts`, `src/runner/types.ts`, and existing workflows. Integration points are precise to file and line level. |
| Pitfalls | HIGH | JUnit XML pitfalls confirmed by documented bugs in multiple OSS projects (pytest, mocha, bats, OpenShift, GitLab). Secret exposure pitfall confirmed by GitHub Security Lab. Check name mismatch confirmed by GitHub Actions documentation. ANSI/XML issue confirmed by Jenkins JUnit plugin issue tracker. |

**Overall confidence:** HIGH

### Gaps to Address

- **`${VAR:-default}` parser implementation approach:** Research recommends a proper token parser (track brace depth, split on first `:-`) rather than a single regex for the default-value syntax. The naive regex breaks on URLs in defaults containing `:`. This implementation decision must be locked before phase 11 begins — the design choice affects the scope estimate.

- **JUnit XML `<properties>` field availability:** Research identifies SuperGhost model/provider metadata in `<properties>` as a P2 differentiator, but the current `RunResult` type may not expose this data directly. Verify field availability during phase 10 planning before committing to the feature.

- **Commander.js stdout redirect coverage for `--output junit`:** Phase 9 added `configureOutput()` to redirect Commander's help/version text from stdout to stderr. Research flags that this must also cover `--output junit` mode. Verify the existing implementation covers all Commander output paths before phase 10 closes.

---

## Sources

### Primary (HIGH confidence)
- [testmoapp/junitxml](https://github.com/testmoapp/junitxml) — authoritative JUnit XML format specification, element/attribute reference, `classname` requirement
- [Docker Compose variable interpolation](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/) — canonical `${VAR}` and `${VAR:-default}` conventions
- [GitHub Community Health Files](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file) — contributor doc placement and requirements
- [GitHub Actions secure use reference](https://docs.github.com/en/actions/reference/security/secure-use) — `pull_request` vs `pull_request_target` security guidance
- [GitHub Security Lab: preventing pwn requests](https://securitylab.github.com/resources/github-actions-preventing-pwn-requests/) — `pull_request_target` secret exfiltration documentation
- SuperGhost codebase direct inspection: `src/cli.ts`, `src/output/json-formatter.ts`, `src/runner/types.ts`, `src/config/loader.ts`, `.github/workflows/release.yml`, `.github/workflows/e2e.yml`

### Secondary (MEDIUM confidence)
- [actions/checkout releases](https://github.com/actions/checkout/releases) — version confirmation (v6 latest but v4 pinned in project; keep consistent)
- [GitHub Actions PR workflow guide 2026](https://oneuptime.com/blog/post/2026-02-02-github-actions-pull-requests/view) — trigger event types and job structure
- [JUnit XML format guide — Gaffer](https://gaffer.sh/blog/junit-xml-format-guide/) — element and attribute reference
- [string-env-interpolation npm](https://www.npmjs.com/package/string-env-interpolation) — confirms standard regex pattern; validates that no library is justified for this use case

### Tertiary (informational)
- [bats-core issue #311](https://github.com/bats-core/bats-core/issues/311) — ANSI escape codes in JUnit CDATA causing invalid XML (confirms pattern is real, recurring)
- [mocha issue #4526](https://github.com/mochajs/mocha/issues/4526) — same ANSI/XML issue in another major test runner
- [GitLab issue #26247](https://gitlab.com/gitlab-org/gitlab/-/issues/26247) — JUnit XML `time` in ms vs. seconds confirmed bug
- [Jenkins JUnit plugin issue #580](https://github.com/jenkinsci/junit-plugin/issues/580) — illegal XML characters not handled; confirms ANSI chars break CI JUnit parsing
- [OpenShift PR #27801](https://github.com/openshift/origin/pull/27801) — strip ANSI chars from JUnit XML; real-world fix for the same pitfall

---
*Research completed: 2026-03-12*
*Ready for roadmap: yes*
