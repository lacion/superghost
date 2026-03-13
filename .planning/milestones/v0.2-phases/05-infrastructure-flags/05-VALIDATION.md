---
phase: 5
slug: infrastructure-flags
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in) |
| **Config file** | bunfig.toml (`[test] root = "."`) |
| **Quick run command** | `bun test tests/unit/` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/unit/`
- **After every plan wave:** Run `bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | FLAG-04 | unit | `bun test tests/unit/infra/filter.test.ts` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | FLAG-04 | unit + integration | `bun test tests/unit/runner/test-runner.test.ts -t "only"` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | FLAG-04 | integration | `bun test tests/integration/cli-pipeline.test.ts -t "only"` | ❌ W0 | ⬜ pending |
| 05-02-01 | 02 | 1 | FLAG-03 | unit | `bun test tests/unit/runner/test-executor.test.ts -t "noCache"` | ❌ W0 | ⬜ pending |
| 05-02-02 | 02 | 1 | FLAG-03 | integration | `bun test tests/integration/cli-pipeline.test.ts -t "no-cache"` | ❌ W0 | ⬜ pending |
| 05-03-01 | 03 | 1 | ERR-02 | unit | `bun test tests/unit/infra/preflight.test.ts` | ❌ W0 | ⬜ pending |
| 05-03-02 | 03 | 1 | ERR-02 | integration | `bun test tests/integration/cli-pipeline.test.ts -t "unreachable"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/infra/preflight.test.ts` — stubs for ERR-02 preflight logic
- [ ] `tests/unit/infra/filter.test.ts` — stubs for FLAG-04 glob matching logic
- [ ] New test cases in `tests/unit/runner/test-executor.test.ts` — stubs for FLAG-03 noCache behavior
- [ ] New test cases in `tests/unit/runner/test-runner.test.ts` — stubs for FLAG-04 skipped count in RunResult
- [ ] New test cases in `tests/unit/output/reporter.test.ts` — stubs for skipped display in summary
- [ ] New test cases in `tests/integration/cli-pipeline.test.ts` — stubs for all three features end-to-end
- [ ] `bun add picomatch @types/picomatch` — dependency for FLAG-04

*Existing infrastructure covers test framework (bun:test built-in).*

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
