# Phase 3: Distribution - Research

**Researched:** 2026-03-11
**Domain:** npm package publishing, bunx/global install, standalone binary compilation, CI/CD release automation
**Confidence:** HIGH

## Summary

Phase 3 packages SuperGhost for three distribution channels: (1) npm package for `bunx superghost` and `bun install -g superghost`, (2) standalone compiled binaries via `bun build --compile` with cross-compilation for macOS and Linux, and (3) automated CI/CD via GitHub Actions that publishes to both npm and GitHub Releases on a single tag push.

The npm package ships source TypeScript directly (no compilation step) since Bun runs `.ts` files natively. The `bin` field in `package.json` points directly to `src/cli.ts`. The standalone binary uses `bun build --compile` with cross-compilation targets (`--target=bun-darwin-arm64`, `bun-darwin-x64`, `bun-linux-arm64`, `bun-linux-x64`). A critical constraint is that the compiled binary cannot use `bunx` to spawn MCP server packages -- instead, it must auto-install MCP dependencies to `~/.superghost/` on first run using the `BUN_BE_BUN=1` environment variable trick, which makes the compiled binary act as the full `bun` CLI (including `bun install`).

The GitHub Actions workflow triggers on `v*.*.*` tag push, runs in a matrix for cross-compilation (all from a single runner since Bun supports cross-compilation), publishes to npm with OIDC trusted publishing (no long-lived NPM_TOKEN needed), and uploads binary assets to a GitHub Release.

**Primary recommendation:** Ship source TypeScript for npm, use `bun build --compile` with `--minify --bytecode --sourcemap` for binaries, use `BUN_BE_BUN=1` for first-run MCP dependency auto-install in the standalone binary, and use a single GitHub Actions workflow with npm trusted publishing (OIDC) for the release pipeline.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Standalone binary auto-installs MCP server dependencies (Playwright MCP, curl MCP) on first run
- Dependencies installed to `~/.superghost/` -- global home directory, shared across projects, installed once
- First-run install shows spinner + status messages matching Phase 1's CLI output style (colored, polished)
- MCP npm packages only -- does NOT auto-install browser binaries (Chromium). Fail with clear message if Playwright can't find a browser
- Known constraint: `bun build --compile` cannot bundle MCP server packages due to dynamic import limitations -- must be installed externally
- Package name: `superghost` (unscoped)
- No license (proprietary/all rights reserved) -- no LICENSE file shipped
- Description: "Plain English test cases with AI execution and instant cached replay for CI/CD"
- Starting version: `0.1.0`
- Standalone binaries distributed via GitHub Releases only (no Homebrew, no install script for v0.1.0)
- Target platforms: macOS (arm64 + x64) and Linux (arm64 + x64) -- Windows deferred
- Binary naming: `superghost-{os}-{arch}` (e.g., `superghost-darwin-arm64`, `superghost-linux-x64`)
- GitHub Actions workflow automates binary builds: triggers on tag push, builds for all platforms, uploads to release
- Ship source TypeScript + bin entry -- Bun runs TypeScript directly, no pre-compilation step
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

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DIST-01 | User can run `bunx superghost --config tests.yaml` with no prior install | npm package with `bin: { "superghost": "src/cli.ts" }` and `files: ["src/", "package.json", "README.md"]`; no shebang needed for bunx |
| DIST-02 | User can install globally via `bun install -g superghost` | Same bin entry; global install adds `superghost` to PATH; works because Bun runs .ts natively |
| DIST-03 | SuperGhost is published as an npm package | `bun publish` or `npm publish` with OIDC trusted publishing from GitHub Actions; `files` field whitelists shipped contents |
| DIST-04 | Standalone compiled binary via `bun build --compile` runs without Bun | Cross-compilation with `--target` flag; `BUN_BE_BUN=1` for first-run MCP dependency install to `~/.superghost/`; `--minify --bytecode --sourcemap` for optimization |
</phase_requirements>

## Standard Stack

### Core
| Library/Tool | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| bun build --compile | Bun 1.2+ | Standalone binary compilation with cross-compilation | Built into Bun; supports all 4 target platforms from a single machine |
| oven-sh/setup-bun@v2 | v2 | GitHub Actions Bun installer | Official Bun GitHub Action; installs Bun in CI runners |
| softprops/action-gh-release@v2 | v2 | GitHub Release creation + asset upload | Most popular release action; supports file glob patterns, auto-release notes |
| npm trusted publishing (OIDC) | npm >=11.5.1 | Tokenless npm publishing from GitHub Actions | Eliminates long-lived NPM_TOKEN; short-lived OIDC tokens; automatic provenance |

### Supporting
| Tool | Purpose | When to Use |
|------|---------|-------------|
| `bun pm pack` | Test package contents before publish | Pre-publish verification; verify `files` field includes correct files |
| `npx npm-packlist` | List exact files that would be published | Debugging package contents |
| picocolors + nanospinner | First-run setup UX in standalone binary | Already installed from Phase 1; reuse for auto-install spinner |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| npm OIDC trusted publishing | NPM_TOKEN secret | OIDC is more secure (no long-lived tokens), but requires npm >=11.5.1 and initial npmjs.com setup. Fall back to NPM_TOKEN if OIDC setup is too complex for v0.1.0 |
| `softprops/action-gh-release` | `gh release create` in workflow | softprops handles asset upload with glob patterns; gh requires manual per-file upload |
| `package.json` `files` field | `.npmignore` file | `files` is a whitelist (safer -- new files are excluded by default); `.npmignore` is a blacklist (risk of accidentally publishing sensitive files) |
| Single workflow with cross-compile | Matrix of native runners | Cross-compilation from single runner is faster and cheaper than running on macOS/Linux/ARM runners separately |

## Architecture Patterns

### Recommended Project Structure (Phase 3 additions)
```
package.json              # Updated: bin, files, description, version, publishConfig
README.md                 # New: install instructions, quick start, CLI flags, provider setup
src/
  cli.ts                  # Existing: entry point (bin target)
  dist/
    setup.ts              # New: first-run MCP dependency auto-installer
    paths.ts              # New: ~/.superghost/ path resolution
.github/
  workflows/
    release.yml           # New: tag-triggered release workflow (npm + binaries)
```

### Pattern 1: Source TypeScript npm Package (No Build Step)
**What:** Ship `.ts` source files directly as the npm package. Bun runs TypeScript natively, so no transpilation or bundling needed for the npm distribution channel.
**When to use:** Always for the npm package.
**Example:**
```json
{
  "name": "superghost",
  "version": "0.1.0",
  "type": "module",
  "description": "Plain English test cases with AI execution and instant cached replay for CI/CD",
  "bin": {
    "superghost": "src/cli.ts"
  },
  "files": [
    "src/",
    "README.md"
  ]
}
```

### Pattern 2: BUN_BE_BUN Auto-Install for Standalone Binary
**What:** The compiled binary uses `process.argv[0]` (itself) with `BUN_BE_BUN=1` environment variable to run `bun install` in `~/.superghost/`. This works because the compiled binary embeds the full Bun runtime, and `BUN_BE_BUN=1` makes it act as the `bun` CLI.
**When to use:** First-run setup in the standalone binary when MCP dependencies are not found.
**Example:**
```typescript
// src/dist/setup.ts
import { join } from "path";
import { homedir } from "os";
import { createSpinner } from "nanospinner";
import pc from "picocolors";

const SUPERGHOST_HOME = join(homedir(), ".superghost");
const PACKAGE_JSON_PATH = join(SUPERGHOST_HOME, "package.json");

const MCP_DEPS = {
  "@playwright/mcp": "latest",
  "@calibress/curl-mcp": "latest",
};

export async function ensureMcpDependencies(): Promise<void> {
  // Check if already installed
  const markerPath = join(SUPERGHOST_HOME, "node_modules", "@playwright", "mcp");
  if (await Bun.file(join(markerPath, "package.json")).exists()) {
    return; // Already installed
  }

  // Create ~/.superghost/ directory and package.json
  await Bun.write(
    PACKAGE_JSON_PATH,
    JSON.stringify({
      private: true,
      dependencies: MCP_DEPS,
    })
  );

  const spinner = createSpinner("Installing MCP dependencies...").start();

  // Use the binary itself as the Bun CLI via BUN_BE_BUN=1
  const proc = Bun.spawn([process.argv[0], "install"], {
    cwd: SUPERGHOST_HOME,
    env: { ...process.env, BUN_BE_BUN: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    spinner.error({ text: "Failed to install MCP dependencies" });
    const stderr = await new Response(proc.stderr).text();
    console.error(pc.dim(stderr));
    process.exit(1);
  }

  spinner.success({ text: "MCP dependencies installed to ~/.superghost/" });
}
```

### Pattern 3: Cross-Compilation Build Script
**What:** Build standalone binaries for all 4 target platforms from a single machine using `bun build --compile --target`.
**When to use:** In GitHub Actions release workflow and for local builds.
**Example:**
```bash
#!/usr/bin/env bash
# Build all platform binaries
TARGETS=(
  "bun-darwin-arm64:superghost-darwin-arm64"
  "bun-darwin-x64:superghost-darwin-x64"
  "bun-linux-arm64:superghost-linux-arm64"
  "bun-linux-x64:superghost-linux-x64"
)

for entry in "${TARGETS[@]}"; do
  target="${entry%%:*}"
  outfile="${entry##*:}"
  bun build --compile \
    --target="$target" \
    --minify \
    --bytecode \
    --sourcemap \
    src/cli.ts \
    --outfile "dist/$outfile"
done
```

### Pattern 4: Tag-Triggered Release Workflow
**What:** A single GitHub Actions workflow triggered by `v*.*.*` tag push that: (1) builds binaries for all platforms, (2) creates a GitHub Release with the binaries, (3) publishes to npm.
**When to use:** Every release.
**Example:**
```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - "v*.*.*"

jobs:
  build-binaries:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2

      - name: Build all platform binaries
        run: |
          mkdir -p dist
          bun build --compile --target=bun-darwin-arm64 --minify --bytecode --sourcemap src/cli.ts --outfile dist/superghost-darwin-arm64
          bun build --compile --target=bun-darwin-x64 --minify --bytecode --sourcemap src/cli.ts --outfile dist/superghost-darwin-x64
          bun build --compile --target=bun-linux-arm64 --minify --bytecode --sourcemap src/cli.ts --outfile dist/superghost-linux-arm64
          bun build --compile --target=bun-linux-x64 --minify --bytecode --sourcemap src/cli.ts --outfile dist/superghost-linux-x64

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          files: dist/superghost-*

  publish-npm:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - uses: actions/setup-node@v4
        with:
          node-version: "24"
          registry-url: "https://registry.npmjs.org"

      - run: bun install
      - run: npm publish --provenance --access public
```

### Anti-Patterns to Avoid
- **Bundling MCP packages into the compiled binary:** `bun build --compile` cannot handle the dynamic imports in `@playwright/mcp` and `@calibress/curl-mcp`. These must be installed externally and spawned as child processes.
- **Using `.npmignore` instead of `files` field:** `.npmignore` is a blacklist -- easy to accidentally ship `.planning/`, `references/`, or other internal files. The `files` field is a whitelist -- only listed files are included.
- **Hardcoding binary version:** Use `--define` build flag or read from `package.json` to keep version in sync. Do not hardcode version strings in multiple places.
- **Using long-lived NPM_TOKEN:** npm OIDC trusted publishing is the modern standard. Short-lived tokens, automatic provenance, no secret rotation needed.
- **Building native binaries on each platform:** Bun supports cross-compilation from a single runner. No need for a build matrix across macOS/Linux runners.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Release automation | Custom shell scripts for npm publish + GitHub release | GitHub Actions workflow with `softprops/action-gh-release@v2` | Handles asset upload, release notes, tag management; reproducible and auditable |
| Cross-platform binary builds | Per-platform build infrastructure | `bun build --compile --target` from single runner | Bun supports cross-compilation natively; no QEMU or Docker needed |
| npm package content control | Manual file selection or `.npmignore` | `package.json` `files` field (whitelist) | Whitelist is safer; new files excluded by default |
| Version synchronization | Manual version bumps in multiple files | Read version from `package.json` at runtime or use `--define` at compile time | Single source of truth for version |
| npm authentication in CI | Manual token management with NPM_TOKEN | OIDC trusted publishing | Eliminates secret rotation; shorter-lived tokens; automatic provenance |

**Key insight:** Distribution is primarily a configuration and automation problem, not a code problem. Most of the work is in `package.json` fields, GitHub Actions YAML, and build commands -- not application code. The only new application code is the `~/.superghost/` auto-install module.

## Common Pitfalls

### Pitfall 1: Compiled Binary Cannot Use `bunx`
**What goes wrong:** The standalone binary tries to spawn MCP servers via `bunx @playwright/mcp` and fails because `bunx` is not available.
**Why it happens:** `bun build --compile` embeds the Bun runtime but not the `bunx` CLI command. The binary is a standalone executable, not a full Bun installation.
**How to avoid:** Use `BUN_BE_BUN=1` with `process.argv[0]` to run `bun install` in `~/.superghost/`, then spawn MCP servers using their direct paths from `~/.superghost/node_modules/.bin/`. The MCP server spawn command changes from `bunx @playwright/mcp` to the installed binary path.
**Warning signs:** "command not found: bunx" errors when running the standalone binary.

### Pitfall 2: Missing `files` Field Ships Everything
**What goes wrong:** Publishing ships `tests/`, `.planning/`, `references/`, and other internal files.
**Why it happens:** Without a `files` field in `package.json`, npm includes everything not in `.gitignore` or `.npmignore`.
**How to avoid:** Always set `"files": ["src/", "README.md"]` in `package.json`. Verify with `bun pm pack` or `npx npm-packlist` before publishing.
**Warning signs:** Package tarball is unexpectedly large (>1MB for a CLI tool).

### Pitfall 3: npm OIDC Requires npm >=11.5.1
**What goes wrong:** `npm publish --provenance --access public` fails with "Access token expired or revoked."
**Why it happens:** Older npm versions don't support OIDC token exchange. Trusted publishing requires npm CLI >=11.5.1 (included in Node.js >=24).
**How to avoid:** Use `actions/setup-node@v4` with `node-version: "24"` in the GitHub Actions workflow. Alternatively, fall back to NPM_TOKEN secret if OIDC setup is blocked.
**Warning signs:** Authentication errors in CI despite correct OIDC configuration.

### Pitfall 4: Binary Version Drift
**What goes wrong:** The compiled binary reports a different version than what's in `package.json` or the npm package.
**Why it happens:** Version is hardcoded in `cli.ts` or the binary is compiled before `package.json` version is updated.
**How to avoid:** Read version from `package.json` at runtime (for npm package) or use `--define BUILD_VERSION='"0.1.0"'` flag during compilation (for standalone binary). Or read from the embedded `package.json`.
**Warning signs:** `superghost --version` shows a different version than the release tag.

### Pitfall 5: Cross-Compilation Target String Typos
**What goes wrong:** Build fails or produces a binary for the wrong platform.
**Why it happens:** Target strings like `bun-darwin-arm64` are easy to mistype.
**How to avoid:** Define targets as constants in the build script. Verify each binary's platform with `file dist/superghost-*` after building.
**Warning signs:** Binary crashes with "Exec format error" on the target platform.

### Pitfall 6: GitHub Release Not Created Before Asset Upload
**What goes wrong:** `softprops/action-gh-release` fails because no release exists for the tag.
**Why it happens:** The action creates the release AND uploads assets in one step -- but if used in multiple jobs, the release must exist first.
**How to avoid:** Use `softprops/action-gh-release` in a single step that both creates the release and uploads assets. If splitting into jobs, ensure the release-creation job completes first.
**Warning signs:** "Not Found" errors when uploading release assets.

### Pitfall 7: Standalone Binary MCP Spawn Path
**What goes wrong:** Standalone binary can't find MCP server executables after installing to `~/.superghost/`.
**Why it happens:** The Phase 2 MCP manager uses `bunx @playwright/mcp` as the spawn command, but the standalone binary needs to use the installed path.
**How to avoid:** Make the MCP spawn command configurable. In npm package mode, use `bunx`. In standalone binary mode, use `~/.superghost/node_modules/.bin/playwright-mcp` (or equivalent). Detect mode by checking if `process.argv[0]` is a compiled binary (can check `Bun.isMainThread` or similar).
**Warning signs:** MCP server fails to start in standalone binary mode but works fine with `bunx superghost`.

## Code Examples

### package.json for Distribution
```json
{
  "name": "superghost",
  "version": "0.1.0",
  "type": "module",
  "description": "Plain English test cases with AI execution and instant cached replay for CI/CD",
  "bin": {
    "superghost": "src/cli.ts"
  },
  "files": [
    "src/",
    "README.md"
  ],
  "scripts": {
    "test": "bun test",
    "typecheck": "bunx tsc --noEmit",
    "build:binary": "bash scripts/build-binaries.sh",
    "prepublishOnly": "bun test && bunx tsc --noEmit"
  },
  "publishConfig": {
    "access": "public"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/USER/superghost.git"
  },
  "keywords": ["testing", "ai", "browser", "e2e", "playwright", "mcp", "cli"],
  "dependencies": {
    "commander": "^14.0.3",
    "zod": "^4.3.6",
    "yaml": "^2.8.2",
    "picocolors": "^1.1.1",
    "nanospinner": "^1.2.2",
    "ai": "^6.0.116",
    "@ai-sdk/mcp": "^1.0.25",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@ai-sdk/anthropic": "^3.0.58",
    "@ai-sdk/openai": "^3.0.41",
    "@ai-sdk/google": "^3.0.37",
    "@openrouter/ai-sdk-provider": "^2.2.5"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5"
  },
  "engines": {
    "bun": ">=1.2.0"
  }
}
```

### MCP Dependency Path Resolution
```typescript
// src/dist/paths.ts
import { join } from "path";
import { homedir } from "os";

export const SUPERGHOST_HOME = join(homedir(), ".superghost");
export const MCP_NODE_MODULES = join(SUPERGHOST_HOME, "node_modules");

/** Check if running as a compiled standalone binary */
export function isStandaloneBinary(): boolean {
  // In compiled binaries, the executable path differs from a script path
  // Bun sets this when running a compiled executable
  return !process.argv[1] || process.argv[1] === process.argv[0];
}

/** Get the command to spawn an MCP server */
export function getMcpCommand(packageName: string): { command: string; prefix: string[] } {
  if (isStandaloneBinary()) {
    // Standalone binary: use installed path from ~/.superghost/
    const binPath = join(MCP_NODE_MODULES, ".bin");
    // For @playwright/mcp, the bin name is "mcp" within the package
    return {
      command: process.argv[0],
      prefix: ["--bun", join(MCP_NODE_MODULES, packageName, "cli.js")],
    };
  }
  // npm package: use bunx
  return {
    command: "bunx",
    prefix: [packageName],
  };
}
```

### Complete GitHub Actions Release Workflow
```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - "v*.*.*"

permissions:
  contents: write
  id-token: write

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install
      - run: bun test
      - run: bunx tsc --noEmit

  build-and-release:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2

      - name: Build binaries for all platforms
        run: |
          mkdir -p dist
          for target in bun-darwin-arm64 bun-darwin-x64 bun-linux-arm64 bun-linux-x64; do
            os_arch="${target#bun-}"
            bun build --compile \
              --target="$target" \
              --minify \
              --bytecode \
              --sourcemap \
              src/cli.ts \
              --outfile "dist/superghost-$os_arch"
          done

      - name: Create GitHub Release with binaries
        uses: softprops/action-gh-release@v2
        with:
          generate_release_notes: true
          files: dist/superghost-*

  publish-npm:
    needs: test
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - uses: actions/setup-node@v4
        with:
          node-version: "24"
          registry-url: "https://registry.npmjs.org"

      - run: bun install
      - run: npm publish --provenance --access public
```

### Version Synchronization for Compiled Binary
```typescript
// In src/cli.ts -- read version from package.json
// For npm package: import works at runtime
// For compiled binary: use --define at build time

// Option A: Read at runtime (works for npm, may need embedded file for binary)
import pkg from "../package.json" with { type: "json" };
const VERSION = pkg.version;

// Option B: Define at compile time (works for both)
// Build with: bun build --compile --define BUILD_VERSION='"0.1.0"' src/cli.ts
// declare const BUILD_VERSION: string | undefined;
// const VERSION = typeof BUILD_VERSION !== "undefined" ? BUILD_VERSION : pkg.version;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Long-lived NPM_TOKEN | OIDC trusted publishing (tokenless) | July 2025 (GA) | No secret rotation; automatic provenance attestation; more secure |
| Per-platform native runners for builds | Cross-compilation from single runner | Bun 1.1.5+ (2024) | Faster CI, cheaper (1 runner vs 4), simpler workflow |
| `npm publish` | `npm publish --provenance` | npm 9.5.0+ | Cryptographic proof of build origin; supply chain security |
| `.npmignore` blacklist | `package.json` `files` whitelist | Always available | Safer default; new files excluded automatically |
| Pre-compile TypeScript for npm | Ship source `.ts` files | Bun ecosystem | No build step; simpler DX; Bun runs `.ts` natively |

**Deprecated/outdated:**
- `actions/create-release` + `actions/upload-release-asset`: Deprecated GitHub Actions. Use `softprops/action-gh-release@v2` which combines both.
- `oven-sh/setup-bun@v1`: Use `@v2` which has better caching and version support.
- Manual NPM_TOKEN secrets for publishing: Prefer OIDC trusted publishing (npm >=11.5.1).

## Open Questions

1. **Exact MCP server binary names in `~/.superghost/node_modules/.bin/`**
   - What we know: `@playwright/mcp` and `@calibress/curl-mcp` install bin entries to `node_modules/.bin/`
   - What's unclear: The exact bin names (could be `playwright-mcp`, `mcp`, `curl-mcp`, etc.) -- need to verify after actual install
   - Recommendation: Install locally during implementation and inspect `node_modules/.bin/` to get exact names. Fall back to spawning via `node_modules/@playwright/mcp/cli.js` pattern if bin names are unreliable.

2. **BUN_BE_BUN availability in current Bun version**
   - What we know: Feature was announced for Bun, official docs mention it
   - What's unclear: Exact minimum Bun version required; whether it works reliably with `bun install` subcommand
   - Recommendation: Test early in implementation. If `BUN_BE_BUN=1` doesn't work reliably, fall back to checking for `npm` or `bun` on PATH and using whichever is available.

3. **Compiled binary detecting its own mode (standalone vs npm-installed)**
   - What we know: Need to differentiate to choose MCP spawn strategy
   - What's unclear: The most reliable detection method
   - Recommendation: Use `Bun.embeddedFiles` or check if `__dirname` points to a real file system path vs an embedded path. Alternatively, check for a sentinel like `process.env.SUPERGHOST_STANDALONE`.

4. **npm package name availability**
   - What we know: User wants `superghost` (unscoped)
   - What's unclear: Whether `superghost` is available on npm
   - Recommendation: Check `npm view superghost` before publishing. If taken, discuss fallback with user.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | bun:test (built-in, Jest-compatible) |
| Config file | bunfig.toml (from Phase 1) |
| Quick run command | `bun test` |
| Full suite command | `bun test` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DIST-01 | bunx superghost works with no prior install | smoke (manual) | Manual: `bunx superghost --config tests/fixtures/valid-config.yaml` | Manual-only -- requires npm publish first |
| DIST-02 | Global install works | smoke (manual) | Manual: `bun install -g superghost && superghost --version` | Manual-only -- requires npm publish first |
| DIST-03 | npm package published with correct contents | unit | `bun test tests/unit/dist/package-contents.test.ts -x` | Wave 0 |
| DIST-04 | Standalone binary compiles and runs | integration | `bun test tests/integration/binary-build.test.ts -x` | Wave 0 |

### DIST-01 and DIST-02 Manual-Only Justification
These requirements verify the published npm package works via `bunx` and global install. They cannot be tested in CI before the package is published. Verify manually after the first `npm publish` or test with a local npm registry (verdaccio).

### Sampling Rate
- **Per task commit:** `bun test`
- **Per wave merge:** `bun test`
- **Phase gate:** Full suite green + manual smoke test of `bunx superghost` after npm publish

### Wave 0 Gaps
- [ ] `tests/unit/dist/package-contents.test.ts` -- verify `files` field produces correct tarball contents (use `bun pm pack` and inspect)
- [ ] `tests/unit/dist/setup.test.ts` -- covers first-run MCP dependency auto-installer logic (mock file system checks)
- [ ] `tests/unit/dist/paths.test.ts` -- covers `isStandaloneBinary()` detection and MCP command resolution
- [ ] `tests/integration/binary-build.test.ts` -- verify `bun build --compile` succeeds for at least the host platform
- [ ] `.github/workflows/release.yml` -- the release workflow itself (verified by pushing a test tag)

## Sources

### Primary (HIGH confidence)
- Bun standalone executable docs (bun.com/docs/bundler/executables) -- cross-compilation targets, --target flag, --compile flags, BUN_BE_BUN, embedded files
- Bun publish docs (bun.com/docs/pm/cli/publish) -- bun publish workflow, package.json requirements
- Bun CI/CD docs (bun.sh/guides/runtime/cicd) -- setup-bun@v2 usage in GitHub Actions
- npm package.json docs (docs.npmjs.com/cli/v11/configuring-npm/package-json) -- files field, bin field, publishConfig
- softprops/action-gh-release README (github.com/softprops/action-gh-release) -- complete workflow example, configuration options

### Secondary (MEDIUM confidence)
- npm trusted publishing docs (docs.npmjs.com/trusted-publishers) -- OIDC setup, GitHub Actions configuration
- Blog: remarkablemark.org/blog/2025/12/19/npm-trusted-publishing -- step-by-step OIDC setup verified against npm docs
- Blog: blog.api2o.com -- bunx publishing pattern, no shebang needed for bunx

### Tertiary (LOW confidence)
- GitHub issue oven-sh/bun#11266 -- compiled binary cannot use bunx (open issue, no resolution)
- GitHub discussion oven-sh/bun#12235 -- BUN_BE_BUN workaround for running bun commands from compiled binary (community-sourced, needs validation)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all tools verified via official docs; Bun cross-compilation well-documented
- Architecture: HIGH -- npm package pattern proven in reference implementation; GitHub Actions workflow patterns standard
- Pitfalls: HIGH -- BUN_BE_BUN limitation verified via official announcement; OIDC requirements confirmed in npm docs
- Auto-install pattern: MEDIUM -- BUN_BE_BUN approach is documented but needs practical validation during implementation

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (stable domain; Bun build system and npm publishing are well-established)
