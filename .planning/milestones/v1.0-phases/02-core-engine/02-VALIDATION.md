---
phase: 2
slug: core-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in, Jest-compatible) |
| **Config file** | bunfig.toml (optional; no config needed for defaults) |
| **Quick run command** | `bun test` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~15 seconds (unit), ~60 seconds (with integration) |

---

## Sampling Rate

- **After every task commit:** Run `bun test`
- **After every plan wave:** Run `bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | PROV-01, PROV-02, PROV-03, PROV-04, PROV-05 | unit | `bun test tests/unit/agent/model-factory.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | AGNT-01, AGNT-02 | unit | `bun test tests/unit/agent/agent-runner.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 1 | AGNT-05 | unit | `bun test tests/unit/agent/prompt.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | CACH-01, CACH-02, CACH-07 | unit | `bun test tests/unit/cache/cache-manager.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | CACH-01 | unit | `bun test tests/unit/cache/step-recorder.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-02-03 | 02 | 1 | CACH-03 | unit | `bun test tests/unit/cache/step-replayer.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | AGNT-04, CACH-04, CACH-05, CACH-06 | unit | `bun test tests/unit/runner/test-executor.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-04-01 | 04 | 3 | AGNT-01, AGNT-03 | integration | `bun test tests/integration/agent-browser.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-04-02 | 04 | 3 | AGNT-02 | integration | `bun test tests/integration/agent-api.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-04-03 | 04 | 3 | AGNT-03 | integration | `bun test tests/integration/browser-isolation.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/agent/model-factory.test.ts` — stubs for PROV-01 through PROV-05 (provider creation, auto-inference, API key validation)
- [ ] `tests/unit/agent/agent-runner.test.ts` — stubs for AGNT-01, AGNT-02, AGNT-05 (structured output, diagnostic messages)
- [ ] `tests/unit/agent/prompt.test.ts` — stubs for system prompt building with context field
- [ ] `tests/unit/cache/cache-manager.test.ts` — stubs for CACH-01, CACH-02, CACH-07 (hash generation, save/load/delete, metadata)
- [ ] `tests/unit/cache/step-recorder.test.ts` — stubs for CACH-01 (tool wrapping, step recording)
- [ ] `tests/unit/cache/step-replayer.test.ts` — stubs for CACH-03 (sequential replay, error detection)
- [ ] `tests/unit/runner/test-executor.test.ts` — stubs for AGNT-04, CACH-04, CACH-05, CACH-06 (cache-first strategy, retry loop, self-heal)
- [ ] `tests/integration/agent-browser.test.ts` — stubs for AGNT-01, AGNT-03 (live browser test, requires MCP server)
- [ ] `tests/integration/agent-api.test.ts` — stubs for AGNT-02 (live API test, requires curl MCP)
- [ ] `tests/integration/browser-isolation.test.ts` — stubs for AGNT-03 (two sequential tests, verify no state leak)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Self-heal CLI indicator shows correctly | CACH-04, CACH-05 | CLI output formatting needs visual check | Run a test twice, change app UI between runs, verify `PASS (ai, self-healed, Xs)` output |
| MCP server startup latency acceptable | AGNT-01, AGNT-02 | Performance threshold is subjective | Cold start test suite, verify first test completes within 30s |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending