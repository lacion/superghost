# Phase 16: GitHub Actions PR Workflow - Research

**Researched:** 2026-03-13
**Domain:** GitHub Actions CI workflows, Bun toolchain in CI
**Confidence:** HIGH

## Summary

This phase creates a single `ci.yml` GitHub Actions workflow that runs lint, typecheck, and test in parallel on every PR and push to main, with a gate job for branch protection. The project already has two working workflows (`release.yml`, `e2e.yml`) that establish patterns for checkout, Bun setup, and dependency installation. The new workflow follows those patterns while adding concurrency control, draft PR filtering, frozen-lockfile installs, and a gate aggregation job.

The technical surface is well-understood: GitHub Actions workflow YAML syntax, `oven-sh/setup-bun@v2` configuration, and the `needs` + `if: always()` gate pattern. There are a few gotchas around the gate job condition and the setup-bun caching API that are documented below.

**Primary recommendation:** Create `ci.yml` with three parallel check jobs and a strict gate job, then align `release.yml` and `e2e.yml` with the same Bun version pin and frozen-lockfile pattern.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- PR triggers: `opened`, `synchronize`, `ready_for_review` with draft PR filtering
- Push triggers: `main` branch only, no path filtering
- Bun version pin: `1.3.x` across all workflows (ci.yml, release.yml, e2e.yml)
- Dependency caching via `oven-sh/setup-bun@v2` built-in cache
- Three parallel jobs: lint (`bunx biome check .`), typecheck (`bunx tsc --noEmit`), test (`bun test`)
- Each job gets own checkout + setup-bun + install steps
- Gate job: `needs: [lint, typecheck, test]`, `if: always()`, checks all results equal `'success'`
- Workflow name: "CI" so gate check appears as "CI / gate"
- Concurrency: `ci-${{ github.event.pull_request.number || github.ref }}` with `cancel-in-progress: true`
- All jobs use `bun install --frozen-lockfile`
- Align release.yml and e2e.yml to `bun-version: "1.3.x"` and caching

### Claude's Discretion
- Exact YAML structure and job naming within constraints
- Whether to use reusable workflow or keep flat
- Specific `if` condition syntax for draft PR filtering

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CI-01 | GitHub Actions `ci.yml` runs lint, typecheck, and test jobs in parallel on PRs and pushes to main | Workflow trigger configuration, parallel job pattern, existing workflow patterns from release.yml/e2e.yml |
| CI-02 | A single `gate` job aggregates all CI checks for branch protection | Gate job pattern with `needs` + `if: always()` + strict success checking |
| CI-03 | CI uses `bun install --frozen-lockfile` for reproducible installs | Bun frozen-lockfile behavior in CI, setup-bun caching configuration |
</phase_requirements>

## Standard Stack

### Core
| Tool | Version | Purpose | Why Standard |
|------|---------|---------|--------------|
| `actions/checkout` | v4 | Repo checkout | Used in both existing workflows |
| `oven-sh/setup-bun` | v2 | Install Bun + cache deps | Used in both existing workflows |
| Bun | 1.3.x | Runtime + package manager | Per user decision, matches e2e.yml |

### Supporting
| Tool | Purpose | When to Use |
|------|---------|-------------|
| `bun install --frozen-lockfile` | Reproducible CI installs | Every CI job install step |
| `bunx biome check .` | Lint + format check | Lint job |
| `bunx tsc --noEmit` | Type checking | Typecheck job |
| `bun test` | Unit/integration tests | Test job |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Flat workflow | Reusable workflow / composite action | Reusable adds indirection for 3 small jobs; flat is simpler, recommended for this scope |

**Recommendation:** Keep flat. The three jobs are trivially small (4-5 steps each). A reusable workflow or composite action adds maintenance overhead without meaningful DRY benefit.

## Architecture Patterns

### Recommended Workflow Structure
```
.github/workflows/
├── ci.yml         # NEW - PR/push gate (lint, typecheck, test + gate)
├── release.yml    # MODIFY - add bun-version pin, frozen-lockfile
└── e2e.yml        # MODIFY - add frozen-lockfile
```

### Pattern 1: Parallel Jobs with Gate Aggregation
**What:** Three independent check jobs run in parallel. A fourth `gate` job waits for all three and only succeeds if all upstream jobs succeeded.
**When to use:** When branch protection should require a single check name rather than fragile per-job names.
**Example:**
```yaml
# Source: GitHub Actions docs - jobs.<job_id>.needs
jobs:
  lint:
    runs-on: ubuntu-latest
    steps: [...]

  typecheck:
    runs-on: ubuntu-latest
    steps: [...]

  test:
    runs-on: ubuntu-latest
    steps: [...]

  gate:
    name: CI
    runs-on: ubuntu-latest
    needs: [lint, typecheck, test]
    if: always()
    steps:
      - name: Check results
        run: |
          if [[ "${{ needs.lint.result }}" != "success" ||
                "${{ needs.typecheck.result }}" != "success" ||
                "${{ needs.test.result }}" != "success" ]]; then
            echo "One or more checks failed"
            exit 1
          fi
```

### Pattern 2: Draft PR Filtering
**What:** Skip CI for draft PRs to save runner minutes.
**When to use:** On the workflow level or per-job level.
**Example:**
```yaml
# Option A: Top-level concurrency + per-job condition
on:
  pull_request:
    types: [opened, synchronize, ready_for_review]

jobs:
  lint:
    if: github.event.pull_request.draft == false || github.event_name == 'push'
    # ...
```

**Note:** The `if` condition must also handle push events (where `github.event.pull_request` is null). For push events, `github.event.pull_request.draft` evaluates to `null` which is falsy, so the `|| github.event_name == 'push'` guard is essential. Alternatively, use `!github.event.pull_request.draft` which treats null as false (and `!false` = true), making push events pass naturally.

### Pattern 3: Concurrency Control
**What:** Cancel in-progress workflow runs when a new push arrives to the same PR.
**Example:**
```yaml
concurrency:
  group: ci-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
```

### Anti-Patterns to Avoid
- **Gate job without `if: always()`:** Without this, the gate job is skipped when any upstream job fails, meaning branch protection sees "skipped" (which passes by default) -- defeating the purpose entirely.
- **Checking `!= 'failure'` instead of `== 'success'`:** The `!= 'failure'` check passes for `'cancelled'` and `'skipped'` results. Always check for `== 'success'` to be strict.
- **Per-job branch protection checks:** Fragile -- renaming a job breaks protection rules. The gate pattern gives a single stable check name.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Bun installation | Shell scripts to download Bun | `oven-sh/setup-bun@v2` | Handles version resolution, caching, PATH setup |
| Dependency caching | `actions/cache` with manual key | `oven-sh/setup-bun@v2` default caching | Automatically caches `~/.bun/install/cache` keyed on `bun.lock` |
| Status aggregation | Custom scripts or actions | Native `needs` + `if: always()` | Built-in, well-understood, no dependencies |

## Common Pitfalls

### Pitfall 1: setup-bun Cache API Mismatch
**What goes wrong:** CONTEXT.md specifies `cache: true` but `oven-sh/setup-bun@v2` does NOT have a `cache` input parameter. It has `no-cache` (default: `false`).
**Why it happens:** Confusion with other setup actions (e.g., `actions/setup-node` which uses `cache: 'npm'`).
**How to avoid:** The default behavior already caches. Simply omit `no-cache` or explicitly set `no-cache: false`. Do NOT add `cache: true` -- it will be silently ignored (GitHub Actions ignores unknown inputs on `uses` steps).
**Warning signs:** YAML with `cache: true` on `oven-sh/setup-bun` -- while it won't break anything (unknown inputs are ignored), it's misleading and suggests a misunderstanding.

### Pitfall 2: Gate Job Passes When Upstream is Cancelled
**What goes wrong:** If a job is cancelled (e.g., by concurrency group), its result is `'cancelled'`, not `'failure'`. A gate checking only `!= 'failure'` would pass.
**How to avoid:** Check `== 'success'` for all upstream jobs.

### Pitfall 3: Draft PR Filter Blocks Push Events
**What goes wrong:** `github.event.pull_request.draft == false` evaluates to `false` on push events (since `github.event.pull_request` is undefined/null).
**How to avoid:** Use `!github.event.pull_request.draft` (negating null gives true) or add explicit `|| github.event_name == 'push'`.

### Pitfall 4: frozen-lockfile Fails on Lockfile Drift
**What goes wrong:** `bun install --frozen-lockfile` exits non-zero if `bun.lock` doesn't match `package.json`. This is intentional (CI-03) but can surprise contributors.
**How to avoid:** This is desired behavior. Document in CONTRIBUTING.md (Phase 17) that contributors must run `bun install` locally and commit the lockfile.

### Pitfall 5: Workflow Name vs Job Name in Branch Protection
**What goes wrong:** Branch protection requires a "status check" which appears as `{workflow_name} / {job_name}`. If workflow is named "CI" and gate job has `name: CI`, the check appears as "CI / CI". If gate job has no explicit name, it appears as "CI / gate".
**How to avoid:** Name the workflow "CI" and either leave the gate job ID as `gate` (check = "CI / gate") or give it a descriptive name.

## Code Examples

### Complete ci.yml Structure
```yaml
# Source: GitHub Actions docs + project patterns from release.yml/e2e.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    types: [opened, synchronize, ready_for_review]

concurrency:
  group: ci-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    if: ${{ !github.event.pull_request.draft }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: "1.3.x"
      - run: bun install --frozen-lockfile
      - run: bunx biome check .

  typecheck:
    if: ${{ !github.event.pull_request.draft }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: "1.3.x"
      - run: bun install --frozen-lockfile
      - run: bunx tsc --noEmit

  test:
    if: ${{ !github.event.pull_request.draft }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: "1.3.x"
      - run: bun install --frozen-lockfile
      - run: bun test

  gate:
    runs-on: ubuntu-latest
    needs: [lint, typecheck, test]
    if: always()
    steps:
      - name: Check results
        run: |
          if [[ "${{ needs.lint.result }}" != "success" ||
                "${{ needs.typecheck.result }}" != "success" ||
                "${{ needs.test.result }}" != "success" ]]; then
            exit 1
          fi
```

### release.yml Changes (Bun pin + frozen-lockfile)
```yaml
# In each job's setup-bun step, add bun-version:
- uses: oven-sh/setup-bun@v2
  with:
    bun-version: "1.3.x"

# Change install steps from:
- run: bun install
# To:
- run: bun install --frozen-lockfile
```

### e2e.yml Changes (frozen-lockfile only, already has version pin)
```yaml
# Change install step from:
- run: bun install
# To:
- run: bun install --frozen-lockfile
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-job branch protection | Gate job aggregation | ~2023 | Single required check, rename-proof |
| `actions/cache` for Bun deps | `oven-sh/setup-bun@v2` built-in cache | setup-bun v2 | Zero-config dependency caching |
| `setup-bun@v1` | `setup-bun@v2` | 2024 | Better caching, version resolution |

## Open Questions

1. **Gate job `if` on draft PRs**
   - What we know: The gate job uses `if: always()` to run even when upstream fails. If upstream jobs are skipped (draft PR), gate still runs and sees `'skipped'` results.
   - What's unclear: Whether the gate should also have the draft filter, or whether seeing `'skipped'` results and failing is acceptable behavior for draft PRs.
   - Recommendation: Add the draft filter to the three check jobs only. The gate with `if: always()` will still run on draft PRs, see `'skipped'` results, and fail -- but since draft PRs can't be merged anyway, this is harmless. Alternatively, add a compound condition to gate: `if: always() && !github.event.pull_request.draft`. Either approach works; the compound condition saves a few seconds of runner time on draft PRs.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bun test runner (built-in) |
| Config file | None (Bun test uses conventions) |
| Quick run command | `bun test` |
| Full suite command | `bun test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CI-01 | Lint, typecheck, test run in parallel on PRs/pushes | manual-only | Push branch, open PR, verify Actions tab | N/A |
| CI-02 | Gate job aggregates checks for branch protection | manual-only | Verify "CI / gate" appears in PR checks | N/A |
| CI-03 | `bun install --frozen-lockfile` for reproducible installs | manual-only | Verify workflow YAML contains `--frozen-lockfile` | N/A |

**Manual-only justification:** CI workflow YAML is infrastructure configuration. Testing requires pushing to GitHub and observing Actions execution. There is no unit-testable code being written -- only YAML files. Validation is done by YAML review and observing a real PR run.

### Sampling Rate
- **Per task commit:** Visual YAML review + `yamllint` if available
- **Per wave merge:** Open a test PR to verify workflow triggers
- **Phase gate:** Observe green CI run on an actual PR

### Wave 0 Gaps
None -- no test infrastructure needed. This phase produces only YAML workflow files.

## Sources

### Primary (HIGH confidence)
- [oven-sh/setup-bun](https://github.com/oven-sh/setup-bun) - v2 input parameters (no-cache, bun-version), caching behavior
- [Bun CI/CD docs](https://bun.com/docs/guides/runtime/cicd) - Official CI setup guide
- Existing project workflows: `.github/workflows/release.yml`, `.github/workflows/e2e.yml` - established patterns

### Secondary (MEDIUM confidence)
- [GitHub Actions branch protection patterns](https://oneuptime.com/blog/post/2026-01-28-github-actions-branch-protection/view) - Gate job aggregation pattern
- [GitHub Actions docs](https://docs.github.com/en/actions) - Workflow syntax, `needs`, `if: always()`, concurrency

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all tools already used in existing workflows
- Architecture: HIGH - gate pattern is well-documented and widely used
- Pitfalls: HIGH - verified setup-bun API against official repo README

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable domain, GitHub Actions syntax rarely changes)
