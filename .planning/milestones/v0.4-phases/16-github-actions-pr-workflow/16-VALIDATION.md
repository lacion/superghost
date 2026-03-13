---
phase: 16
slug: github-actions-pr-workflow
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test runner (built-in) |
| **Config file** | None (Bun test uses conventions) |
| **Quick run command** | `bun test` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Visual YAML review for correct syntax and structure
- **After every plan wave:** `bun test` to ensure no regressions + YAML lint check
- **Before `/gsd:verify-work`:** Full suite must be green + observe real CI run on PR
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | CI-01 | manual-only | Visual YAML review + push test PR | N/A | ⬜ pending |
| 16-01-02 | 01 | 1 | CI-02 | manual-only | Verify gate job YAML structure | N/A | ⬜ pending |
| 16-01-03 | 01 | 1 | CI-03 | manual-only | Verify `--frozen-lockfile` in YAML | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements.*

This phase produces only YAML workflow files — no test infrastructure needed. Validation is done by YAML review and observing a real PR run.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Lint/typecheck/test run in parallel on PRs/pushes | CI-01 | CI workflow YAML is infrastructure config — testing requires pushing to GitHub | Push branch, open PR, verify 3 parallel jobs in Actions tab |
| Gate job aggregates checks | CI-02 | Gate behavior only observable in GitHub Actions UI | Verify "CI / gate" appears as single required check in PR |
| Frozen lockfile installs | CI-03 | `--frozen-lockfile` is YAML config, not testable code | Verify workflow YAML contains `--frozen-lockfile` in install steps |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
