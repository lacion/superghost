---
phase: 1
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in, Jest-compatible) |
| **Config file** | bunfig.toml (optional; no config needed for defaults) |
| **Quick run command** | `bun test` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test`
- **After every plan wave:** Run `bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 0 | CONF-01 | unit | `bun test tests/unit/config/schema.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 0 | CONF-02 | unit | `bun test tests/unit/config/loader.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 0 | CONF-03 | unit | `bun test tests/unit/config/schema.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-01-04 | 01 | 0 | CONF-04 | unit | `bun test tests/unit/config/schema.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-01-05 | 01 | 0 | CONF-05 | unit | `bun test tests/unit/config/schema.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 0 | CLI-01 | integration | `bun test tests/integration/cli-pipeline.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 0 | CLI-02 | integration | `bun test tests/integration/cli-pipeline.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-02-03 | 02 | 0 | CLI-03 | unit | `bun test tests/unit/output/reporter.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-02-04 | 02 | 0 | CLI-04 | unit | `bun test tests/unit/output/reporter.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-02-05 | 02 | 0 | CLI-05 | integration | `bun test tests/integration/cli-pipeline.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 0 | INFR-01 | unit | `bun test tests/unit/infra/process-manager.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-03-02 | 03 | 0 | INFR-02 | unit | `bun test tests/unit/config/schema.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/config/schema.test.ts` — stubs for CONF-01, CONF-03, CONF-04, CONF-05, INFR-02
- [ ] `tests/unit/config/loader.test.ts` — stubs for CONF-02 (file missing, bad YAML, validation errors)
- [ ] `tests/unit/output/reporter.test.ts` — stubs for CLI-03, CLI-04
- [ ] `tests/unit/runner/test-runner.test.ts` — stubs for sequential execution and result aggregation
- [ ] `tests/unit/infra/process-manager.test.ts` — stubs for INFR-01
- [ ] `tests/integration/cli-pipeline.test.ts` — stubs for CLI-01, CLI-02, CLI-05
- [ ] `package.json` — project initialization with dependencies
- [ ] `tsconfig.json` — TypeScript configuration

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SIGTERM cleanup of orphaned processes | INFR-01 | Signal handling timing is non-deterministic in CI | 1. Start superghost with long-running config 2. Send SIGTERM 3. Verify no orphaned processes with `ps aux | grep mcp` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
