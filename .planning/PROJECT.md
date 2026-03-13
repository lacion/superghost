# SuperGhost

## What This Is

SuperGhost is an AI-powered end-to-end browser and API testing CLI tool for AI-native teams. Users write test cases in plain English via YAML config, and an AI agent executes them in a real browser (via Playwright MCP) or via HTTP calls. Successful test steps are cached for instant deterministic replay on subsequent runs, making AI-driven testing viable for CI/CD pipelines. Supports JUnit XML and JSON output for CI reporting, env var interpolation for secret injection, and ships with GitHub Actions CI gates and full contributor onboarding docs.

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
- ✓ CLI flags: `--dry-run`, `--verbose`, `--no-cache`, `--only <pattern>` — v0.2
- ✓ Preflight `baseUrl` reachability check before AI execution — v0.2
- ✓ Real-time step progress output during AI execution — v0.2
- ✓ Distinct exit codes: 0 = pass, 1 = test failure, 2 = config/runtime error — v0.2
- ✓ Cache key normalization (whitespace/formatting-insensitive) — v0.2
- ✓ Linting/formatting enforcement with Biome — v0.3
- ✓ JSON output format (`--output json`) for programmatic consumption — v0.3
- ✓ AI-generated release notes in GitHub release workflow — v0.3
- ✓ JUnit XML output format (`--output junit`) for CI reporting — v0.4
- ✓ Env var interpolation in YAML configs (`${VAR}`, `${VAR:-default}`, `${VAR:?error}`) — v0.4
- ✓ GitHub Actions PR workflow with parallel lint/typecheck/test gates — v0.4
- ✓ Contributor docs: CONTRIBUTING.md, SECURITY.md, issue/PR templates — v0.4

### Active

(No active milestone — next milestone TBD)

### Out of Scope

- GUI / dashboard — CLI-only, web app doubles scope
- Parallel test execution — sequential first, parallel in v2
- Visual regression testing — dedicated tools (Percy, Chromatic) do it better
- Test generation from app crawling — users write test cases
- Cloud-hosted execution — local/CI runner only
- Offline mode — real-time AI execution is core value
- `.env` file auto-loading — ambiguous env precedence; users should set env vars explicitly
- Recursive env var expansion — unnecessary complexity; `${VAR}` referencing other vars is an anti-pattern

## Context

Shipped v0.4 with 6,813 LOC TypeScript across 23+ files modified this milestone.
Tech stack: Bun, Vercel AI SDK, Playwright MCP, Commander.js, Zod, YAML, Biome.
Four milestones shipped in 3 days (2026-03-10 → 2026-03-13): v1.0 MVP, v0.2 DX Polish, v0.3 CI/CD, v0.4 CI/CD Part 2.

Known areas for future work:
- Parallel test execution for faster suite runs
- Watch mode for re-running on config file changes
- Config composition (extends/inherits)
- Fail-fast (`--bail`) mode
- Cost/token tracking per test run
- HTML report generation (via Allure consuming JUnit XML)

## Constraints

- **Runtime**: Bun — primary and only supported runtime
- **AI SDK**: Vercel AI SDK — no LangChain dependency
- **Language**: TypeScript (strict mode)
- **Browser**: Playwright MCP for browser automation (not direct Playwright API)
- **Config**: YAML parsed with `yaml` package, validated with Zod
- **Providers**: Must support Anthropic, OpenAI, Google Gemini, and OpenRouter
- **Linting**: Biome — single tool for lint, format, import sorting

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
| Template literal XML for JUnit | Zero dependencies, matches project pattern | ✓ Good — v0.4 |
| Post-YAML-parse env var interpolation | YAML-special chars in env values can't break parsing | ✓ Good — v0.4 |
| GitHub Security Advisory over email | Private, tracked, auto-assigned CVE; better than email for OSS | ✓ Good — v0.4 |
| Gate job aggregator pattern | Single status check name for branch protection; avoids check name fragility | ✓ Good — v0.4 |

---
*Last updated: 2026-03-13 after v0.4 milestone completion*
