# SuperGhost

## What This Is

SuperGhost is an AI-powered end-to-end browser and API testing CLI tool for AI-native teams. Users write test cases in plain English via YAML config, and an AI agent executes them in a real browser (via Playwright MCP) or via HTTP calls. Successful test steps are cached for instant deterministic replay on subsequent runs, making AI-driven testing viable for CI/CD pipelines.

## Core Value

Plain English test cases that execute in a real browser, with step caching that makes them fast and deterministic enough for CI/CD — no test code required.

## Requirements

### Validated

- ✓ YAML-based test configuration with Zod validation — v1.0
- ✓ CLI entry point (`superghost --config tests.yaml`) — v1.0
- ✓ AI agent executes test cases via Playwright MCP in a real browser — v1.0
- ✓ Step caching — successful AI steps recorded and replayed deterministically — v1.0
- ✓ Self-healing — stale cache auto-detected, AI re-executes and updates cache — v1.0
- ✓ Multi-provider AI support (Anthropic, OpenAI, Google Gemini, OpenRouter) via Vercel AI SDK — v1.0
- ✓ API testing — auto-detected from test case description (HTTP calls without browser) — v1.0
- ✓ CI/CD-ready exit codes (0 = all pass, 1 = any fail) and summary output — v1.0
- ✓ Sequential test execution with independent browser contexts — v1.0
- ✓ Configurable: browser type, headless mode, timeout, max retries, model selection — v1.0
- ✓ Bun-native distribution: `bun install`, `bunx`, and standalone compiled binary — v1.0

### Active

<!-- v0.2: DX Polish + Reliability Hardening -->
- [ ] CLI flags: `--dry-run`, `--verbose`, `--no-cache`, `--only <pattern>`
- [ ] Preflight `baseUrl` reachability check before AI execution
- [ ] Real-time step progress output during AI execution
- [ ] Distinct exit codes: 0 = pass, 1 = test failure, 2 = config/runtime error
- [ ] Cache key normalization (whitespace/formatting-insensitive)

### Out of Scope

- GUI / dashboard — CLI-only, web app doubles scope
- Parallel test execution — sequential first, parallel in v2
- Visual regression testing — dedicated tools (Percy, Chromatic) do it better
- Test generation from app crawling — users write test cases
- Cloud-hosted execution — local/CI runner only
- Offline mode — real-time AI execution is core value

## Current Milestone: v0.2 DX Polish + Reliability Hardening

**Goal:** Make SuperGhost debuggable, observable, and resilient — so users can iterate efficiently and CI pipelines get actionable signals.

**Target features:**
- CLI flags: `--dry-run`, `--verbose`, `--no-cache`, `--only <pattern>`
- Preflight `baseUrl` reachability check
- Real-time step progress output
- Distinct exit codes (0/1/2)
- Cache key normalization

## Context

Shipped v1.0 with 3,787 LOC TypeScript across 93 files.
Tech stack: Bun, Vercel AI SDK, Playwright MCP, Commander.js, Zod, YAML.
Built in 1 day (2026-03-10 → 2026-03-11), 3 phases, 9 plans, 63 commits.

Known areas for future work:
- Parallel test execution for faster suite runs
- Watch mode for re-running on config file changes
- JSON/JUnit output formats for CI reporting
- Cost/token tracking per test run

## Constraints

- **Runtime**: Bun — primary and only supported runtime
- **AI SDK**: Vercel AI SDK — no LangChain dependency
- **Language**: TypeScript (strict mode)
- **Browser**: Playwright MCP for browser automation (not direct Playwright API)
- **Config**: YAML parsed with `yaml` package, validated with Zod
- **Providers**: Must support Anthropic, OpenAI, Google Gemini, and OpenRouter

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Vercel AI SDK over LangChain | Simpler, more composable, better TypeScript support, active development | ✓ Good — clean agent loop with generateText, provider switching trivial |
| Bun-native over Node.js | Faster runtime, built-in tooling (test, build), aligns with modern TS ecosystem | ✓ Good — Bun.file(), CryptoHasher, bun:test, bun build --compile all used |
| Playwright MCP over direct Playwright | Maintains browser abstraction through MCP protocol, same proven approach as reference | ✓ Good — MCP tools seamlessly available to AI agent |
| `superghost` CLI name | Clear branding for natural language E2E testing | ✓ Good |
| Cache dir `.superghost-cache/` | SuperGhost-native cache directory | ✓ Good — human-readable JSON, SHA-256 keyed |
| Atomic write-then-rename for cache | Prevents corruption on interrupt | ✓ Good — safe cache writes under any termination |
| StdioClientTransport for MCP | Bun-compatible (not Experimental_StdioMCPTransport) | ✓ Good — stable API from @modelcontextprotocol/sdk |
| Provider inference from model name | Auto-detect provider without explicit config | ✓ Good — regex-based, anthropic default fallback |
| BUN_BE_BUN=1 for standalone deps | Forces bun behavior in compiled binary | ✓ Good — auto-install MCP deps on first run |

---
*Last updated: 2026-03-11 after v0.2 milestone start*
