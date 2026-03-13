# Milestones

## v0.4 CI/CD + Team Readiness (Part 2) (Shipped: 2026-03-13)

**Phases completed:** 4 phases, 5 plans, 10 tasks | 14 min total execution
**Timeline:** 2026-03-11 → 2026-03-13

**Key accomplishments:**
- JUnit XML output (`--output junit`) with classname, time-in-seconds, and per-testcase properties metadata for CI dashboards
- Env var interpolation (`${VAR}`, `${VAR:-default}`, `${VAR:?error}`) in YAML configs with cache secret prevention
- GitHub Actions CI workflow with parallel lint/typecheck/test gates and single `gate` aggregator for branch protection
- Contributor docs: CONTRIBUTING.md, SECURITY.md, YAML form issue templates, PR template with CI-matching checklist

**Phases:**
- Phase 14: JUnit XML Output — escapeXml, ANSI stripping, 3-function formatter mirroring JSON pattern, 37 unit tests
- Phase 15: Env Var Interpolation — regex-based interpolation engine, post-parse architecture, template-aware cache hashing
- Phase 16: GitHub Actions PR Workflow — ci.yml with draft filtering, concurrency cancellation, frozen-lockfile installs
- Phase 17: Contributor Docs — CONTRIBUTING.md with architecture map, SECURITY.md with GitHub Advisory policy, issue/PR templates

---

## v0.2 DX Polish + Reliability Hardening (Shipped: 2026-03-12)

**Phases completed:** 4 phases, 7 plans | 23 min total execution
**Timeline:** 2026-03-11 → 2026-03-12

**Key accomplishments:**
- CLI flags: `--dry-run`, `--verbose`, `--no-cache`, `--only <pattern>`
- Preflight `baseUrl` reachability check (HEAD, 5s timeout, exit 2)
- Real-time step progress: spinner mode + verbose mode with tool call descriptions
- Distinct exit codes: 0 = pass, 1 = test failure, 2 = config/runtime error
- Cache key normalization: v2 hash, Unicode NFC, whitespace collapse, URL normalization
- All output migrated to stderr; stdout reserved for future structured output

**Phases:**
- Phase 4: Foundation — POSIX exit codes (0/1/2), cache key normalization + v2 prefix
- Phase 5: Infrastructure + Flags — `--only` glob filter, `--no-cache` bypass, preflight check
- Phase 6: Dry-Run — Config-validating test preview without AI execution
- Phase 7: Observability — Tool name mapping, step progress callbacks, verbose/spinner modes

---

## v1.0 MVP (Shipped: 2026-03-11)

**Phases completed:** 3 phases, 9 plans | 63 commits | 3,787 LOC TypeScript
**Timeline:** 2026-03-10 → 2026-03-11

**Key accomplishments:**
- YAML-based test config with Zod validation, three-layer error handling, and CLI scaffold
- AI agent loop executing browser tests via Playwright MCP and API tests via curl MCP
- SHA-256 step caching with atomic writes — instant replay (~50ms) on subsequent runs
- Self-healing cache — stale detection, AI re-execution, and automatic cache update
- Multi-provider support (Anthropic, OpenAI, Gemini, OpenRouter) via Vercel AI SDK
- Cross-platform binary distribution with GitHub Actions release pipeline

**Phases:**
- Phase 1: Foundation — Config loading, CLI wiring, output formatting, MCP process lifecycle
- Phase 2: Core Engine — AI agent loop, step caching, self-healing, multi-provider support
- Phase 3: Distribution — npm package, standalone binary, GitHub Actions release workflow

---

