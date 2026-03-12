---
phase: 6
slug: dry-run
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in) |
| **Config file** | None — Bun discovers `tests/**/*.test.ts` automatically |
| **Quick run command** | `bun test tests/integration/cli-pipeline.test.ts` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/integration/cli-pipeline.test.ts`
- **After every plan wave:** Run `bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | FLAG-01a | integration | `bun test tests/integration/cli-pipeline.test.ts -t "dry-run"` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | FLAG-01b | integration | `bun test tests/integration/cli-pipeline.test.ts -t "dry-run"` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 1 | FLAG-01c | integration | `bun test tests/integration/cli-pipeline.test.ts -t "dry-run"` | ❌ W0 | ⬜ pending |
| 06-01-04 | 01 | 1 | FLAG-01d | integration | `bun test tests/integration/cli-pipeline.test.ts -t "dry-run"` | ❌ W0 | ⬜ pending |
| 06-01-05 | 01 | 1 | FLAG-01e | integration | `bun test tests/integration/cli-pipeline.test.ts -t "dry-run"` | ❌ W0 | ⬜ pending |
| 06-01-06 | 01 | 1 | FLAG-01f | integration | `bun test tests/integration/cli-pipeline.test.ts -t "dry-run"` | ❌ W0 | ⬜ pending |
| 06-01-07 | 01 | 1 | FLAG-01g | integration | `bun test tests/integration/cli-pipeline.test.ts -t "help"` | ❌ W0 | ⬜ pending |
| 06-01-08 | 01 | 1 | FLAG-01h | integration | `bun test tests/integration/cli-pipeline.test.ts -t "dry-run"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] New `describe("dry-run", ...)` block in `tests/integration/cli-pipeline.test.ts` with test stubs for FLAG-01a through FLAG-01h
- [ ] Test fixture with pre-populated cache directory (or programmatic cache entry creation in test setup) for verifying cache/ai source detection

*Existing test infrastructure (bun:test, runCli harness, fixture configs) covers framework needs.*

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
