# Phase 17: Contributor Docs - Research

**Researched:** 2026-03-13
**Domain:** GitHub community health files, issue/PR templates
**Confidence:** HIGH

## Summary

Phase 17 creates four categories of contributor-facing documentation: CONTRIBUTING.md, SECURITY.md, GitHub issue templates (YAML form format), and a PR template. All decisions are locked via CONTEXT.md -- the research task is to verify exact file formats, locations, and GitHub-specific YAML schema so the planner can create precise tasks.

This is a documentation-only phase with no code changes. All files are new (none exist yet). The GitHub YAML issue form schema is well-documented and stable. The project's CI workflow (ci.yml) and package.json scripts provide the exact commands to reference in the contributor docs.

**Primary recommendation:** Create all six files in a single plan wave -- they have no interdependencies and are all static markdown/YAML content.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- CONTRIBUTING.md: Guided walkthrough for dev setup with prerequisites (Bun install), clone, install, test with expected output examples. Brief architecture map. "Adding a new output format" mini tutorial pointing to json-formatter.ts. Friendly and direct tone. All commands use bun/bunx (never npm/npx). Documents lint, typecheck, test, and --frozen-lockfile for CI.
- SECURITY.md: GitHub private Security Advisory as reporting channel (github.com/lacion/superghost/security/advisories, no email). Best-effort response timeline ("We'll respond as soon as we can"). Brief scope section defining security vs regular bugs. Supported versions: latest release only.
- Bug report template: Structured YAML form with description, steps to reproduce, expected vs actual, YAML config snippet (textarea), SuperGhost version, Bun version, OS. Auto-labels 'bug'.
- Feature request template: Problem-first structure with "What problem does this solve?", "Describe your ideal solution", optional "Alternatives considered". Auto-labels 'enhancement'.
- Blank issue escape hatch included in issue chooser config.yml.
- PR template: Three checklist items (tests pass, lint passes, meaningful description). Type of change checkboxes (bug fix, new feature, breaking change, documentation). Optional issue linkage. "How to test" section.

### Claude's Discretion
- Exact markdown formatting and section ordering within each file
- Whether to include a "Code of Conduct" reference or link
- Config snippet placeholder/example in bug report template
- Any additional helpful links in the issue chooser config

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CONTRIB-01 | CONTRIBUTING.md documents dev setup, linting, testing, and PR process using bun/bunx commands | Exact commands verified from package.json and ci.yml; architecture map from src/ directory structure |
| CONTRIB-02 | SECURITY.md provides a real security contact and acknowledgment commitment | GitHub Security Advisory URL format verified; best-effort timeline per CONTEXT.md decision |
| CONTRIB-03 | GitHub issue templates (bug report, feature request) use YAML form format | YAML form schema verified from GitHub official docs; field types and structure documented |
| CONTRIB-04 | PR template includes checklist for tests, lint, and description | .github/pull_request_template.md location verified; checklist items match ci.yml jobs |
</phase_requirements>

## Standard Stack

This phase produces static files only -- no libraries or dependencies.

### Files to Create
| File | Format | Purpose |
|------|--------|---------|
| `CONTRIBUTING.md` | Markdown | Dev setup, architecture, PR process |
| `SECURITY.md` | Markdown | Security disclosure policy |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | YAML form | Bug report issue template |
| `.github/ISSUE_TEMPLATE/feature_request.yml` | YAML form | Feature request issue template |
| `.github/ISSUE_TEMPLATE/config.yml` | YAML | Issue chooser configuration |
| `.github/pull_request_template.md` | Markdown | PR body auto-population |

### Project Commands to Document
From `package.json` scripts and `ci.yml`:
| Command | Purpose | Where Used |
|---------|---------|------------|
| `bun install` | Install dependencies | Dev setup |
| `bun install --frozen-lockfile` | CI reproducible install | CI reference |
| `bun test` | Run unit tests | CONTRIBUTING.md, PR template |
| `bunx biome check .` | Lint/format check | CONTRIBUTING.md, PR template |
| `bunx tsc --noEmit` | Type checking | CONTRIBUTING.md |
| `bun run lint:fix` | Auto-fix lint issues | CONTRIBUTING.md |

### Project Architecture (for CONTRIBUTING.md map)
From the source tree:
```
src/
  cli.ts          # CLI entry point (Commander.js)
  agent/          # AI agent execution
  cache/          # Step-level caching
  config/         # YAML config loading, env var interpolation
  dist/           # Binary build scripts
  infra/          # Infrastructure utilities
  output/         # Output formatters (json, junit, reporter)
  runner/         # Test runner orchestration
```

Key extension point: `src/output/json-formatter.ts` as the simplest formatter template.

## Architecture Patterns

### GitHub Issue Form YAML Schema
**Source:** [GitHub Docs - Syntax for issue forms](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms)

Top-level keys:
- `name` (required) -- template name shown in chooser
- `description` (required) -- shown in chooser
- `title` (optional) -- pre-populated issue title
- `labels` (optional) -- auto-applied labels (must exist in repo)
- `body` (required) -- array of form elements

Body element types:
- `markdown` -- display-only text (attributes: `value`)
- `input` -- single-line text (attributes: `label`, `description`, `placeholder`; validations: `required`)
- `textarea` -- multi-line text (attributes: `label`, `description`, `placeholder`, `value`, `render`; validations: `required`)
- `dropdown` -- select menu (attributes: `label`, `options`, `default`, `multiple`; validations: `required`)
- `checkboxes` -- checkbox group (attributes: `label`, `options` with `label` and `required`)

Each element needs a unique `id` attribute for form field identification.

### Issue Chooser Config
**Source:** [GitHub Docs - Configuring issue templates](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository)

File: `.github/ISSUE_TEMPLATE/config.yml` (must be `.yml`, not `.yaml`)

```yaml
blank_issues_enabled: true
contact_links:
  - name: Link Name
    url: https://example.com
    about: Description
```

### PR Template Location
**Source:** [GitHub Docs - Creating a pull request template](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository)

Use `.github/pull_request_template.md` -- auto-populates the PR body when opening a new PR. No YAML frontmatter needed, just plain markdown.

### Anti-Patterns to Avoid
- **Using .yaml extension for issue templates:** GitHub only recognizes `.yml` for issue form templates and config.
- **Referencing labels that don't exist:** Auto-labels in issue templates must exist in the repo or GitHub ignores them silently. The labels `bug` and `enhancement` are GitHub defaults and should exist.
- **Using npm/npx commands:** Project constraint -- all commands must use `bun`/`bunx`.
- **Overly long PR template checklists:** CI already enforces lint/typecheck/test. Keep the checklist as a reminder, not a gate.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Issue form validation | Custom GitHub Action | YAML form `validations.required` | GitHub handles form validation natively |
| PR checklist enforcement | Custom bot/action | CI gate job + PR template reminder | ci.yml gate job already blocks merge on failure |

## Common Pitfalls

### Pitfall 1: Wrong file extension for issue templates
**What goes wrong:** Using `.yaml` instead of `.yml` for issue form templates causes GitHub to ignore them entirely.
**Why it happens:** YAML files commonly use either extension, but GitHub requires `.yml` specifically for issue form templates and config.
**How to avoid:** Always use `.yml` for files in `.github/ISSUE_TEMPLATE/`.
**Warning signs:** Templates don't appear in the "New Issue" chooser.

### Pitfall 2: Auto-labels referencing non-existent labels
**What goes wrong:** The `labels` field in issue templates silently fails if the label doesn't exist in the repo.
**Why it happens:** GitHub doesn't create labels automatically from templates.
**How to avoid:** Use only default GitHub labels (`bug`, `enhancement`) which exist by default, or create custom labels before adding templates.

### Pitfall 3: SECURITY.md not linking to actual GitHub Security Advisories
**What goes wrong:** Contributors can't find the reporting mechanism if the link is wrong or the feature isn't enabled.
**Why it happens:** GitHub Security Advisories must be enabled on the repo.
**How to avoid:** Verify the advisories URL format: `https://github.com/lacion/superghost/security/advisories/new`.

### Pitfall 4: Textarea `render` attribute confusion
**What goes wrong:** Using `render: yaml` on a textarea makes the content display as a code block in the submitted issue, which is desired for config snippets but not for free-text fields.
**How to avoid:** Only set `render` on fields that should display as code (like YAML config snippets). Leave it unset for descriptive text fields.

## Code Examples

### Bug Report Template (YAML Form)
```yaml
# Source: GitHub Docs - Syntax for issue forms
name: Bug Report
description: Report a bug in SuperGhost
labels: ["bug"]
body:
  - type: markdown
    attributes:
      value: |
        Thanks for reporting a bug! Please fill out the information below.

  - type: textarea
    id: description
    attributes:
      label: Description
      description: A clear description of the bug
    validations:
      required: true

  - type: textarea
    id: steps
    attributes:
      label: Steps to Reproduce
      description: Steps to reproduce the behavior
      placeholder: |
        1. Run `superghost ...`
        2. See error
    validations:
      required: true

  - type: textarea
    id: expected
    attributes:
      label: Expected Behavior
    validations:
      required: true

  - type: textarea
    id: actual
    attributes:
      label: Actual Behavior
    validations:
      required: true

  - type: textarea
    id: config
    attributes:
      label: YAML Configuration
      description: Paste your SuperGhost YAML config (remove any secrets)
      render: yaml

  - type: input
    id: superghost-version
    attributes:
      label: SuperGhost Version
      placeholder: "0.3.1"
    validations:
      required: true

  - type: input
    id: bun-version
    attributes:
      label: Bun Version
      placeholder: "1.3.x"
    validations:
      required: true

  - type: input
    id: os
    attributes:
      label: Operating System
      placeholder: "macOS 15.2, Ubuntu 24.04, etc."
    validations:
      required: true
```

### Feature Request Template (YAML Form)
```yaml
name: Feature Request
description: Suggest a feature or improvement
labels: ["enhancement"]
body:
  - type: textarea
    id: problem
    attributes:
      label: What problem does this solve?
      description: Describe the problem or pain point
    validations:
      required: true

  - type: textarea
    id: solution
    attributes:
      label: Describe your ideal solution
    validations:
      required: true

  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives considered
      description: Any other approaches you've thought about
    validations:
      required: false
```

### Issue Chooser Config
```yaml
blank_issues_enabled: true
```

### PR Template
```markdown
## Description

<!-- What does this PR do? -->

## Related Issue

<!-- Related issue: # (optional) -->

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation

## Checklist

- [ ] Tests pass (`bun test`)
- [ ] Lint passes (`bunx biome check .`)
- [ ] PR has a meaningful description

## How to Test

<!-- Describe manual verification steps or commands to run -->
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Markdown issue templates (.md) | YAML form issue templates (.yml) | GitHub 2021 | Structured forms with validation, dropdowns, required fields |
| `ISSUE_TEMPLATE.md` single file | `.github/ISSUE_TEMPLATE/` directory | GitHub 2018 | Multiple templates with chooser UI |
| No config.yml | config.yml with blank_issues_enabled and contact_links | GitHub 2019 | Control over issue creation flow |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bun test (built-in) |
| Config file | `bunfig.toml` (root = ".") |
| Quick run command | `bun test` |
| Full suite command | `bun test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONTRIB-01 | CONTRIBUTING.md exists with required sections | manual-only | N/A -- static markdown file, verify by reading | N/A |
| CONTRIB-02 | SECURITY.md exists with contact and timeline | manual-only | N/A -- static markdown file, verify by reading | N/A |
| CONTRIB-03 | Issue templates use YAML form format and appear in chooser | manual-only | N/A -- requires GitHub UI verification | N/A |
| CONTRIB-04 | PR template auto-populates with checklist | manual-only | N/A -- requires GitHub UI verification | N/A |

**Justification for manual-only:** This phase creates static documentation files (markdown and YAML). There is no executable code to unit test. Validation is done by:
1. Checking files exist at correct paths
2. Verifying YAML templates parse correctly (`bun -e "console.log(JSON.stringify(require('js-yaml').load(await Bun.file('.github/ISSUE_TEMPLATE/bug_report.yml').text())))"` or similar)
3. Pushing to a branch and verifying templates appear in GitHub UI

### Sampling Rate
- **Per task commit:** Verify files exist and YAML is valid
- **Per wave merge:** All six files present at expected paths
- **Phase gate:** Manual verification that templates render in GitHub

### Wave 0 Gaps
None -- no test infrastructure needed for static documentation files.

## Open Questions

1. **Do `bug` and `enhancement` labels exist in the repo?**
   - What we know: These are GitHub default labels, typically present on new repos
   - What's unclear: Whether they've been removed or renamed
   - Recommendation: Verify during implementation; if missing, create them or remove auto-label from templates

2. **Is GitHub Security Advisories enabled on the repo?**
   - What we know: The user specified `github.com/lacion/superghost/security/advisories` as the contact channel
   - What's unclear: Whether the feature is currently enabled
   - Recommendation: Verify the URL works; if not, the user needs to enable it in repo Settings > Security

## Sources

### Primary (HIGH confidence)
- [GitHub Docs - Syntax for issue forms](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms) - YAML form schema, field types, validation
- [GitHub Docs - Configuring issue templates](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository) - config.yml, blank issues, chooser config
- [GitHub Docs - Creating a pull request template](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository) - PR template location and format
- Project files: `package.json`, `ci.yml`, `src/` directory structure - exact commands and architecture

### Secondary (MEDIUM confidence)
- [GitHub Docs - Form schema syntax](https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-githubs-form-schema) - detailed field specifications

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - static files with well-documented GitHub specifications
- Architecture: HIGH - GitHub YAML form schema is stable and well-documented
- Pitfalls: HIGH - common issues are well-known (file extensions, label existence)

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable GitHub features, unlikely to change)
