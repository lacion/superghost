# Requirements: SuperGhost

**Defined:** 2026-03-11
**Core Value:** Plain English test cases that execute in a real browser, with step caching that makes them fast and deterministic enough for CI/CD — no test code required.

## v0.2 Requirements

Requirements for v0.2 DX Polish + Reliability Hardening. Each maps to roadmap phases.

### CLI Flags

- [x] **FLAG-01**: User can run `--dry-run` to list test names and validate config without executing AI or launching browser
- [ ] **FLAG-02**: User can run `--verbose` to see per-step AI tool call output during test execution
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
- [ ] **OBS-02**: All progress/spinner output routes to stderr (not stdout), with TTY detection gating ANSI output

## Future Requirements

Deferred to later milestones. Tracked but not in current roadmap.

### CI/CD Integration (v0.3)

- **CI-01**: JSON output format (`--output json`)
- **CI-02**: JUnit XML output format (`--output junit`)
- **CI-03**: PR workflow with test gates
- **CI-04**: Linting/formatting enforcement

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
| `--watch` mode | Comparable complexity to entire v0.2 milestone; use `nodemon` interim |
| `--bail` / fail-fast | Cross-cuts runner and cache lifecycle; complex edge cases |
| JSON/JUnit output | Full reporter refactor, not a DX flag; defer to v0.3 |
| Token/cost tracking | Requires per-provider cost tables; defer to v0.5 |
| Per-test baseUrl preflight | Only check global baseUrl at startup; per-test failures surface as test failures |
| Config file env var interpolation | Adds config complexity; defer to v0.3+ |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| ERR-01 | Phase 4 | Complete |
| CACHE-01 | Phase 4 | Complete |
| CACHE-02 | Phase 4 | Complete |
| ERR-02 | Phase 5 | Complete |
| FLAG-04 | Phase 5 | Complete |
| FLAG-03 | Phase 5 | Complete |
| FLAG-01 | Phase 6 | Complete |
| FLAG-02 | Phase 7 | Pending |
| OBS-01 | Phase 7 | Complete |
| OBS-02 | Phase 7 | Pending |

**Coverage:**
- v0.2 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0

---
*Requirements defined: 2026-03-11*
*Last updated: 2026-03-11 after roadmap creation*
