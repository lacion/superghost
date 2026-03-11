# Phase 3: Distribution - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can install and run SuperGhost without cloning the repo — via `bunx superghost`, global install (`bun install -g superghost`), or a standalone compiled binary that requires no Bun runtime. Includes automated CI/CD for both npm publish and binary builds.

Requirements: DIST-01, DIST-02, DIST-03, DIST-04

</domain>

<decisions>
## Implementation Decisions

### Binary dependency handling
- Standalone binary auto-installs MCP server dependencies (Playwright MCP, curl MCP) on first run
- Dependencies installed to `~/.superghost/` — global home directory, shared across projects, installed once
- First-run install shows spinner + status messages matching Phase 1's CLI output style (colored, polished)
- MCP npm packages only — does NOT auto-install browser binaries (Chromium). Fail with clear message if Playwright can't find a browser
- Known constraint: `bun build --compile` cannot bundle MCP server packages due to dynamic import limitations — must be installed externally

### npm package identity
- Package name: `superghost` (unscoped)
- No license (proprietary/all rights reserved) — no LICENSE file shipped
- Description: "Plain English test cases with AI execution and instant cached replay for CI/CD"
- Starting version: `0.1.0`

### Binary distribution channel
- Standalone binaries distributed via GitHub Releases only (no Homebrew, no install script for v0.1.0)
- Target platforms: macOS (arm64 + x64) and Linux (arm64 + x64) — Windows deferred
- Binary naming: `superghost-{os}-{arch}` (e.g., `superghost-darwin-arm64`, `superghost-linux-x64`)
- GitHub Actions workflow automates binary builds: triggers on tag push, builds for all platforms, uploads to release

### Published package contents
- Ship source TypeScript + bin entry — Bun runs TypeScript directly, no pre-compilation step
- Tarball includes: `src/`, `package.json`, `README.md`
- Full README with install instructions, quick start YAML example, CLI flags, provider setup
- Standard exclusions via `package.json` `files` field: exclude `tests/`, `.planning/`, `.superghost-cache/`, `references/`, `.github/`, `docs/`, `scripts/`
- GitHub Actions workflow automates npm publish: same release tag triggers binary builds AND npm publish (needs NPM_TOKEN secret)

### Claude's Discretion
- GitHub Actions workflow structure and job organization
- `bun build --compile` flags and optimization settings
- README content structure and formatting
- `.npmignore` vs `package.json` `files` field approach
- Release tag format (v0.1.0 vs 0.1.0)

</decisions>

<specifics>
## Specific Ideas

- npm description focuses on the caching angle: "Plain English test cases with AI execution and instant cached replay for CI/CD"
- Binary auto-install UX should match the polished CLI feel from Phase 1 — spinners, colored status, not silent
- Single CI workflow for releases: one tag push triggers both npm publish and binary uploads
- Browser installation is the user's responsibility — keeps SuperGhost lightweight and avoids managing Playwright's browser download lifecycle

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- SuperGhost `package.json` uses Bun-native bin entry pattern: `"bin": { "superghost": "src/cli.ts" }`
- Phase 1 CLI entry point at `src/cli.ts` will be the bin target
- Phase 1 reporter pattern can be extended for first-run setup messaging

### Established Patterns
- Phase 1 establishes: CLI entry point, Commander.js CLI, Zod config validation, colored output with spinners
- Phase 2 establishes: MCP server subprocess management, process cleanup on SIGINT/SIGTERM
- Bun-native throughout — `bun build --compile` for standalone binary is the natural distribution path

### Integration Points
- `package.json` `bin` field points to Phase 1's CLI entry point
- MCP dependency auto-install hooks into Phase 2's MCP client initialization (check `~/.superghost/` before spawning servers)
- Process cleanup from Phase 1 applies to auto-installed MCP server paths
- GitHub Actions needs access to: npm registry (NPM_TOKEN), GitHub Releases (GITHUB_TOKEN)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-distribution*
*Context gathered: 2026-03-11*
