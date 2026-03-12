# Phase 8: Biome Setup - Context

**Gathered:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Install Biome as the single linting, formatting, and import sorting tool for the entire codebase. Configure it with `biome.json`, add `bun run lint` and `bun run lint:fix` scripts, and apply a one-time formatting baseline so all existing code passes with zero violations.

</domain>

<decisions>
## Implementation Decisions

### Rule strictness
- Use Biome's **recommended** preset — catches real bugs (no-debugger, no-duplicate-keys, no-unreachable) without being noisy
- Warn on `no-explicit-any` (not error, not disabled) — existing code may have legitimate `any` uses in MCP tool schemas and AI SDK callbacks
- Same lint/format rules for both `src/` and `tests/` — no overrides or relaxed rules for test files
- Ignore directories: `node_modules`, `dist`, `.superghost-cache`, `e2e/`

### Formatting style
- **Line width: 120 characters**
- 2-space indentation (matches existing codebase)
- Double quotes (matches existing codebase)
- Semicolons: always (matches existing codebase)
- Trailing commas: all (arrays, objects, parameters, type params) — cleaner git diffs

### Import sorting
- Grouped with blank line separators: external packages first, then internal (`@/*` or relative)
- Alphabetical ordering within each group
- Inline type keyword: `import { type Foo, bar }` — keeps related imports together on one line
- Side-effect imports (`import './polyfill'`) stay at the very top before all other imports

### Baseline strategy
- Single atomic commit: `style: format codebase with biome` — formats everything at once
- Create `.git-blame-ignore-revs` with the formatting commit hash — GitHub natively skips it in blame views
- Format all `.ts`/`.json` files project-wide minus explicit ignores (node_modules, dist, .superghost-cache, e2e/)
- `scripts/` directory included in formatting scope

### NPM scripts
- Add `bun run lint` — checks entire codebase, reports issues, does not modify files
- Add `bun run lint:fix` — auto-fixes all fixable violations (formatting, import sorting) in place
- Update `prepublishOnly` to include lint: `bun run lint && bun test && bunx tsc --noEmit`

### Claude's Discretion
- Specific Biome rule overrides beyond recommended preset (disable noisy rules if calibration reveals conflicts)
- `biome.json` structure details (organizeImports config shape, override syntax)
- Whether to format `biome.json` itself or other config files (.json)
- Handling any edge cases in the 3,787 LOC during initial formatting

</decisions>

<specifics>
## Specific Ideas

- The `.git-blame-ignore-revs` file should be set up immediately after the formatting commit so the hash can be recorded
- This is the first phase of v0.3 — establishing the quality baseline before any feature code lands
- STATE.md flagged "Biome rule conflicts with existing 3,787 LOC codebase" as a research concern — the recommended preset with warn-on-any should minimize calibration pain

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `package.json` scripts section: Add `lint` and `lint:fix` alongside existing `test`, `typecheck`, `build:binary`
- `tsconfig.json`: Include patterns (`src/**/*.ts`, `tests/**/*.ts`) can inform Biome scope, though Biome uses its own config
- Existing `prepublishOnly`: `bun test && bunx tsc --noEmit` — needs lint prepended

### Established Patterns
- Code style: 2-space indent, double quotes, semicolons throughout all 93 `.ts` files
- Import style: External packages first (commander, picocolors, ai SDK), then internal (`./config/loader.ts`, `./runner/...`)
- Type imports: Mix of `import type { Foo }` and `import { type Foo }` — Biome will normalize to inline style
- No existing linter/formatter config files (.eslintrc, .prettierrc, .editorconfig)

### Integration Points
- `package.json`: Add `@biomejs/biome` as devDependency, add `lint`/`lint:fix` scripts, update `prepublishOnly`
- Project root: New `biome.json` config file
- Project root: New `.git-blame-ignore-revs` file
- All `.ts` files: One-time reformatting (import sorting, trailing commas, line width adjustments)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-biome-setup*
*Context gathered: 2026-03-12*
