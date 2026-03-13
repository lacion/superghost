# Roadmap: SuperGhost

## Milestones

- ✅ **v1.0 MVP** — Phases 1-3 (shipped 2026-03-11)
- ✅ **v0.2 DX Polish + Reliability Hardening** — Phases 4-7 (shipped 2026-03-12)
- ✅ **v0.3 CI/CD + Team Readiness** — Phases 8-9 (shipped 2026-03-12)
- 🚧 **v0.4 CI/CD + Team Readiness (Part 2)** — Phases 14-17 (in progress)

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

<details>
<summary>v0.3 CI/CD + Team Readiness (Phases 8-9) — SHIPPED 2026-03-12</summary>

- [x] Phase 8: Biome Setup (1/1 plans) — completed 2026-03-12
- [x] Phase 9: JSON Output (1/1 plans) — completed 2026-03-12

</details>

### v0.4 CI/CD + Team Readiness (Part 2)

**Milestone Goal:** Complete team-readiness features — JUnit XML for CI reporting, env var interpolation for CI-safe configs, PR workflow gates, and contributor onboarding docs.

- [x] **Phase 14: JUnit XML Output** — CI-standard JUnit XML results via `--output junit` for test reporting dashboards (completed 2026-03-12)
- [x] **Phase 15: Env Var Interpolation** — `${VAR}` syntax in YAML configs for CI-safe secret injection (completed 2026-03-13)
- [ ] **Phase 16: GitHub Actions PR Workflow** — Lint, typecheck, and test gates on every PR
- [ ] **Phase 17: Contributor Docs** — CONTRIBUTING.md, SECURITY.md, issue/PR templates for team onboarding

## Phase Details

### Phase 14: JUnit XML Output
**Goal**: CI systems (GitHub Actions, Jenkins, GitLab) can consume SuperGhost results as JUnit XML for native test reporting and PR annotations
**Depends on**: Phase 9 (reuses --output flag infrastructure and batch-formatter architecture from json-formatter.ts)
**Requirements**: OUT-02, OUT-05
**Success Criteria** (what must be TRUE):
  1. Running `superghost --output junit --config tests.yaml` produces valid JUnit XML on stdout with `<testsuite>` and `<testcase>` elements including `classname` attribute and `time` in seconds (not milliseconds)
  2. Each `<testcase>` element includes a `<properties>` block with SuperGhost-specific metadata: `source` (cache or ai) and `selfHealed` (true/false)
  3. Test names and failure messages containing XML-special characters or ANSI escape sequences are properly escaped/stripped so the XML is always parseable
  4. Running `superghost --output junit --dry-run` and error paths produce valid JUnit XML (not plain text), consistent with the JSON output precedent
**Plans**: 1 plan

Plans:
- [ ] 14-01: JUnit XML formatter with escapeXml, ANSI stripping, classname, properties metadata, and unit tests

### Phase 15: Env Var Interpolation
**Goal**: Users can inject environment variables into YAML configs so CI pipelines pass secrets and environment-specific values without hardcoding
**Depends on**: Phase 9 (lint enforcement established; independent of output format phases)
**Requirements**: CFG-01, CFG-02, CFG-03, CFG-04
**Success Criteria** (what must be TRUE):
  1. A YAML config containing `baseUrl: ${BASE_URL}` resolves to the value of the `BASE_URL` environment variable at runtime
  2. A YAML config containing `baseUrl: ${BASE_URL:-http://localhost:3000}` uses the fallback value when `BASE_URL` is not set
  3. A YAML config containing `apiKey: ${API_KEY:?API_KEY must be set}` exits with code 2 and the descriptive error message when `API_KEY` is not set
  4. Env var values containing YAML-special characters (`:`, `#`, `{`, `[`) do not break config parsing because interpolation runs on the parsed JS object, not the raw YAML string
  5. Resolved env var values do not leak into `.superghost-cache/` metadata — only the template form (`${VAR}`) persists in cache files
**Plans**: 2 plans

Plans:
- [ ] 15-01-PLAN.md — TDD: Core interpolation engine (interpolateConfig with ${VAR}, ${VAR:-default}, ${VAR:?error}, deep walk, template map)
- [ ] 15-02-PLAN.md — Integration: Wire into loadConfig, CacheManager template awareness, CLI/TestExecutor threading

### Phase 16: GitHub Actions PR Workflow
**Goal**: Every pull request and push to main is automatically checked for lint violations, type errors, and test failures before merge
**Depends on**: Phase 14, Phase 15 (CI workflow validates all v0.4 code features)
**Requirements**: CI-01, CI-02, CI-03
**Success Criteria** (what must be TRUE):
  1. Opening a PR or pushing to main triggers a GitHub Actions workflow that runs lint, typecheck, and test jobs in parallel
  2. A single `gate` job aggregates all three check jobs, so branch protection requires only one status check name (not fragile per-job names)
  3. CI installs dependencies with `bun install --frozen-lockfile` so builds are reproducible and fail on lockfile drift
**Plans**: 1 plan

Plans:
- [ ] 16-01-PLAN.md — CI workflow with parallel lint/typecheck/test jobs, gate aggregation, and workflow alignment

### Phase 17: Contributor Docs
**Goal**: A new contributor can find setup instructions, understand the PR process, report bugs, and know how to disclose security issues without asking anyone
**Depends on**: Phases 14-16 (documents the final tooling and workflow state — must be last)
**Requirements**: CONTRIB-01, CONTRIB-02, CONTRIB-03, CONTRIB-04
**Success Criteria** (what must be TRUE):
  1. CONTRIBUTING.md documents dev setup, linting commands, testing commands, and the PR process using `bun`/`bunx` commands (never npm/npx)
  2. SECURITY.md provides a real security contact email and an acknowledgment commitment timeline
  3. GitHub issue templates for bug reports and feature requests use YAML form format and appear in the "New Issue" chooser
  4. A PR template with a checklist for tests, lint, and description auto-populates when opening a new pull request
**Plans**: TBD

Plans:
- [ ] 17-01: CONTRIBUTING.md, SECURITY.md, issue templates, and PR template

## Progress

**Execution Order:** Phases 14 -> 15 -> 16 -> 17

Note: Phases 14 and 15 are technically independent but sequenced for implementation focus. Phase 16 benefits from both being complete so CI validates real functionality. Phase 17 is non-negotiably last.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 3/3 | Complete | 2026-03-11 |
| 2. Core Engine | v1.0 | 4/4 | Complete | 2026-03-11 |
| 3. Distribution | v1.0 | 2/2 | Complete | 2026-03-11 |
| 4. Foundation | v0.2 | 2/2 | Complete | 2026-03-12 |
| 5. Infrastructure + Flags | v0.2 | 2/2 | Complete | 2026-03-12 |
| 6. Dry-Run | v0.2 | 1/1 | Complete | 2026-03-12 |
| 7. Observability | v0.2 | 2/2 | Complete | 2026-03-12 |
| 8. Biome Setup | v0.3 | 1/1 | Complete | 2026-03-12 |
| 9. JSON Output | v0.3 | 1/1 | Complete | 2026-03-12 |
| 14. JUnit XML Output | 1/1 | Complete    | 2026-03-12 | - |
| 15. Env Var Interpolation | 2/2 | Complete    | 2026-03-13 | - |
| 16. GitHub Actions PR Workflow | v0.4 | 0/1 | Not started | - |
| 17. Contributor Docs | v0.4 | 0/1 | Not started | - |
