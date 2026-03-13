# Phase 8: Biome Setup - Research

**Researched:** 2026-03-12
**Domain:** Linting, formatting, and import sorting with Biome v2
**Confidence:** HIGH

## Summary

Biome v2 (latest: 2.4.6) is the established all-in-one toolchain replacing ESLint + Prettier. It handles formatting, linting, and import sorting through a single `biome.json` config and a single devDependency (`@biomejs/biome`). The project currently has zero linter/formatter config files, making this a clean greenfield setup.

The codebase is 5,181 LOC across 47 `.ts` files (25 in `src/`, 20 in `tests/`, 2 in `scripts/`). Existing code already follows most of the target style (2-space indent, double quotes, semicolons) so the one-time formatting commit will primarily affect: trailing commas, import sorting/grouping, line width enforcement (currently no limit, target is 120), and normalizing `import type { Foo }` to inline `import { type Foo }` style. There are 5 explicit `any` usages in source and ~30 in test files, confirming the `warn` severity for `noExplicitAny` is well-calibrated.

**Primary recommendation:** Use `biome check` (not separate `lint`/`format` commands) as the single entry point for npm scripts. It runs formatter + linter + import sorting in one pass. Use `--write` flag for the fix variant.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Use Biome's **recommended** preset
- Warn on `no-explicit-any` (not error, not disabled)
- Same lint/format rules for both `src/` and `tests/` (no overrides for test files)
- Ignore directories: `node_modules`, `dist`, `.superghost-cache`, `e2e/`
- Line width: 120 characters
- 2-space indentation, double quotes, semicolons always, trailing commas all
- Import sorting: external first, then internal, blank line separators, alphabetical within groups
- Inline type keyword: `import { type Foo, bar }`
- Side-effect imports stay at the top
- Single atomic formatting commit: `style: format codebase with biome`
- Create `.git-blame-ignore-revs` with the formatting commit hash
- Format all `.ts`/`.json` files minus explicit ignores
- `scripts/` directory included in formatting scope
- `bun run lint` checks (no modify), `bun run lint:fix` auto-fixes
- Update `prepublishOnly` to include lint: `bun run lint && bun test && bunx tsc --noEmit`

### Claude's Discretion
- Specific Biome rule overrides beyond recommended preset (disable noisy rules if calibration reveals conflicts)
- `biome.json` structure details (organizeImports config shape, override syntax)
- Whether to format `biome.json` itself or other config files (.json)
- Handling any edge cases in the codebase during initial formatting

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| LINT-01 | Project uses Biome for linting, formatting, and import sorting with a single `biome.json` config | Biome v2.4.6 verified as single-config solution; `biome.json` structure documented with formatter, linter, and assist (organizeImports) sections |
| LINT-02 | `bun run lint` checks code style and `bun run lint:fix` auto-fixes violations | `biome check` (read-only) and `biome check --write` (auto-fix) are the correct commands; CLI reference verified |
| LINT-03 | All existing code passes Biome checks after initial formatting baseline commit | Codebase analysis shows 5,181 LOC; existing style closely matches target (2-space, double quotes, semicolons); main changes will be trailing commas, import sorting, and 120-char line width |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @biomejs/biome | 2.4.6 | Linting, formatting, import sorting | Only tool needed; replaces ESLint + Prettier + import-sort. Single binary, zero config deps |

### Supporting
No supporting libraries needed. Biome is entirely self-contained.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Biome | ESLint + Prettier | 5+ packages, conflicting configs, slower -- explicitly out of scope per REQUIREMENTS.md |

**Installation:**
```bash
bun add -D -E @biomejs/biome@2.4.6
```

Note: `-E` pins the exact version (no caret/tilde) which is recommended for Biome since formatter output can change between versions.

## Architecture Patterns

### Project Structure (Files Added)
```
project-root/
  biome.json              # Single config for lint + format + import sorting
  .git-blame-ignore-revs  # Formatting commit hash for git blame
  package.json            # Updated scripts: lint, lint:fix, prepublishOnly
```

### Pattern 1: biome.json Configuration (Biome v2 Format)

**What:** Complete configuration matching all locked decisions.
**When to use:** This is the exact config to create.

```jsonc
// Source: https://biomejs.dev/reference/configuration/
{
  "$schema": "https://biomejs.dev/schemas/2.4/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "includes": [
      "**",
      "!!**/node_modules",
      "!!**/dist",
      "!!**/.superghost-cache",
      "!!**/e2e"
    ]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 120,
    "lineEnding": "lf"
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noExplicitAny": "warn"
      }
    }
  },
  "assist": {
    "actions": {
      "source": {
        "organizeImports": {
          "level": "on",
          "options": {
            "groups": [
              [":BUN:", ":NODE:", ":PACKAGE:"],
              ":BLANK_LINE:",
              [":ALIAS:", ":PATH:"]
            ]
          }
        }
      }
    }
  }
}
```

**Key configuration details (Biome v2-specific):**
- `files.includes` uses `!!` (double-bang) prefix for force-ignore patterns on directories like `dist/` -- this tells Biome to completely skip them including type indexing (Source: https://biomejs.dev/linter/rules/use-biome-ignore-folder/)
- Since v2.2, ignoring folders does NOT require the `/**` suffix -- `!!**/dist` is sufficient
- `node_modules/` is automatically ignored by Biome regardless of config, but explicit `!!` makes intent clear
- `vcs.useIgnoreFile: true` makes Biome respect `.gitignore` as an additional ignore source
- In Biome v2, `include`/`ignore` were merged into a single `includes` field
- `organizeImports` lives under `assist.actions.source` (not top-level `organizeImports` as in v1)

### Pattern 2: Inline Type Import Enforcement

**What:** Use `useImportType` linter rule to enforce inline type keyword.
**When to use:** The codebase currently has 30 `import type { Foo }` statements that should become `import { type Foo, ... }`.

```json
{
  "linter": {
    "rules": {
      "style": {
        "useImportType": {
          "level": "on",
          "options": { "style": "inlineType" }
        }
      }
    }
  }
}
```

**Critical note:** This is a linter rule (under `style`), not a formatter or organizeImports option. The `--write` flag will auto-fix these during the baseline commit. The codebase has some separate `import type` statements alongside value imports from the same module (e.g., `cli.ts` imports both values and types from `./runner/test-runner.ts` on separate lines). The `useImportType` rule with `inlineType` will merge these into single import statements.

### Pattern 3: NPM Scripts

**What:** Correct `biome check` invocations for package.json scripts.
**When to use:** Setting up `lint` and `lint:fix` scripts.

```json
{
  "scripts": {
    "lint": "bunx biome check .",
    "lint:fix": "bunx biome check --write .",
    "prepublishOnly": "bun run lint && bun test && bunx tsc --noEmit"
  }
}
```

**Why `biome check` not `biome lint`:** `biome check` runs formatter + linter + import sorting in one pass. Using `biome lint` alone would miss formatting violations and import sorting. The user wants `lint` to be the comprehensive check.

**Why `bunx biome` not `npx @biomejs/biome`:** Project uses Bun as its runtime (see `engines.bun` in package.json). `bunx biome` resolves the locally installed `@biomejs/biome` binary.

### Pattern 4: .git-blame-ignore-revs

**What:** File that tells git blame and GitHub to skip the formatting commit.
**When to use:** Created immediately after the one-time formatting commit.

```
# Biome initial formatting baseline
<commit-hash>
```

Also configure local git:
```bash
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

GitHub automatically recognizes `.git-blame-ignore-revs` in blame views -- no extra configuration needed.

### Anti-Patterns to Avoid
- **Separate `format` and `lint` scripts:** Do not create separate `bun run format` and `bun run lint` scripts. `biome check` covers both. Separate scripts lead to inconsistency where code passes lint but fails format or vice versa.
- **Using `biome init` in automation:** `biome init` creates a minimal default config that would need immediate overriding. Write the `biome.json` directly.
- **Running formatter before config is finalized:** If the `biome.json` config changes after the baseline format commit, the entire codebase may need reformatting. Finalize config first, format once.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Import sorting | Manual import reordering | Biome `organizeImports` | 47 files with varying import orders; manual reordering is error-prone |
| Style enforcement | Code review comments on style | `bun run lint` in CI | Automated enforcement prevents style drift |
| Type import style | Manual `import type` refactoring | `useImportType` auto-fix | 30 existing `import type` statements need conversion |

## Common Pitfalls

### Pitfall 1: Biome v1 vs v2 Configuration Syntax
**What goes wrong:** Using v1 config structure (`organizeImports` at top level, separate `include`/`ignore` fields) in a v2 installation.
**Why it happens:** Most blog posts and tutorials still reference v1 syntax. v2 moved organizeImports under `assist.actions.source` and merged include/ignore into `includes`.
**How to avoid:** Use the `$schema` reference (`https://biomejs.dev/schemas/2.4/schema.json`) for editor validation. The schema catches incorrect structure immediately.
**Warning signs:** "Unknown key" warnings from Biome CLI during check.

### Pitfall 2: Force-Ignore vs Regular Ignore
**What goes wrong:** Using `!**/dist` (single-bang) instead of `!!**/dist` (double-bang) for build output directories.
**Why it happens:** Single-bang excludes from formatting/linting but Biome still indexes for type resolution, which is slower and can surface phantom issues.
**How to avoid:** Use `!!` (double-bang) for directories that contain generated/output files (dist, .superghost-cache). Use single `!` only for files you want excluded from checks but still indexed.
**Warning signs:** Slow Biome startup, unexpected diagnostics from generated files.

### Pitfall 3: Formatting Commit Ordering
**What goes wrong:** Creating `.git-blame-ignore-revs` in the same commit as the formatting changes, then not having the commit hash to put in it.
**Why it happens:** The formatting commit hash is only known after the commit is created.
**How to avoid:** Two-step process: (1) commit formatting changes, (2) get commit hash, create `.git-blame-ignore-revs` with that hash, commit the file separately.
**Warning signs:** Empty or placeholder hash in `.git-blame-ignore-revs`.

### Pitfall 4: JSON File Formatting Scope
**What goes wrong:** Biome reformats `package.json` with multi-line objects/arrays in unexpected ways (Biome v2 defaults to expanding objects/arrays).
**Why it happens:** Biome v2 changed default JSON formatting to expand objects across multiple lines.
**How to avoid:** The `biome.json` formatter `expand` option can be set to `"auto"` (default) which uses heuristics. For `package.json` and `tsconfig.json`, verify the output looks reasonable after the first format pass. If needed, add an override for JSON files.
**Warning signs:** `package.json` becomes significantly longer or shorter after formatting.

### Pitfall 5: useImportType Merging Separate Imports
**What goes wrong:** When a file has both `import type { Foo } from "./x"` and `import { bar } from "./x"`, the auto-fix merges them into `import { type Foo, bar } from "./x"`. This is the desired behavior but could surprise reviewers.
**Why it happens:** The `inlineType` style option explicitly collapses separate type-only imports into mixed imports.
**How to avoid:** This is expected behavior per user decisions. Document it in the formatting commit message.
**Warning signs:** File line counts decrease slightly after formatting.

## Code Examples

### Complete biome.json for This Project

```jsonc
// Source: Assembled from https://biomejs.dev/reference/configuration/
// and https://biomejs.dev/assist/actions/organize-imports/
{
  "$schema": "https://biomejs.dev/schemas/2.4/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "includes": [
      "**",
      "!!**/node_modules",
      "!!**/dist",
      "!!**/.superghost-cache",
      "!!**/e2e"
    ]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 120,
    "lineEnding": "lf"
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noExplicitAny": "warn"
      },
      "style": {
        "useImportType": {
          "level": "on",
          "options": { "style": "inlineType" }
        }
      }
    }
  },
  "assist": {
    "actions": {
      "source": {
        "organizeImports": {
          "level": "on",
          "options": {
            "groups": [
              [":BUN:", ":NODE:", ":PACKAGE:"],
              ":BLANK_LINE:",
              [":ALIAS:", ":PATH:"]
            ]
          }
        }
      }
    }
  }
}
```

### Running the Baseline Format

```bash
# Step 1: Install Biome
bun add -D -E @biomejs/biome@2.4.6

# Step 2: Create biome.json (write file directly, do NOT use biome init)

# Step 3: Dry-run to see what will change
bunx biome check .

# Step 4: Apply all fixes (format + lint auto-fix + import sorting)
bunx biome check --write .

# Step 5: Verify zero violations remain
bunx biome check .

# Step 6: Commit the formatted code
git add -A
git commit -m "style: format codebase with biome"

# Step 7: Record the commit hash in .git-blame-ignore-revs
HASH=$(git rev-parse HEAD)
echo "# Biome initial formatting baseline" > .git-blame-ignore-revs
echo "$HASH" >> .git-blame-ignore-revs

# Step 8: Configure local git
git config blame.ignoreRevsFile .git-blame-ignore-revs

# Step 9: Commit .git-blame-ignore-revs
git add .git-blame-ignore-revs
git commit -m "chore: add .git-blame-ignore-revs for formatting commit"
```

### Package.json Script Updates

```json
{
  "scripts": {
    "lint": "bunx biome check .",
    "lint:fix": "bunx biome check --write .",
    "test": "bun test",
    "typecheck": "bunx tsc --noEmit",
    "prepublishOnly": "bun run lint && bun test && bunx tsc --noEmit"
  }
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ESLint + Prettier + eslint-config-prettier | Biome (single tool) | Biome v1.0 (2023), v2.0 (2025) | One devDep, one config, 10-100x faster |
| `organizeImports` at top-level config | `assist.actions.source.organizeImports` | Biome v2.0 | Config restructured; migration command handles upgrade |
| Separate `include`/`ignore` fields | Single `includes` with negation patterns | Biome v2.0 | Simpler config; `!` for exclude, `!!` for force-ignore |
| `!**/dist/**` (with trailing `/**`) | `!!**/dist` (no suffix needed) | Biome v2.2 | Cleaner ignore patterns |
| Top-level `trailingComma` option | `javascript.formatter.trailingCommas` | Biome v2.0 | Language-specific options moved under language key |

**Deprecated/outdated:**
- `rome.json`: Renamed to `biome.json` in Biome 1.0
- `// rome-ignore`: Use `// biome-ignore` (lint suppression comments)
- `linter.rules.all`: Removed in v2.0 due to rule conflicts
- Top-level `organizeImports` key: Moved to `assist.actions.source` in v2.0

## Open Questions

1. **JSON formatting behavior with `expand` option**
   - What we know: Biome v2 defaults to expanding JSON objects/arrays across multiple lines. The `expand` option controls this.
   - What's unclear: Whether `package.json` and `tsconfig.json` will look acceptable with default formatting or need an override.
   - Recommendation: Run `biome check .` first without `--write` to preview changes, then decide if a JSON override for `expand: "auto"` is needed. This falls under "Claude's Discretion."

2. **Potential lint rule conflicts with recommended preset**
   - What we know: The recommended preset includes ~150 rules. The codebase uses AI SDK callbacks and MCP schemas which may trigger false positives.
   - What's unclear: Which specific recommended rules (beyond `noExplicitAny`) might conflict with the 5,181 LOC codebase.
   - Recommendation: Run `biome check .` after config creation and before `--write`. If any rule produces more than ~5 violations that cannot be auto-fixed, disable that specific rule. This falls under "Claude's Discretion."

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Bun test (built-in, via `bun test`) |
| Config file | None (uses Bun defaults) |
| Quick run command | `bun test` |
| Full suite command | `bun test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LINT-01 | Biome config exists and is valid | smoke | `bunx biome check --help && test -f biome.json` | N/A -- infrastructure check |
| LINT-02 | `bun run lint` checks, `bun run lint:fix` fixes | smoke | `bun run lint` | N/A -- script execution check |
| LINT-03 | All existing code passes with zero violations | smoke | `bun run lint` (exit 0 = pass) | N/A -- codebase-wide check |

### Sampling Rate
- **Per task commit:** `bun run lint` (verifies zero violations)
- **Per wave merge:** `bun run lint && bun test && bunx tsc --noEmit` (full quality gate)
- **Phase gate:** `bun run lint` exits 0 with zero violations across entire codebase

### Wave 0 Gaps
None -- this phase is about tool infrastructure, not application code. Validation is through the lint tool itself (`bun run lint` exit code), not through unit tests. The existing test suite (`bun test`) must continue to pass after formatting changes (confirming formatting did not break functionality).

## Sources

### Primary (HIGH confidence)
- [Biome Configuration Reference](https://biomejs.dev/reference/configuration/) -- Full v2 config schema including files, formatter, linter, javascript, assist sections
- [Biome CLI Reference](https://biomejs.dev/reference/cli/) -- check, lint, format commands with flags
- [Biome organizeImports](https://biomejs.dev/assist/actions/organize-imports/) -- v2 import sorting config with groups, predefined matchers
- [Biome Upgrade to v2 Guide](https://biomejs.dev/guides/upgrade-to-biome-v2/) -- Breaking changes from v1 to v2
- [Biome noExplicitAny Rule](https://biomejs.dev/linter/rules/no-explicit-any/) -- Default severity is warn, belongs to suspicious group
- [npm registry: @biomejs/biome](https://www.npmjs.com/package/@biomejs/biome) -- Latest version 2.4.6

### Secondary (MEDIUM confidence)
- [git-blame-ignore-revs setup guide](https://gist.github.com/kateinoigakukun/b0bc920e587851bfffa98b9e279175f2) -- GitHub auto-recognizes `.git-blame-ignore-revs`
- [Biome v2.4 release blog](https://biomejs.dev/blog/biome-v2-4/) -- Embedded formatting, trailingNewline option
- [Biome force-ignore documentation](https://biomejs.dev/linter/rules/use-biome-ignore-folder/) -- `!!` double-bang syntax for complete directory exclusion

### Tertiary (LOW confidence)
None -- all findings verified against official Biome documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- Biome v2.4.6 verified via npm registry, single package, no ambiguity
- Architecture: HIGH -- biome.json config structure verified against official v2 schema reference and organizeImports documentation
- Pitfalls: HIGH -- v1-to-v2 config migration is well-documented; force-ignore syntax verified in official docs

**Research date:** 2026-03-12
**Valid until:** 2026-04-12 (stable tool, config format unlikely to change in minor versions)
