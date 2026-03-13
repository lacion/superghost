---
phase: 17
slug: contributor-docs
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-13
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test (built-in) |
| **Config file** | `bunfig.toml` |
| **Quick run command** | `bun test` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Verify files exist at correct paths
- **After every plan wave:** All six files present at expected paths, YAML is valid
- **Before `/gsd:verify-work`:** Manual verification that templates render in GitHub UI
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-01-01 | 01 | 1 | CONTRIB-01 | manual-only | `test -f CONTRIBUTING.md` | ❌ W0 | ⬜ pending |
| 17-01-02 | 01 | 1 | CONTRIB-02 | manual-only | `test -f SECURITY.md` | ❌ W0 | ⬜ pending |
| 17-01-03 | 01 | 1 | CONTRIB-03 | manual-only | `test -f .github/ISSUE_TEMPLATE/bug_report.yml && test -f .github/ISSUE_TEMPLATE/feature_request.yml` | ❌ W0 | ⬜ pending |
| 17-01-04 | 01 | 1 | CONTRIB-04 | manual-only | `test -f .github/pull_request_template.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. No test infrastructure needed for static documentation files.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| CONTRIBUTING.md has dev setup, lint, test, PR sections with bun commands | CONTRIB-01 | Static markdown — content correctness requires human review | Read file, verify sections present, confirm bun/bunx commands used |
| SECURITY.md has contact email and timeline | CONTRIB-02 | Static markdown — verify email is real and timeline is specified | Read file, verify email and commitment timeline present |
| Issue templates appear in GitHub "New Issue" chooser | CONTRIB-03 | Requires GitHub UI rendering | Push to branch, open New Issue page, verify bug report and feature request forms appear |
| PR template auto-populates new PR description | CONTRIB-04 | Requires GitHub UI rendering | Push to branch, open new PR, verify checklist auto-populates |

---

## Validation Sign-Off

- [x] All tasks have manual verification or Wave 0 dependencies
- [x] Sampling continuity: docs-only phase, all tasks in single wave
- [x] Wave 0 covers all MISSING references (none needed)
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
