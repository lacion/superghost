# Requirements: SuperGhost

**Defined:** 2026-03-11
**Core Value:** Plain English test cases that execute in a real browser, with step caching that makes them fast and deterministic enough for CI/CD — no test code required.

## v0.2 Requirements (Complete)

### CLI Flags

- [x] **FLAG-01**: User can run `--dry-run` to list test names and validate config without executing AI or launching browser
- [x] **FLAG-02**: User can run `--verbose` to see per-step AI tool call output during test execution
- [x] **FLAG-03**: User can run `--no-cache` to bypass cache reads while still writing cache on successful AI runs
- [x] **FLAG-04**: User can run `--only <pattern>` to filter tests by glob pattern, with exit 2 if zero tests match

### Error Handling

- [x] **ERR-01**: CLI exits 0 for all tests pass, 1 for any test failure, 2 for config/runtime errors (POSIX convention)
- [x] **ERR-02**: CLI performs preflight HTTP reachability check on baseUrl before AI execution, exiting 2 with clear message if unreachable

### Cache

- [x] **CACHE-01**: Cache keys are normalized (whitespace collapse, Unicode NFC, case-preserved) so formatting differences don't bust cache
- [x] **CACHE-02**: Cache keys include version prefix (`v2|...`) for clean break from v1 keys

### Observability

- [x] **OBS-01**: CLI shows real-time step progress during AI execution (tool call names mapped to human descriptions)
- [x] **OBS-02**: All progress/spinner output routes to stderr (not stdout), with TTY detection gating ANSI output

## v0.3 Requirements

Requirements for v0.3 CI/CD + Team Readiness. Each maps to roadmap phases.

### Linting & Formatting

- [x] **LINT-01**: Project uses Biome for linting, formatting, and import sorting with a single `biome.json` config
- [x] **LINT-02**: `bun run lint` checks code style and `bun run lint:fix` auto-fixes violations
- [x] **LINT-03**: All existing code passes Biome checks after initial formatting baseline commit

### Output Formats

- [x] **OUT-01**: User can run `--output json` to get machine-readable JSON results on stdout with `version`, `success`, and full test results
- [ ] **OUT-02**: User can run `--output junit` to get JUnit XML on stdout with `classname` attribute and `time` in seconds
- [x] **OUT-03**: Human-readable progress on stderr runs simultaneously with structured output on stdout (no mode switching)
- [x] **OUT-04**: Commander.js help/version output is redirected to stderr so it never corrupts structured stdout output
- [ ] **OUT-05**: JUnit XML includes `<properties>` per testcase with SuperGhost-specific metadata (source: cache/ai, selfHealed)

### Config

- [ ] **CFG-01**: User can use `${VAR}` syntax in YAML config values to interpolate environment variables
- [ ] **CFG-02**: User can use `${VAR:-default}` syntax to provide fallback values for unset env vars
- [ ] **CFG-03**: User can use `${VAR:?error message}` syntax to require env vars with descriptive error on missing
- [ ] **CFG-04**: Env var interpolation runs post-YAML-parse (on JS object) so YAML-special characters in values don't break parsing

### CI/CD

- [ ] **CI-01**: GitHub Actions `ci.yml` runs lint, typecheck, and test jobs in parallel on PRs and pushes to main
- [ ] **CI-02**: A single `gate` job aggregates all CI checks for branch protection (avoids check name fragility)
- [ ] **CI-03**: CI uses `bun install --frozen-lockfile` for reproducible installs

### Contributor Readiness

- [ ] **CONTRIB-01**: CONTRIBUTING.md documents dev setup, linting, testing, and PR process using bun/bunx commands
- [ ] **CONTRIB-02**: SECURITY.md provides a real security contact and acknowledgment commitment
- [ ] **CONTRIB-03**: GitHub issue templates (bug report, feature request) use YAML form format
- [ ] **CONTRIB-04**: PR template includes checklist for tests, lint, and description

## Future Requirements

Deferred to later milestones. Tracked but not in current roadmap.

### Advanced Execution (v0.4)

- **EXEC-01**: Parallel test execution
- **EXEC-02**: Config composition (extends/inherits)
- **EXEC-03**: `--bail` / fail-fast mode
- **EXEC-04**: `--watch` mode

### Reporting (v0.5)

- **RPT-01**: Run history tracking
- **RPT-02**: Flakiness detection
- **RPT-03**: Cost/token tracking per test run
- **RPT-04**: HTML report generation

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| `--output-file <path>` flag | Shell redirection (`> results.xml`) handles this; add only if users request |
| TAP output format | Poor CI adoption; JSON + JUnit cover all real-world needs |
| Multiple simultaneous output formats | Complexity with near-zero demand; cached replay makes second run instant |
| HTML report output | Allure and similar tools consume JUnit XML to generate HTML |
| ESLint + Prettier | Biome replaces 5+ packages with one; no reason to use ESLint |
| E2E tests in PR gate | Requires API keys, too slow, non-deterministic; keep on workflow_dispatch |
| `--watch` mode | Comparable complexity to entire milestone; use `nodemon` interim |
| Token/cost tracking | Requires per-provider cost tables; defer to v0.5 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| FLAG-01 | Phase 6 (v0.2) | Complete |
| FLAG-02 | Phase 7 (v0.2) | Complete |
| FLAG-03 | Phase 5 (v0.2) | Complete |
| FLAG-04 | Phase 5 (v0.2) | Complete |
| ERR-01 | Phase 4 (v0.2) | Complete |
| ERR-02 | Phase 5 (v0.2) | Complete |
| CACHE-01 | Phase 4 (v0.2) | Complete |
| CACHE-02 | Phase 4 (v0.2) | Complete |
| OBS-01 | Phase 7 (v0.2) | Complete |
| OBS-02 | Phase 7 (v0.2) | Complete |
| LINT-01 | Phase 8 (v0.3) | Complete |
| LINT-02 | Phase 8 (v0.3) | Complete |
| LINT-03 | Phase 8 (v0.3) | Complete |
| OUT-01 | Phase 9 (v0.3) | Complete |
| OUT-03 | Phase 9 (v0.3) | Complete |
| OUT-04 | Phase 9 (v0.3) | Complete |
| OUT-02 | Phase 10 (v0.3) | Pending |
| OUT-05 | Phase 10 (v0.3) | Pending |
| CFG-01 | Phase 11 (v0.3) | Pending |
| CFG-02 | Phase 11 (v0.3) | Pending |
| CFG-03 | Phase 11 (v0.3) | Pending |
| CFG-04 | Phase 11 (v0.3) | Pending |
| CI-01 | Phase 12 (v0.3) | Pending |
| CI-02 | Phase 12 (v0.3) | Pending |
| CI-03 | Phase 12 (v0.3) | Pending |
| CONTRIB-01 | Phase 13 (v0.3) | Pending |
| CONTRIB-02 | Phase 13 (v0.3) | Pending |
| CONTRIB-03 | Phase 13 (v0.3) | Pending |
| CONTRIB-04 | Phase 13 (v0.3) | Pending |

**Coverage:**
- v0.2 requirements: 10 total, 10 complete
- v0.3 requirements: 19 total, 19 mapped to phases, 0 orphaned
- Unmapped: 0

---
*Requirements defined: 2026-03-11*
*Last updated: 2026-03-12 after v0.3 roadmap creation*
