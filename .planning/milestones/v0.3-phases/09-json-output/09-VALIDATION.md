---
phase: 9
slug: json-output
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in) |
| **Config file** | none (bun:test works out of the box) |
| **Quick run command** | `bun test tests/unit/output/json-formatter.test.ts` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/unit/output/json-formatter.test.ts && bun test tests/integration/cli-pipeline.test.ts`
- **After every plan wave:** Run `bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | OUT-01 | unit | `bun test tests/unit/output/json-formatter.test.ts` | No -- Wave 0 | ⬜ pending |
| 09-01-02 | 01 | 1 | OUT-01 | integration | `bun test tests/integration/cli-pipeline.test.ts -t "output json"` | No -- Wave 0 | ⬜ pending |
| 09-01-03 | 01 | 1 | OUT-01 | integration | `bun test tests/integration/cli-pipeline.test.ts -t "dry-run.*json"` | No -- Wave 0 | ⬜ pending |
| 09-01-04 | 01 | 1 | OUT-03 | integration | `bun test tests/integration/cli-pipeline.test.ts -t "stderr.*json"` | No -- Wave 0 | ⬜ pending |
| 09-01-05 | 01 | 1 | OUT-04 | integration | `bun test tests/integration/cli-pipeline.test.ts -t "help.*stderr"` | No -- Wave 0 | ⬜ pending |
| 09-01-06 | 01 | 1 | OUT-04 | integration | `bun test tests/integration/cli-pipeline.test.ts -t "unknown.*format"` | No -- Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/output/json-formatter.test.ts` — unit tests for formatJsonOutput(), formatJsonDryRun(), formatJsonError()
- [ ] Integration tests added to existing `tests/integration/cli-pipeline.test.ts` — covers OUT-01, OUT-03, OUT-04
- [ ] Update existing help/version tests in `tests/integration/cli-pipeline.test.ts` (lines 58-69, 92-97) to check stderr instead of stdout after configureOutput redirect

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
