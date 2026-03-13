---
phase: 7
slug: observability
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built into Bun runtime) |
| **Config file** | None (Bun auto-discovers `tests/**/*.test.ts`) |
| **Quick run command** | `bun test tests/unit/output/` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/unit/output/ tests/unit/agent/agent-runner.test.ts`
- **After every plan wave:** Run `bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | FLAG-02 | unit | `bun test tests/unit/output/reporter.test.ts` | ✅ | ⬜ pending |
| 07-01-02 | 01 | 1 | FLAG-02 | unit | `bun test tests/unit/output/reporter.test.ts` | ✅ | ⬜ pending |
| 07-01-03 | 01 | 1 | OBS-01 | unit | `bun test tests/unit/output/tool-name-map.test.ts` | ❌ W0 | ⬜ pending |
| 07-01-04 | 01 | 1 | OBS-01 | unit | `bun test tests/unit/agent/agent-runner.test.ts` | ✅ | ⬜ pending |
| 07-01-05 | 01 | 1 | OBS-01 | unit | `bun test tests/unit/output/reporter.test.ts` | ✅ | ⬜ pending |
| 07-02-01 | 02 | 1 | OBS-02 | unit | `bun test tests/unit/output/reporter.test.ts` | ✅ | ⬜ pending |
| 07-02-02 | 02 | 1 | OBS-02 | integration | `bun test tests/integration/cli-pipeline.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/output/tool-name-map.test.ts` — stubs for OBS-01 tool name mapping

*Existing files (`reporter.test.ts`, `agent-runner.test.ts`, `cli-pipeline.test.ts`) need new test cases but already exist.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Spinner visual appearance with step descriptions | OBS-01 | Spinner animation is visual/interactive — cannot assert rendered frames in bun:test | Run `superghost --config tests/fixtures/test.yaml` and observe spinner shows tool descriptions during AI execution |
| Non-TTY static line output | OBS-02 | Requires piped environment to test TTY detection | Run `superghost --config tests/fixtures/test.yaml 2>&1 | cat` and verify no ANSI codes in output |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
