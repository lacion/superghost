# Roadmap: SuperGhost

## Milestones

- ✅ **v1.0 MVP** — Phases 1-3 (shipped 2026-03-11)
- 🚧 **v0.2 DX Polish + Reliability Hardening** — Phases 4-7 (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-3) — SHIPPED 2026-03-11</summary>

- [x] Phase 1: Foundation (3/3 plans) — completed 2026-03-11
- [x] Phase 2: Core Engine (4/4 plans) — completed 2026-03-11
- [x] Phase 3: Distribution (2/2 plans) — completed 2026-03-11

</details>

### 🚧 v0.2 DX Polish + Reliability Hardening

**Milestone Goal:** Make SuperGhost debuggable, observable, and resilient so users can iterate efficiently and CI pipelines get actionable signals.

- [ ] **Phase 4: Foundation** — Distinct exit codes and cache key normalization
- [ ] **Phase 5: Infrastructure + Flags** — Preflight reachability, --only filter, --no-cache bypass
- [ ] **Phase 6: Dry-Run** — Config-validating test preview without AI execution
- [ ] **Phase 7: Observability** — Verbose mode and real-time step progress

## Phase Details

### Phase 4: Foundation
**Goal**: CI pipelines get actionable exit code signals and cache hits are resilient across platforms and formatting differences
**Depends on**: Phase 3 (v1.0 shipped)
**Requirements**: ERR-01, CACHE-01, CACHE-02
**Success Criteria** (what must be TRUE):
  1. CLI exits 0 when all tests pass, 1 when any test fails, and 2 when config is invalid or a runtime error occurs before test execution
  2. Two test cases differing only in whitespace or Unicode normalization form (NFD vs NFC) produce the same cache key and share cached results
  3. Existing v1 cache entries are cleanly bypassed (not erroneously matched) due to the v2 version prefix in new cache keys
**Plans**: TBD

Plans:
- [ ] 04-01: TBD
- [ ] 04-02: TBD

### Phase 5: Infrastructure + Flags
**Goal**: Users can filter tests, bypass cache, and get fast failure on unreachable servers before wasting time on AI execution
**Depends on**: Phase 4 (exit code taxonomy must be locked before features emit exit 2)
**Requirements**: ERR-02, FLAG-04, FLAG-03
**Success Criteria** (what must be TRUE):
  1. Running `superghost --only "login*"` executes only tests whose names match the glob pattern and skips the rest
  2. Running `--only` with a pattern matching zero tests exits 2 with a message listing available test names
  3. Running `superghost --no-cache` forces fresh AI execution for every test while still writing cache entries on success
  4. CLI exits 2 with a clear "baseUrl unreachable" message if the configured baseUrl cannot be reached via HTTP before any AI execution begins
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

### Phase 6: Dry-Run
**Goal**: Users can safely preview their test plan and validate config without launching a browser or spending AI tokens
**Depends on**: Phase 5 (preflight and filter flags established; dry-run must not run preflight)
**Requirements**: FLAG-01
**Success Criteria** (what must be TRUE):
  1. Running `superghost --dry-run` lists all test names with their source (cache/AI) without executing any tests or launching a browser
  2. Dry-run still validates config (YAML parsing, Zod schema, API key presence) and exits 2 on config errors, so it never lies about whether a real run would succeed
**Plans**: TBD

Plans:
- [ ] 06-01: TBD

### Phase 7: Observability
**Goal**: Users get real-time feedback during AI execution and all progress output is CI-safe
**Depends on**: Phase 6 (Reporter dry-run changes must be in place before verbose mode modifies Reporter)
**Requirements**: FLAG-02, OBS-01, OBS-02
**Success Criteria** (what must be TRUE):
  1. Running `superghost --verbose` prints per-step tool call descriptions (e.g., "Step 3: Navigating to page", "Step 4: Clicking button") to stderr during AI execution
  2. Without --verbose, the CLI shows real-time step progress updates on the spinner (tool call names mapped to human descriptions) during AI execution
  3. All progress and spinner output routes to stderr (never stdout), and ANSI codes are suppressed in non-TTY environments (pipes, CI)
**Plans**: TBD

Plans:
- [ ] 07-01: TBD
- [ ] 07-02: TBD

## Progress

**Execution Order:** Phases 4 → 5 → 6 → 7

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation | v1.0 | 3/3 | Complete | 2026-03-11 |
| 2. Core Engine | v1.0 | 4/4 | Complete | 2026-03-11 |
| 3. Distribution | v1.0 | 2/2 | Complete | 2026-03-11 |
| 4. Foundation | v0.2 | 0/? | Not started | - |
| 5. Infrastructure + Flags | v0.2 | 0/? | Not started | - |
| 6. Dry-Run | v0.2 | 0/? | Not started | - |
| 7. Observability | v0.2 | 0/? | Not started | - |
