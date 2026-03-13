# Phase 17: Contributor Docs - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Documentation and templates that let a new contributor set up the project, understand the PR process, report bugs, and disclose security issues without asking anyone. Deliverables: CONTRIBUTING.md, SECURITY.md, GitHub issue templates (YAML form format), and PR template.

</domain>

<decisions>
## Implementation Decisions

### CONTRIBUTING.md depth & structure
- Guided walkthrough for dev setup — includes prerequisites (Bun install instructions), clone, install, test, with expected output examples
- Brief architecture map section — key directories (src/cli.ts, src/engine/, src/formatters/) and how they connect, enough to orient a new contributor
- "Adding a new output format" mini tutorial — points to json-formatter.ts as template, explains the batch-formatter pattern as the most likely extension point
- Friendly & direct tone — welcoming but no-nonsense, similar to Bun's or Vite's contributing guides
- All commands use `bun`/`bunx` (never npm/npx) — carried forward from project constraints
- Documents lint (`bunx biome check .`), typecheck (`bunx tsc --noEmit`), test (`bun test`), and `--frozen-lockfile` for CI

### SECURITY.md contact & policy
- GitHub private Security Advisory as the reporting channel — no email, use github.com/lacion/superghost/security/advisories
- Best-effort response timeline — "We'll respond as soon as we can," no hard SLA commitment (honest for solo-maintainer project)
- Brief scope section — define what qualifies as security (secret leakage, cache poisoning, dependency vulnerabilities) vs regular bugs (crash bugs, config errors)
- Supported versions: latest release only — security fixes applied to latest, not backported

### Issue template design
- Bug report: structured YAML form with fields for description, steps to reproduce, expected vs actual, YAML config snippet (textarea), SuperGhost version, Bun version, OS
- Feature request: problem-first structure — "What problem does this solve?", "Describe your ideal solution", optional "Alternatives considered"
- Blank issue escape hatch included in the issue chooser — link for issues that don't fit templates
- Auto-labels: bug report auto-tags 'bug', feature request auto-tags 'enhancement'

### PR template checklist
- Three checklist items: tests pass (`bun test`), lint passes (`bunx biome check .`), PR has a meaningful description — matches CI checks, no busywork
- Type of change checkboxes: bug fix, new feature, breaking change, documentation
- Issue linkage: encouraged but not required — "Related issue: #" field is optional
- "How to test" section included — author describes manual verification steps / commands to run

### Claude's Discretion
- Exact markdown formatting and section ordering within each file
- Whether to include a "Code of Conduct" reference or link
- Config snippet placeholder/example in bug report template
- Any additional helpful links in the issue chooser config

</decisions>

<specifics>
## Specific Ideas

- Formatter extension guide should reference json-formatter.ts as the canonical template since it's the simplest complete example
- Bug report config snippet field is uniquely useful for this CLI — helps reproduce issues immediately
- Keep the PR template lightweight — CI already enforces lint/typecheck/test, so the checklist is a reminder not a gate

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ci.yml`: Documents the exact CI checks (lint, typecheck, test) that CONTRIBUTING.md and PR template should reference
- `release.yml`, `e2e.yml`: Existing workflow patterns for reference in architecture section
- `package.json` scripts: `bun test`, `bunx tsc --noEmit`, `bunx biome check .`, `bun run lint:fix` — exact commands to document
- `dependabot.yml`: Already configured — contributor docs can mention dependency management is automated

### Established Patterns
- `oven-sh/setup-bun@v2` with `bun-version: "1.3.x"` across all workflows
- `bun install --frozen-lockfile` for CI reproducibility
- Biome v2.4.6 as single lint/format/import-sort tool
- `src/formatters/json-formatter.ts` and `src/formatters/junit-formatter.ts` as formatter extension examples

### Integration Points
- `CONTRIBUTING.md` — new file at repo root
- `SECURITY.md` — new file at repo root
- `.github/ISSUE_TEMPLATE/bug_report.yml` — new file (YAML form format)
- `.github/ISSUE_TEMPLATE/feature_request.yml` — new file (YAML form format)
- `.github/ISSUE_TEMPLATE/config.yml` — new file (blank issue escape hatch)
- `.github/pull_request_template.md` — new file

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 17-contributor-docs*
*Context gathered: 2026-03-13*
