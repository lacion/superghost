---
phase: 4
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Bun test (built-in) |
| **Config file** | `bunfig.toml` (root = ".") |
| **Quick run command** | `bun test tests/unit/cache/cache-manager.test.ts tests/integration/cli-pipeline.test.ts` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test tests/unit/cache/cache-manager.test.ts tests/integration/cli-pipeline.test.ts`
- **After every plan wave:** Run `bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | ERR-01 | integration | `bun test tests/integration/cli-pipeline.test.ts -x` | Exists (needs updates) | ⬜ pending |
| 04-01-02 | 01 | 1 | ERR-01 | integration | `bun test tests/integration/cli-pipeline.test.ts -x` | Exists (needs new case) | ⬜ pending |
| 04-02-01 | 02 | 1 | CACHE-01 | unit | `bun test tests/unit/cache/cache-manager.test.ts -x` | Exists (needs new tests) | ⬜ pending |
| 04-02-02 | 02 | 1 | CACHE-01 | unit | `bun test tests/unit/cache/cache-manager.test.ts -x` | Exists (needs new tests) | ⬜ pending |
| 04-02-03 | 02 | 1 | CACHE-01 | unit | `bun test tests/unit/cache/cache-manager.test.ts -x` | Exists (needs new tests) | ⬜ pending |
| 04-02-04 | 02 | 1 | CACHE-01 | unit | `bun test tests/unit/cache/cache-manager.test.ts -x` | Exists (needs new test) | ⬜ pending |
| 04-02-05 | 02 | 1 | CACHE-02 | unit | `bun test tests/unit/cache/cache-manager.test.ts -x` | Exists (needs new test) | ⬜ pending |
| 04-02-06 | 02 | 1 | CACHE-02 | unit | `bun test tests/unit/cache/cache-manager.test.ts -x` | Needs new tests | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/cache/cache-manager.test.ts` — new describe blocks for normalization tests (whitespace, Unicode NFC, URL normalization, case-preserving, v2 prefix)
- [ ] `tests/unit/cache/cache-manager.test.ts` — new describe block for v1 cache migration/cleanup
- [ ] `tests/integration/cli-pipeline.test.ts` — exit code assertion updates (1 → 2 for config errors) and new test cases for catch-all exit 2

*Existing test infrastructure and fixtures are sufficient; no framework install or conftest needed.*

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
