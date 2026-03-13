---
phase: 14
slug: junit-xml-output
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built into Bun runtime) |
| **Config file** | None (bun:test uses defaults) |
| **Quick run command** | `bun test tests/unit/output/junit-formatter.test.ts tests/unit/output/xml-utils.test.ts` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/unit/output/junit-formatter.test.ts tests/unit/output/xml-utils.test.ts`
- **After every plan wave:** Run `bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-01-01 | 01 | 1 | OUT-02 | unit | `bun test tests/unit/output/xml-utils.test.ts` | ❌ W0 | ⬜ pending |
| 14-01-02 | 01 | 1 | OUT-02 | unit | `bun test tests/unit/output/junit-formatter.test.ts` | ❌ W0 | ⬜ pending |
| 14-01-03 | 01 | 1 | OUT-05 | unit | `bun test tests/unit/output/junit-formatter.test.ts` | ❌ W0 | ⬜ pending |
| 14-01-04 | 01 | 1 | OUT-02 | unit | `bun test tests/unit/output/junit-formatter.test.ts` | ❌ W0 | ⬜ pending |
| 14-01-05 | 01 | 1 | OUT-02 | unit | `bun test tests/unit/output/junit-formatter.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/output/junit-formatter.test.ts` — stubs for OUT-02, OUT-05 (mirror json-formatter.test.ts structure)
- [ ] `tests/unit/output/xml-utils.test.ts` — stubs for escapeXml and stripAnsi utilities

*Existing infrastructure covers test framework — only test files needed.*

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
