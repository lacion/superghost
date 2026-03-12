# Roadmap: SuperGhost

## Milestones

- ✅ **v1.0 MVP** — Phases 1-3 (shipped 2026-03-11)
- ✅ **v0.2 DX Polish + Reliability Hardening** — Phases 4-7 (shipped 2026-03-12)
- 🚧 **v0.3 CI/CD + Team Readiness** — Phases 8-13 (in progress)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-3) — SHIPPED 2026-03-11</summary>

- [x] Phase 1: Foundation (3/3 plans) — completed 2026-03-11
- [x] Phase 2: Core Engine (4/4 plans) — completed 2026-03-11
- [x] Phase 3: Distribution (2/2 plans) — completed 2026-03-11

</details>

<details>
<summary>v0.2 DX Polish + Reliability Hardening (Phases 4-7) — SHIPPED 2026-03-12</summary>

- [x] Phase 4: Foundation (2/2 plans) — completed 2026-03-12
- [x] Phase 5: Infrastructure + Flags (2/2 plans) — completed 2026-03-12
- [x] Phase 6: Dry-Run (1/1 plans) — completed 2026-03-12
- [x] Phase 7: Observability (2/2 plans) — completed 2026-03-12

</details>

### 🚧 v0.3 CI/CD + Team Readiness

**Milestone Goal:** Make SuperGhost production-ready for teams — structured CI output, enforced code quality, contributor onboarding, and flexible config.

- [ ] **Phase 8: Biome Setup** — Linting, formatting, and import sorting baseline for the entire codebase
- [ ] **Phase 9: JSON Output** — Machine-readable JSON results via `--output json` for programmatic consumption
- [ ] **Phase 10: JUnit XML Output** — CI-standard JUnit XML results via `--output junit` for test reporting
- [ ] **Phase 11: Env Var Interpolation** — `${VAR}` syntax in YAML configs for CI-safe secret injection
- [ ] **Phase 12: GitHub Actions PR Workflow** — Lint, typecheck, and test gates on every PR
- [ ] **Phase 13: Contributor Docs** — CONTRIBUTING.md, SECURITY.md, issue/PR templates for team onboarding

## Phase Details

### Phase 8: Biome Setup
**Goal**: All project code enforces consistent style through a single linting and formatting tool, establishing the quality baseline before any v0.3 feature code
**Depends on**: Phase 7 (v0.2 complete)
**Requirements**: LINT-01, LINT-02, LINT-03
**Success Criteria** (what must be TRUE):
  1. Running `bun run lint` checks the entire codebase for style violations and reports any issues without modifying files
  2. Running `bun run lint:fix` auto-fixes all fixable violations (formatting, import sorting) in place
  3. The full existing codebase (all `.ts` files) passes `bun run lint` with zero violations after a one-time formatting commit
  4. A single `biome.json` at the project root configures all linting, formatting, and import sorting rules
**Plans**: TBD

Plans:
- [ ] 08-01: Biome installation, config, npm scripts, and codebase formatting baseline

### Phase 9: JSON Output
**Goal**: Users can pipe SuperGhost results to `jq`, scripts, or CI tools via a machine-readable JSON format on stdout while still seeing human-readable progress on stderr
**Depends on**: Phase 8 (code must be lint-clean before adding feature code)
**Requirements**: OUT-01, OUT-03, OUT-04
**Success Criteria** (what must be TRUE):
  1. Running `superghost --output json --config tests.yaml` produces a single valid JSON object on stdout containing `version`, `success`, and full test results
  2. Human-readable progress output (spinners, step descriptions) continues on stderr simultaneously when `--output json` is active
  3. Commander.js help (`--help`) and version (`--version`) output is written to stderr, never stdout, so piping `--output json` through `JSON.parse()` never fails due to non-JSON preamble
**Plans**: TBD

Plans:
- [ ] 09-01: --output flag infrastructure, JSON formatter, Commander stdout redirect, integration tests

### Phase 10: JUnit XML Output
**Goal**: CI systems (GitHub Actions, Jenkins, GitLab) can consume SuperGhost results as JUnit XML for native test reporting and PR annotations
**Depends on**: Phase 9 (reuses --output flag infrastructure and batch-formatter architecture)
**Requirements**: OUT-02, OUT-05
**Success Criteria** (what must be TRUE):
  1. Running `superghost --output junit --config tests.yaml` produces valid JUnit XML on stdout with `<testsuite>` and `<testcase>` elements including `classname` attribute and `time` in seconds
  2. Each `<testcase>` element includes `<properties>` with SuperGhost-specific metadata: `source` (cache or ai) and `selfHealed` (true/false)
  3. Test names containing XML-special characters (`<`, `>`, `&`, `"`, `'`) are properly escaped in the output
**Plans**: TBD

Plans:
- [ ] 10-01: JUnit XML formatter with escapeXml, classname, properties metadata, integration tests

### Phase 11: Env Var Interpolation
**Goal**: Users can inject environment variables into YAML configs so CI pipelines pass secrets and environment-specific values without hardcoding
**Depends on**: Phase 8 (lint enforcement; independent of output format phases)
**Requirements**: CFG-01, CFG-02, CFG-03, CFG-04
**Success Criteria** (what must be TRUE):
  1. A YAML config containing `baseUrl: ${BASE_URL}` resolves to the value of the `BASE_URL` environment variable at runtime
  2. A YAML config containing `baseUrl: ${BASE_URL:-http://localhost:3000}` uses the fallback value when `BASE_URL` is not set
  3. A YAML config containing `apiKey: ${API_KEY:?API_KEY must be set}` exits with code 2 and the descriptive error message when `API_KEY` is not set
  4. Env var values containing YAML-special characters (`:`, `#`, `{`, `[`) do not break config parsing because interpolation runs on the parsed JS object, not the raw YAML string
**Plans**: TBD

Plans:
- [ ] 11-01: Post-parse interpolation engine with ${VAR}, ${VAR:-default}, ${VAR:?error} syntax and unit tests

### Phase 12: GitHub Actions PR Workflow
**Goal**: Every pull request and push to main is automatically checked for lint violations, type errors, and test failures before merge
**Depends on**: Phase 8 (lint job requires Biome to exist)
**Requirements**: CI-01, CI-02, CI-03
**Success Criteria** (what must be TRUE):
  1. Opening a PR or pushing to main triggers a GitHub Actions workflow that runs lint, typecheck, and test jobs in parallel
  2. A single `gate` job aggregates all three check jobs, so branch protection requires only one status check name (not fragile per-job names)
  3. CI installs dependencies with `bun install --frozen-lockfile` so builds are reproducible and fail on lockfile drift
**Plans**: TBD

Plans:
- [ ] 12-01: ci.yml workflow with parallel lint/typecheck/test jobs and gate aggregation

### Phase 13: Contributor Docs
**Goal**: A new contributor can find setup instructions, understand the PR process, report bugs, and know how to disclose security issues without asking anyone
**Depends on**: Phases 8-12 (documents the final tooling and workflow state)
**Requirements**: CONTRIB-01, CONTRIB-02, CONTRIB-03, CONTRIB-04
**Success Criteria** (what must be TRUE):
  1. CONTRIBUTING.md documents dev setup, linting commands, testing commands, and the PR process using `bun`/`bunx` commands (never npm/npx)
  2. SECURITY.md provides a real security contact email and an acknowledgment commitment timeline
  3. GitHub issue templates for bug reports and feature requests use YAML form format and appear in the "New Issue" chooser
  4. A PR template with a checklist for tests, lint, and description auto-populates when opening a new pull request
**Plans**: TBD

Plans:
- [ ] 13-01: CONTRIBUTING.md, SECURITY.md, issue templates, and PR template

## Progress

**Execution Order:** Phases 8 -> 9 -> 10 -> 11 -> 12 -> 13

Note: Phase 11 depends only on Phase 8 (not 9 or 10), but is sequenced after output format phases per research recommendations.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 3/3 | Complete | 2026-03-11 |
| 2. Core Engine | v1.0 | 4/4 | Complete | 2026-03-11 |
| 3. Distribution | v1.0 | 2/2 | Complete | 2026-03-11 |
| 4. Foundation | v0.2 | 2/2 | Complete | 2026-03-12 |
| 5. Infrastructure + Flags | v0.2 | 2/2 | Complete | 2026-03-12 |
| 6. Dry-Run | v0.2 | 1/1 | Complete | 2026-03-12 |
| 7. Observability | v0.2 | 2/2 | Complete | 2026-03-12 |
| 8. Biome Setup | v0.3 | 0/1 | Not started | - |
| 9. JSON Output | v0.3 | 0/1 | Not started | - |
| 10. JUnit XML Output | v0.3 | 0/1 | Not started | - |
| 11. Env Var Interpolation | v0.3 | 0/1 | Not started | - |
| 12. GitHub Actions PR Workflow | v0.3 | 0/1 | Not started | - |
| 13. Contributor Docs | v0.3 | 0/1 | Not started | - |
