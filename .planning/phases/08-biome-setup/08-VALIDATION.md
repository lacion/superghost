---
phase: 8
slug: biome-setup
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-12
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test (built-in) |
| **Config file** | None (uses Bun defaults) |
| **Quick run command** | `bun run lint` |
| **Full suite command** | `bun run lint && bun test && bunx tsc --noEmit` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun run lint`
- **After every plan wave:** Run `bun run lint && bun test && bunx tsc --noEmit`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | LINT-01 | smoke | `test -f biome.json && bunx biome check --help` | N/A (infra) | ⬜ pending |
| 08-01-02 | 01 | 1 | LINT-01 | smoke | `bunx biome check . 2>&1 | head -5` | N/A (infra) | ⬜ pending |
| 08-01-03 | 01 | 1 | LINT-02 | smoke | `bun run lint` | N/A (script) | ⬜ pending |
| 08-01-04 | 01 | 1 | LINT-02 | smoke | `bun run lint:fix` | N/A (script) | ⬜ pending |
| 08-01-05 | 01 | 1 | LINT-03 | smoke | `bun run lint` (exit 0) | N/A (codebase) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. This phase is about tool infrastructure, not application code. Validation is through the lint tool itself (`bun run lint` exit code), not through unit tests. The existing test suite (`bun test`) must continue to pass after formatting changes.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `.git-blame-ignore-revs` works in GitHub blame view | LINT-03 | Requires GitHub UI verification | Push to remote, open blame view on any formatted file, confirm formatting commit is hidden |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
