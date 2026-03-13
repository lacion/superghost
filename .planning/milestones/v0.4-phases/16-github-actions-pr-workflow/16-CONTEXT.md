# Phase 16: GitHub Actions PR Workflow - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

CI workflow (`ci.yml`) that gates every PR and push to main with lint, typecheck, and test checks running in parallel. A single gate job aggregates results for branch protection. E2E tests are explicitly excluded (require API keys, non-deterministic).

</domain>

<decisions>
## Implementation Decisions

### Workflow triggers
- PR events: `opened`, `synchronize`, `ready_for_review` — covers new PRs, new pushes, and draft-to-ready transitions
- Skip draft PRs: use `if: github.event.pull_request.draft == false` or equivalent filter
- Push events: `main` branch only — branch pushes are covered by PR triggers
- No path filtering — all PRs trigger CI regardless of files changed

### Bun version strategy
- Pin Bun to minor range: `1.3.x` across all workflows
- Align release.yml and e2e.yml to also use `bun-version: "1.3.x"` (release.yml currently has no pin)
- Use `oven-sh/setup-bun@v2` with `bun-version` parameter

### Dependency caching
- Use `oven-sh/setup-bun@v2` built-in cache: `cache: true` — caches ~/.bun/install/cache keyed on bun.lock
- Also add `cache: true` to release.yml and e2e.yml for consistency

### CI jobs (parallel)
- **lint**: `bunx biome check .`
- **typecheck**: `bunx tsc --noEmit`
- **test**: `bun test`
- All three run in parallel, each with own checkout + setup-bun + install step

### Gate job
- Single `gate` job with `needs: [lint, typecheck, test]`
- Strict: runs with `if: always()`, checks all upstream job results equal `'success'`
- Gate job name surfaces as "CI" status check in branch protection
- Workflow name: "CI" so the gate job check appears as "CI / gate" or just "CI"

### Concurrency
- Concurrency group cancels in-progress CI when new push arrives to same PR
- Group key: `ci-${{ github.event.pull_request.number || github.ref }}`
- `cancel-in-progress: true`

### Frozen lockfile
- All jobs use `bun install --frozen-lockfile` for reproducible installs (per CI-03 requirement)

### Claude's Discretion
- Exact YAML structure and job naming within the constraints above
- Whether to use a reusable workflow or keep it flat
- Specific `if` condition syntax for draft PR filtering

</decisions>

<specifics>
## Specific Ideas

- Gate job named "CI" for clean branch protection setup — single required check
- Align all three workflow files (ci.yml, release.yml, e2e.yml) on Bun 1.3.x and cache: true for consistency
- Follow existing patterns: `actions/checkout@v4`, `oven-sh/setup-bun@v2`

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `release.yml`: Existing workflow pattern — checkout, setup-bun, install, test, typecheck sequence (can be parallelized in ci.yml)
- `e2e.yml`: Shows `bun-version: "1.3.x"` pin pattern to follow
- `dependabot.yml`: Already configured for dependency updates

### Established Patterns
- `oven-sh/setup-bun@v2` for Bun setup (both existing workflows use this)
- `actions/checkout@v4` for repo checkout
- `bun install` for dependency installation (will change to `--frozen-lockfile` in CI)
- Package scripts: `bun test`, `bunx tsc --noEmit`, `bunx biome check .` — all exist and work

### Integration Points
- `.github/workflows/ci.yml` — new file
- `.github/workflows/release.yml` — add `bun-version: "1.3.x"` and `cache: true` to setup-bun steps
- `.github/workflows/e2e.yml` — add `cache: true` to setup-bun step (already has version pin)
- GitHub branch protection settings — user configures "CI" as required check after deployment

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 16-github-actions-pr-workflow*
*Context gathered: 2026-03-13*
