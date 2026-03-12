# Project Research Summary

**Project:** SuperGhost v0.3 — CI/CD + Team Readiness
**Domain:** AI-powered E2E testing CLI — structured output formats, linting enforcement, PR workflow gates, env var interpolation, contributor readiness
**Researched:** 2026-03-12
**Confidence:** HIGH

## Executive Summary

SuperGhost v0.3 is a CI/CD and team-readiness milestone for an already-shipped AI-powered E2E testing CLI. The core v1.0 engine (AI agent, browser automation, caching) and v0.2 DX polish (exit codes, verbose mode, stderr/stdout separation) are complete. v0.3 adds the six features that make SuperGhost safe to adopt in team environments: machine-readable output formats (JSON and JUnit XML), linting/formatting enforcement via Biome, a GitHub Actions PR quality gate, env var interpolation in YAML configs, and contributor documentation. Every one of these features has a well-understood, documented implementation pattern — this is not exploratory work.

The recommended approach is dependency-ordered construction with a zero-new-npm-dependencies policy for all output and interpolation features. The existing `Reporter` interface, `RunResult`/`TestResult` types, and the critical stdout-is-for-machines/stderr-is-for-humans architectural invariant are the correct foundation for everything in this milestone. The only new npm dependency is `@biomejs/biome` (pinned exact version), which replaces what would otherwise be five or more ESLint + Prettier packages. JSON output, JUnit XML output, env var interpolation, and the GitHub Actions workflow all require zero new runtime dependencies.

The key risks are implementation details, not architectural: stdout pollution corrupting JSON output when Commander.js writes help/version text; JUnit XML missing the `classname` attribute causing CI tools to silently drop results; env var interpolation being applied before YAML parsing (which breaks on YAML-special characters in env var values); and Biome's first-run formatting explosion on existing files if not sequenced before feature work. All of these are avoidable with a disciplined build order that puts Biome setup first and applies explicit stdout/stderr routing discipline for all machine-readable output.

---

## Key Findings

### Recommended Stack

The existing stack (Bun >=1.2.0, TypeScript 5.x, Vercel AI SDK 6.x, Commander.js 14.x, Zod 4.x, picocolors, nanospinner, picomatch) requires no changes. The v0.3 stack adds exactly one npm package: `@biomejs/biome@^2.4.6` (exact pin via `--exact` flag), which provides linting, formatting, and import sorting as a single Rust binary — replacing what would otherwise require five or more packages and multiple configuration files.

For GitHub Actions, three actions are used but none are npm dependencies: `oven-sh/setup-bun@v2` (official Bun CI action), `mikepenz/action-junit-report@v6` (JUnit XML to PR annotations), and `actions/checkout@v4` (standard checkout). JSON output, JUnit XML generation, env var interpolation, and the CI workflow all use zero new npm dependencies.

**Core technologies (additions only):**
- `@biomejs/biome@^2.4.6` (exact pin): lint + format + import sort — single Rust binary, 20-100x faster than ESLint+Prettier, first-class TypeScript inference in v2, `biome ci` command designed for read-only CI checks
- `oven-sh/setup-bun@v2` (GitHub Action, not npm): official Bun CI setup — version pinning, caching, PATH management
- `mikepenz/action-junit-report@v6` (GitHub Action, not npm): JUnit XML to PR annotations — supports `<failure>` and `<error>`, inline check annotations

**Critical version requirements:**
- `@biomejs/biome` must be pinned exact (`--exact`) due to rapid release cycle that adds new rules in minor versions
- `bun install --frozen-lockfile` must be used in CI to enforce reproducible installs

### Expected Features

**Must have (table stakes) — what makes this milestone complete:**
- JSON output (`--output json`) — every CI tool expects machine-readable output; `RunResult` maps directly to the schema; single JSON object to stdout on completion, human progress always on stderr
- JUnit XML output (`--output junit`) — universal CI reporting format consumed by GitHub Actions, Jenkins, GitLab, CircleCI; hand-crafted with template literals and an `escapeXml()` helper; `<properties>` per testcase carry SuperGhost-specific `source` and `selfHealed` metadata
- Biome linting/formatting — code quality gate without Biome makes all other CI enforcement advisory; must come first so all v0.3 code is lint-clean from the start
- GitHub Actions PR workflow (`ci.yml`) — three parallel jobs (lint, typecheck, test); no E2E in PR gate (requires secrets, is slow and non-deterministic); required status checks in branch protection lock the quality gate
- Env var interpolation (`${VAR}` syntax) — CI environments pass secrets via env vars; hardcoding in YAML is a security anti-pattern; Docker Compose `${VAR}`, `${VAR:-default}`, `${VAR:?error}` syntax
- Contributor docs (CONTRIBUTING.md, SECURITY.md, issue/PR templates) — absent documentation signals the project is not ready for contributions; GitHub surfaces community health scores

**Should have (differentiators):**
- Simultaneous human + machine output (stderr for humans always active while `--output json/junit` writes to stdout) — architecturally superior to the reporter-switching pattern in Jest/Vitest/Playwright
- `version: 1` field in JSON output — enables schema evolution; most tools dump unversioned JSON and break consumers on updates
- JUnit XML `<properties>` with `source` (cache/ai) and `selfHealed` metadata — unique to AI-driven testing; no other tool reports cache vs AI execution source
- `${VAR:?error}` required variable syntax with descriptive error messages — genuine CI DX differentiator vs. silent empty-string substitution

**Defer to v0.4+:**
- `--output-file <path>` flag — shell redirection (`> results.xml`) handles this; only add if users request
- TAP output format — poor CI adoption; JSON + JUnit cover all real-world needs
- `dorny/test-reporter` GitHub Action integration in ci.yml — easy to add once JUnit XML exists
- Multiple simultaneous output formats — complexity with near-zero demand; cached replay makes second run instant
- HTML report output — scope creep; Allure and similar tools consume JUnit XML to generate HTML

### Architecture Approach

v0.3 requires no changes to the core engine (TestRunner, TestExecutor, CacheManager, AI agent subsystem, Reporter interface). All additions are additive: two new output formatters, one new config processing layer, one new config file, one new workflow file, and documentation. The `ConsoleReporter` always runs on stderr for human-readable progress. JSON and JUnit formatters are not Reporter implementations — they are batch transformers that receive the completed `RunResult` after the run completes and write a single atomic output to stdout. This design preserves live progress feedback while enabling machine-readable output simultaneously.

**Major components (new in v0.3):**

1. `src/output/json-formatter.ts` — transforms `RunResult` into versioned JSON schema; writes single JSON object to stdout via `Bun.write(Bun.stdout, ...)`; exports `formatJson(runResult)` and `writeJsonToStdout(json)`
2. `src/output/junit-formatter.ts` — transforms `RunResult` into JUnit XML; hand-crafted with `escapeXml()` helper; `<properties>` per testcase; `time` in seconds (not ms); writes to stdout
3. `src/config/interpolate.ts` — recursively walks parsed YAML object (post-`YAML.parse`, pre-Zod) replacing `${VAR}`, `${VAR:-default}`, `${VAR:?error}` patterns with `process.env` values; throws `ConfigLoadError` with named variable on missing required vars
4. `biome.json` — single configuration file replacing ESLint + Prettier; 2-space indentation, 100-char line width, recommended rules
5. `.github/workflows/ci.yml` — three parallel jobs: lint (`biome ci`), typecheck (`tsc --noEmit`), test (`bun test`); triggers on `pull_request` and `push` to main

**Modified components:**
- `src/cli.ts` — adds `--output <format>` option (choices: json, junit); dispatches to formatters after `runner.run()`; `program.configureOutput()` redirects Commander stdout to stderr to prevent pollution
- `src/config/loader.ts` — inserts `interpolateEnvVars(raw)` call between `YAML.parse()` and `ConfigSchema.safeParse()`
- `package.json` — adds Biome devDependency, lint/lint:fix/format scripts

**Unchanged components:** TestRunner, TestExecutor, ConsoleReporter, Reporter interface, CacheManager, AI agent subsystem, Config schema.

### Critical Pitfalls

1. **stdout pollution in JSON/JUnit mode** — Commander.js writes `--help` and `--version` to stdout by default; any `console.log` or third-party library writing to stdout corrupts the machine-readable output. Prevention: call `program.configureOutput({ writeOut: writeStderr, writeErr: writeStderr })` before argument parsing; add integration test that pipes `--output json` through `JSON.parse()` for both success and error exit paths.

2. **JUnit XML `classname` omission causing silent result loss** — GitHub Actions, GitLab CI, Jenkins, and CircleCI all require the `classname` attribute on `<testcase>` elements; omitting it causes tools to silently drop tests with no error. Prevention: always set `classname="superghost"` (or config filename); validate generated XML by uploading to GitHub Actions and confirming test summary displays all tests.

3. **Env var interpolation before YAML parsing breaks on YAML-special characters** — if `${DB_PASS}` resolves to `foo:bar#baz` and interpolation runs on the raw YAML string, YAML parsing interprets `foo:bar#baz` as a mapping. Prevention: parse YAML first to get JS object, then walk the object and replace `${VAR}` patterns in string values only (post-parse, not pre-parse).

4. **Biome formatting explosion blocks in-flight branches** — adding Biome to an existing 3,787 LOC codebase without sequencing produces a mass formatting commit that creates merge conflicts on all active branches. Prevention: Biome setup must be the first commit of the milestone, on main, before any feature branches exist.

5. **GitHub Actions required check name mismatch blocks all PRs** — required status check names in branch protection are case-sensitive composite strings (`CI / lint`); any workflow or job rename silently orphans the required check. Prevention: add a single `gate` job with `needs: [lint, typecheck, test]` and make only that job required in branch protection settings.

6. **Env var secrets leaking into cache files** — resolved env var values (API keys, tokens) flow into `CacheManager` and end up in `.superghost-cache/` JSON files, potentially committed to git. Prevention: store template form (`${API_BASE_URL}`) in cache metadata; use resolved values only for hash computation and runtime execution.

---

## Implications for Roadmap

Based on combined research, the dependency graph produces a clear six-phase build order. All dependencies flow in one direction with no cycles. Each phase delivers standalone value and the ordering is enforced by real dependency constraints, not preference.

### Phase 1: Biome Setup and Code Formatting Baseline

**Rationale:** Biome must be the first commit of the milestone. Running it after any feature code is written risks a mass formatting diff that conflicts with in-flight branches and makes git blame useless. The formatting baseline must exist before any feature code is committed. Every subsequent commit benefits from enforced style.

**Delivers:** `biome.json`, `@biomejs/biome` devDependency (exact pin), lint/lint:fix/format npm scripts, one-time `biome check --write .` formatting commit on main, verified 0 violations in CI.

**Addresses:** Biome linting/formatting table-stakes feature from FEATURES.md.

**Avoids:** Biome formatting explosion pitfall (PITFALLS.md Pitfall 5). Phase 5 PR workflow depends on Biome existing.

**Research flag:** No deeper research needed. Biome v2 setup is fully documented.

---

### Phase 2: JSON Output Format

**Rationale:** Simpler of the two output formats. Validates the `--output <format>` CLI flag infrastructure and the batch-formatter architecture (transform `RunResult` post-run, write once to stdout) before JUnit XML reuses both. Provides immediate CI/CD value to users who pipe to `jq` or consume output in custom scripts.

**Delivers:** `src/output/json-formatter.ts`, `--output <format>` CLI flag with `json` choice, Commander `configureOutput()` stdout redirect, integration tests verifying JSON validity on both success and error exit paths. JSON schema includes `version: 1` and `success: boolean` at top level.

**Addresses:** JSON output table-stakes, `version: 1` schema field differentiator, simultaneous human+machine output differentiator.

**Avoids:** Pitfall 1 (stdout pollution from Commander), Pitfall 7 (missing schema version field). PITFALLS.md is explicit: config errors must also produce valid JSON on stdout with a top-level `error` field when `--output json` is active.

**Research flag:** No deeper research needed. Pattern is established.

---

### Phase 3: JUnit XML Output Format

**Rationale:** Same formatter architecture as JSON, reuses the `--output` flag infrastructure validated in Phase 2. More complex due to XML escaping requirements and the `classname`/`time` format pitfalls, which is why it comes after JSON.

**Delivers:** `src/output/junit-formatter.ts`, `junit` choice added to `--output`, `escapeXml()` helper (5-character escape: `&<>"'`), `<properties>` per testcase with `source` and `selfHealed`, integration test verifying XML in GitHub Actions test summary.

**Addresses:** JUnit XML table-stakes, `<properties>` metadata differentiator.

**Avoids:** Pitfall 2 (`classname` attribute omission causes silent result loss), time format pitfall (`time` must be seconds as float, not milliseconds), XML escaping pitfall (test names with `<>&"'` must be escaped).

**Research flag:** No deeper research needed. testmoapp/junitxml spec is authoritative.

---

### Phase 4: Env Var Interpolation

**Rationale:** Fully independent of output formats and CI setup — operates in the config loader layer, not the output layer. Placed after output formats so it benefits from established lint enforcement. Needs careful implementation due to ordering constraint (post-parse, not pre-parse), secret leakage concern, and syntax edge cases.

**Delivers:** `src/config/interpolate.ts` with recursive `interpolateEnvVars()` (walks parsed JS object, not raw YAML string), `src/config/loader.ts` modified to call interpolation between `YAML.parse()` and `ConfigSchema.safeParse()`, unit tests covering all syntax variants (basic substitution, default values, required vars, escape sequences, missing vars, nested objects, arrays).

**Addresses:** Env var interpolation table-stakes, `${VAR:?error}` required-variable differentiator, `${VAR:-default}` default-value differentiator.

**Avoids:** Pitfall 3 (pre-parse interpolation breaks on YAML-special chars), Pitfall 6 (literal `$` ambiguity — only `${VAR}` braced syntax supported, never bare `$VAR`), secret leakage into cache files (store template form in metadata).

**Research flag:** No deeper research needed. Docker Compose interpolation is the reference. One design decision to make explicit: `${VAR}` with unset var should throw (exit 2 with named var in error), not silently substitute empty string.

---

### Phase 5: GitHub Actions PR Workflow

**Rationale:** Depends on Biome being set up (lint job calls `biome ci`) and on test infrastructure being stable (test job runs `bun test`). Placed last among code features so the workflow CI-tests all features from Phases 1-4. Job names must be finalized before branch protection is configured.

**Delivers:** `.github/workflows/ci.yml` with three parallel jobs (lint, typecheck, test), `gate` job depending on all three for branch protection, lint step added to `release.yml`, branch protection configuration guide in CONTRIBUTING.md.

**Addresses:** PR workflow with test gates table-stakes, "CI provided out-of-the-box" differentiator.

**Avoids:** Pitfall 4 (check name mismatch — use a single `gate` job as the required check, not individual jobs), E2E tests in PR gate anti-pattern (keep E2E on `workflow_dispatch` + weekly schedule in existing `e2e.yml`), `pull_request_target` trigger security issue (use `pull_request` for fork PRs).

**Research flag:** No deeper research needed. Three-job parallel CI with Bun is a standard pattern.

---

### Phase 6: Contributor Documentation

**Rationale:** Must be written last. CONTRIBUTING.md references Biome commands (Phase 1), output format flags (Phases 2-3), env var syntax (Phase 4), and the CI workflow (Phase 5). Writing it before those features exist guarantees docs will be stale on day one.

**Delivers:** `CONTRIBUTING.md` (dev setup, linting, testing, PR process, all with `bun`/`bunx` commands — never npm/npx), `SECURITY.md` (real security contact, 48h acknowledgment commitment), `.github/ISSUE_TEMPLATE/bug_report.yml`, `.github/ISSUE_TEMPLATE/feature_request.yml`, `.github/PULL_REQUEST_TEMPLATE.md`.

**Addresses:** Contributor docs table-stakes.

**Avoids:** CONTRIBUTING.md using npm/npx instead of bun/bunx, SECURITY.md without a real contact.

**Research flag:** No deeper research needed. GitHub community health file conventions are fully documented.

---

### Phase Ordering Rationale

- **Biome first:** formatting baseline before any feature code prevents style noise in PRs and merge conflicts on active branches.
- **JSON before JUnit:** simpler format validates the `--output` flag and batch-formatter architecture; JUnit reuses both without re-designing them.
- **Env var interpolation fourth:** independent of output formats; benefits from lint enforcement; needs more careful implementation than output formats (ordering constraint, secret leakage).
- **PR workflow fifth:** requires Biome (lint job), stable job names before branch protection, and real features to gate.
- **Docs last:** documents the final state, not an intermediate state; references all tooling and workflows built in phases 1-5.

### Research Flags

No phases in this milestone require `/gsd:research-phase` during planning. All implementation patterns are fully documented and integration points are precisely identified in the existing source. This is an execution milestone, not a discovery milestone.

Standard patterns confirmed for all phases:
- **Phase 1 (Biome):** Official Biome v2 docs are comprehensive; one-time calibration run may be needed to identify rules conflicting with existing patterns (e.g., `noNonNullAssertion` in AI SDK wrappers).
- **Phase 2 (JSON output):** Hand-crafted JSON serialization of existing types; Jest/Vitest precedent well-established.
- **Phase 3 (JUnit XML):** testmoapp/junitxml spec is authoritative; `classname` and `time` format requirements explicitly documented.
- **Phase 4 (Env var interpolation):** Docker Compose is the reference implementation; regex pattern is trivial.
- **Phase 5 (GitHub Actions):** Three-job parallel CI with Bun is fully documented.
- **Phase 6 (Docs):** Documentation-only; no implementation research needed.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified against npm registry and official docs. Biome v2.4.6 confirmed via changelog. oven-sh/setup-bun@v2 and mikepenz/action-junit-report@v6 verified on GitHub Marketplace. JUnit XML format verified against testmoapp/junitxml spec. All alternative libraries evaluated with specific reasons for rejection. |
| Features | HIGH | Conventions verified against Jest, Vitest, Playwright, Docker Compose, and GitHub docs. `--output json` and `--output junit` patterns are industry-standard. Biome v2 is well-documented. Env var interpolation syntax matched to Docker Compose reference. Anti-features documented with clear rationale. |
| Architecture | HIGH | Based on direct codebase analysis (all key files read). Integration points identified at file and function level. All architectural decisions are additive; no core subsystem changes required. Reporter interface confirmed as correct abstraction for output format dispatch. |
| Pitfalls | HIGH | All pitfalls sourced from real GitHub issues (npm CLI stdout corruption in npm/cli#2150, JUnit classname requirement in eslint/eslint#11068) and Biome migration guides. Commander.js stdout behavior verified against Commander source. Env var secret leakage documented against real-world CI patterns. |

**Overall confidence:** HIGH

### Gaps to Address

**Post-parse vs pre-parse env var interpolation (design decision, not a research gap):** STACK.md recommends pre-parse (regex on raw YAML string, simpler); ARCHITECTURE.md recommends post-parse (walk parsed JS object, safer). PITFALLS.md settles this: pre-parse interpolation breaks when env var values contain YAML-special characters (`#`, `:`, `[`, `{`). **Decision: post-parse is correct.** Parse YAML first, then walk the object. This matches ARCHITECTURE.md's recommendation.

**Biome rule conflicts with existing code:** MEDIUM confidence area. The existing 3,787 LOC codebase was written without a linter. Running `biome check .` before writing `biome.json` will identify how many violations exist and which rules need `"warn"` overrides (particularly `noNonNullAssertion` in AI agent code and `.ts` extension imports required by Bun). This is a one-time calibration step in Phase 1, not a blocking uncertainty.

**Secret leakage in cache metadata:** PITFALLS.md flags that storing resolved env var values in cache file metadata exposes secrets. The mitigation (store template form in metadata, resolved form only in hash) requires coordination between `src/config/interpolate.ts` and `CacheManager`. This interaction should be explicitly designed during Phase 4, not left to the implementation phase to discover.

---

## Sources

### Primary (HIGH confidence)
- [testmoapp/junitxml](https://github.com/testmoapp/junitxml) — JUnit XML format spec, element/attribute reference, classname requirement
- [Biome v2 official documentation](https://biomejs.dev/) — v2 features, `biome ci` command, TypeScript inference, changelog confirming v2.4.6
- [Docker Compose interpolation reference](https://docs.docker.com/reference/compose-file/interpolation/) — `${VAR}`, `${VAR:-default}`, `${VAR:?error}`, `$$` escape syntax
- [oven-sh/setup-bun GitHub Action](https://github.com/oven-sh/setup-bun) — v2, verified on GitHub Marketplace
- [mikepenz/action-junit-report](https://github.com/mikepenz/action-junit-report) — v6, JUnit XML to PR annotations
- SuperGhost codebase direct analysis — `src/cli.ts`, `src/output/reporter.ts`, `src/output/types.ts`, `src/runner/types.ts`, `src/config/loader.ts`, `src/config/schema.ts`

### Secondary (MEDIUM confidence)
- [Vitest reporters documentation](https://vitest.dev/guide/reporters) — JSON reporter conventions, stdout output pattern
- [Jest CLI options](https://jestjs.io/docs/cli) — `--json` flag behavior, stderr for human output
- [GitHub Docs: Required status checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks) — PR gate configuration, check name matching
- [GitHub Docs: Community health files](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file) — SECURITY.md, CONTRIBUTING.md placement
- [GitHub community: stuck "Expected" status checks](https://github.com/orgs/community/discussions/26698) — check name mismatch issue documentation

### Tertiary (LOW confidence)
- [npm/cli issue #2150](https://github.com/npm/cli/issues/2150) — stdout pollution with `--json` flag, real-world evidence for Pitfall 1 (issue is from npm CLI, not SuperGhost, but the Commander.js mechanism is the same)
- [eslint/eslint issue #11068](https://github.com/eslint/eslint/issues/11068) — JUnit classname requirement evidence; issue is from 2019 but the JUnit format constraint is stable
- [Tips on adding JSON output to CLI apps](https://blog.kellybrazil.com/2021/12/03/tips-on-adding-json-output-to-your-cli-app/) — CLI JSON output best practices; content is sound but single-author blog

---
*Research completed: 2026-03-12*
*Ready for roadmap: yes*
