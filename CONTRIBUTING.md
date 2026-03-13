# Contributing to SuperGhost

Welcome! We appreciate your interest in contributing to SuperGhost. Whether you're fixing a bug, adding a feature, or improving docs, this guide will get you set up quickly.

Have questions? Open an issue at [github.com/lacion/superghost/issues](https://github.com/lacion/superghost/issues).

## Prerequisites

- **Bun** (v1.2.0 or later) -- install from [bun.sh](https://bun.sh)
- **Git**

## Dev Setup

```bash
# Clone the repo
git clone https://github.com/lacion/superghost.git
cd superghost

# Install dependencies
bun install

# Run the test suite
bun test
# Expected: all tests pass (e.g. "42 pass, 0 fail")

# Check linting and formatting
bunx biome check .

# Check types
bunx tsc --noEmit
```

If all three commands pass, you're ready to contribute.

## Project Architecture

```
src/
  cli.ts          -- CLI entry point (Commander.js)
  agent/          -- AI agent execution (LLM tool calls)
  cache/          -- Step-level caching (.superghost-cache/)
  config/         -- YAML config loading, env var interpolation
  dist/           -- Binary build scripts
  infra/          -- Infrastructure utilities
  output/         -- Output formatters (json, junit, reporter)
  runner/         -- Test runner orchestration
```

**Key flow:** The CLI (`cli.ts`) parses commands, loads config from YAML files (`config/`), orchestrates test execution (`runner/`), delegates AI steps to the agent (`agent/`), caches results (`cache/`), and formats output (`output/`).

## Adding a New Output Format

The simplest way to understand the formatter pattern is to look at `src/output/json-formatter.ts` -- it's a complete, minimal example.

The key pattern:

1. **Formatters receive all results at once** (batch pattern). Your formatter function receives the full array of test results after all tests complete.
2. **Structured output goes to stdout.** This is what gets piped or redirected.
3. **Progress and diagnostics go to stderr.** Use stderr for anything humans read during execution.

To add a new format:

1. Create `src/output/your-formatter.ts` following the pattern in `json-formatter.ts`
2. Wire it into the CLI output flag in `src/cli.ts`
3. Add tests

## Linting and Formatting

SuperGhost uses [Biome](https://biomejs.dev/) as the single tool for linting, formatting, and import sorting.

```bash
# Check for issues
bunx biome check .

# Auto-fix what can be fixed
bun run lint:fix
```

## Testing

```bash
# Run all unit tests
bun test
```

CI runs with `bun install --frozen-lockfile` to ensure reproducible installs. If you add a dependency, make sure to commit the updated lockfile.

## Pull Request Process

1. Fork the repo and create a feature branch from `main`
2. Make your changes
3. Make sure all checks pass locally:
   ```bash
   bun test
   bunx biome check .
   bunx tsc --noEmit
   ```
4. Open a PR with a meaningful description of what you changed and why
5. CI runs lint, typecheck, and tests automatically -- all three must pass

That's it. Keep PRs focused and we'll review them as quickly as we can.
