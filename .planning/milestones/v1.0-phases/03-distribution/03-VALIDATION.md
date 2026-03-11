---
phase: 3
slug: distribution
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bun:test (built-in, Jest-compatible) |
| **Config file** | bunfig.toml (from Phase 1) |
| **Quick run command** | `bun test` |
| **Full suite command** | `bun test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `bun test`
- **After every plan wave:** Run `bun test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | DIST-03 | unit | `bun test tests/unit/dist/package-contents.test.ts -x` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DIST-04 | unit | `bun test tests/unit/dist/setup.test.ts -x` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DIST-04 | unit | `bun test tests/unit/dist/paths.test.ts -x` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DIST-04 | integration | `bun test tests/integration/binary-build.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/dist/package-contents.test.ts` — verify `files` field produces correct tarball contents (DIST-03)
- [ ] `tests/unit/dist/setup.test.ts` — covers first-run MCP dependency auto-installer logic (DIST-04)
- [ ] `tests/unit/dist/paths.test.ts` — covers `isStandaloneBinary()` detection and MCP command resolution (DIST-04)
- [ ] `tests/integration/binary-build.test.ts` — verify `bun build --compile` succeeds for host platform (DIST-04)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `bunx superghost` works with no prior install | DIST-01 | Requires published npm package; cannot test pre-publish | 1. Publish to npm 2. Run `bunx superghost --config tests/fixtures/valid-config.yaml` 3. Verify tests execute |
| Global install works from any directory | DIST-02 | Requires published npm package; cannot test pre-publish | 1. Run `bun install -g superghost` 2. cd to a different directory 3. Run `superghost --version` 4. Verify version output |
| Release workflow creates GitHub Release | DIST-03/04 | Requires tag push to GitHub | 1. Push test tag `v0.1.0-test` 2. Verify GitHub Release created 3. Verify binary assets attached |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
