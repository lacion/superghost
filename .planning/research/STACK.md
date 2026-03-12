# Stack Research

**Domain:** CLI testing tool — v0.4 additions (JUnit XML, env var interpolation, GitHub Actions PR workflow, contributor docs)
**Researched:** 2026-03-12
**Confidence:** HIGH

> This file covers ONLY the new stack additions for v0.4. The existing validated stack (Bun,
> Vercel AI SDK, Playwright MCP, Commander.js, Zod, YAML, Biome) is not re-researched here.

---

## Recommended Stack Additions

### Core Technologies (new for v0.4)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| No new runtime deps | — | JUnit XML generation | Implement as pure TypeScript in `src/output/junit-formatter.ts`. JUnit is a small, known XML schema. The existing `json-formatter.ts` pattern (pure functions, no external deps, independently testable) should be replicated exactly. |
| No new runtime deps | — | Env var interpolation | Implement as a pure TypeScript string-replacement pass over raw YAML content before `yaml.parse()`. Pattern: `content.replace(/\$\{([^}]+)\}/g, ...)`. Zero dependencies. |

### Development / CI (new for v0.4)

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| `actions/checkout` | `v4` | GitHub Actions: checkout repo in PR workflow | v6 is current latest (released Nov 2024) but the existing `release.yml` and `e2e.yml` already pin `v4`. Keep consistent — no functional difference for this use case. |
| `oven-sh/setup-bun` | `v2` | GitHub Actions: install Bun in PR workflow | Already used in existing workflows. `v2` is current stable. |

---

## Implementation Details

### JUnit XML — Pure TypeScript, No Library

**Why no library:**

`junit-report-builder` v5.1.1 (actively maintained, full TypeScript types, ESM + CJS) is the strongest available option — and it is still unnecessary. The JUnit XML schema is a known, small format. SuperGhost's `RunResult` maps directly to it in under 60 lines of TypeScript. Adding any npm dependency for something this small creates future maintenance surface and contradicts the project's lean-dep posture.

The `json-formatter.ts` precedent (pure functions, no deps, tested in isolation) should be exactly replicated for `junit-formatter.ts`.

**JUnit XML structure needed:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="superghost" tests="N" failures="N" time="T.TTT">
  <testsuite name="[config file]" tests="N" failures="N" time="T.TTT" timestamp="ISO8601">
    <testcase name="[test name]" classname="[test case text]" time="T.TTT">
      <!-- only present on failure: -->
      <failure message="[error message]" type="AssertionError">[error message]</failure>
    </testcase>
  </testsuite>
</testsuites>
```

**Critical:** `time` attribute is in **seconds** (not milliseconds) — divide `durationMs / 1000`. All major CI systems (Jenkins, GitHub Actions, GitLab CI, CircleCI, Azure DevOps) consume this structure without modification.

**Note on Bun's built-in JUnit reporter:** `bun test --reporter junit` is for Bun's own test runner (`bun test`). It is entirely irrelevant here. SuperGhost generates results from AI execution stored in `RunResult` — it must produce JUnit output from `RunResult`, the same way it produces JSON output from `RunResult`.

---

### Env Var Interpolation — Pure TypeScript String Pass

**Why no library:**

`yaml-env-defaults` wraps `js-yaml` (not the `yaml` package already in use). Introducing a second YAML parser for string interpolation creates inconsistency risk. The interpolation pattern is 3–5 lines of TypeScript applied to the raw YAML string before `yaml.parse()`.

**Implementation pattern:**

```typescript
// Apply to raw YAML string before yaml.parse(), after reading file
function interpolateEnvVars(raw: string): string {
  return raw.replace(/\$\{([^}]+)\}/g, (match, key) => {
    const value = process.env[key];
    if (value === undefined) {
      throw new Error(`Environment variable not set: ${key}`);
    }
    return value;
  });
}
```

**Behavior decisions:**
- Throw on unset vars (fail fast) — CI configs must always set vars they reference. Silent empty-string fallback would mask misconfigured pipelines.
- No default value syntax (`${VAR:-default}`) in v0.4 — keep scope minimal.
- Zod schema validation runs after interpolation, so type-safety is preserved.

---

### GitHub Actions PR Workflow — No New Actions Needed

The existing `release.yml` already uses all required actions. The PR workflow is a new file with a new trigger, reusing the same actions at the same versions.

**Trigger:**

```yaml
on:
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened]
```

**Jobs to include (run in parallel):**
1. `lint` — `bunx biome check .`
2. `typecheck` — `bunx tsc --noEmit`
3. `test` — `bun test`

**What NOT to include in the PR workflow:**
- E2E tests — requires `ANTHROPIC_API_KEY` secret, too slow per PR, forks won't have the secret. E2E stays release-only.
- Binary builds — release-only.
- npm publish — release-only.

**Permissions:** `permissions: contents: read` only. No write access needed for status checks.

---

### Contributor Docs — No Stack Required

CONTRIBUTING.md, SECURITY.md, and GitHub templates are Markdown files. No new tooling. File locations:
- `.github/ISSUE_TEMPLATE/bug_report.md`
- `.github/ISSUE_TEMPLATE/feature_request.md`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `CONTRIBUTING.md` (repo root)
- `SECURITY.md` (repo root)

---

## Installation

No new runtime dependencies for v0.4.

```bash
# No package.json changes required
# All new functionality is pure TypeScript + .github/ workflow/template files
```

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Pure TypeScript `junit-formatter.ts` | `junit-report-builder@5.1.1` | Adds npm dep for <60 lines of known-format XML. Same rationale that ruled out deps for JSON output. |
| Pure TypeScript `junit-formatter.ts` | `junit-xml@1.2.0` | Less popular (fewer weekly downloads), older codebase. Same conclusion — not worth the dep. |
| Inline regex env interpolation | `yaml-env-defaults` | Wraps `js-yaml`, not the `yaml` package in use. Inconsistent parser risk for zero functional gain. |
| `actions/checkout@v4` (keep existing pin) | `actions/checkout@v6` | v6 is current (Nov 2024) but v4 is already used in all existing workflows. Consistency matters more than upgrade for a patch release. Upgrade all workflows together later. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `junit-report-builder` | External dep for trivial XML; contradicts lean-dep posture | Pure TypeScript `junit-formatter.ts` |
| `junit-xml` | Same rationale; lower adoption | Pure TypeScript `junit-formatter.ts` |
| `yaml-env-defaults` | Wrong YAML parser (`js-yaml` vs `yaml`); coupling risk | Inline `process.env` string replacement |
| `dotenv` | SuperGhost is a CLI run in CI — shell and CI platform populate `process.env`. No `.env` file loading is appropriate for a test runner. | Native `process.env` access |
| `pull_request_target` trigger | Runs with base repo write permissions on code from forks — security risk | `pull_request` trigger (read-only, safe for forks) |

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `yaml@^2.x` (existing) | Env var interpolation | Interpolation runs before `yaml.parse()` on the raw string — no parser API changes needed |
| `zod@4.x` (existing) | Post-interpolation Zod validation | Schema validates interpolated values as normal strings — no schema changes needed |
| `actions/checkout@v4` | `oven-sh/setup-bun@v2` | Both already in use in existing workflows, confirmed compatible |

---

## Sources

- [Bun Test Reporters docs](https://bun.com/docs/test/reporters) — Confirmed `bun test --reporter junit` is for Bun's own test runner, not for custom output. HIGH confidence.
- [testmoapp/junitxml JUnit XML spec](https://github.com/testmoapp/junitxml) — Authoritative format reference for `<testsuites>/<testsuite>/<testcase>/<failure>` schema and attribute set. HIGH confidence.
- [junit-report-builder npm](https://www.npmjs.com/package/junit-report-builder) — Version 5.1.1 confirmed via `npm view junit-report-builder version`. TypeScript support confirmed. MEDIUM confidence.
- [junit-xml npm](https://www.npmjs.com/package/junit-xml) — Version 1.2.0 confirmed via `npm view junit-xml version`. MEDIUM confidence.
- [actions/checkout releases](https://github.com/actions/checkout/releases) — v6.0.2 is latest (Jan 2026); v4 already pinned in project. HIGH confidence.
- [oven-sh/setup-bun](https://github.com/oven-sh/setup-bun) — v2 is current stable, already in project. HIGH confidence.
- [GitHub Actions PR triggers](https://oneuptime.com/blog/post/2026-02-02-github-actions-pull-requests/view) — `pull_request` trigger event types and security guidance. MEDIUM confidence.

---

*Stack research for: SuperGhost v0.4 — JUnit XML, env var interpolation, PR workflow, contributor docs*
*Researched: 2026-03-12*
