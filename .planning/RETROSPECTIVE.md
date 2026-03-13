# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-11
**Phases:** 3 | **Plans:** 9 | **Commits:** 63

### What Was Built
- YAML-based test config with Zod validation and CLI scaffold (Phase 1)
- AI agent loop with Playwright MCP browser automation and curl MCP API testing (Phase 2)
- SHA-256 step caching with self-healing for instant replay on subsequent runs (Phase 2)
- Multi-provider AI support across Anthropic, OpenAI, Gemini, and OpenRouter (Phase 2)
- Cross-platform binary distribution with GitHub Actions release pipeline (Phase 3)

### What Worked
- Strict dependency ordering (Foundation → Core Engine → Distribution) prevented integration issues
- TDD approach with RED/GREEN phases caught interface mismatches early
- Vercel AI SDK proved clean for multi-provider switching — model factory pattern worked well
- Bun-native APIs (file I/O, CryptoHasher, bun:test, bun build --compile) simplified the stack
- Atomic write-then-rename for cache saves prevented corruption scenarios

### What Was Inefficient
- Phase 1 plan checkboxes not fully checked in ROADMAP.md (01-01, 01-02, 01-03 shown as `[ ]` despite having summaries)
- Some test coverage is unit-level mocks rather than true integration with MCP servers

### Patterns Established
- Three-layer config loading: file existence → YAML parse → Zod validate
- Cache-first execution strategy: replay → detect stale → AI fallback → update cache
- Provider inference from model name via ordered regex array
- MCP server lifecycle management with ProcessManager tracking
- Reporter interface with hooks (onTestStart, onTestComplete, onRunComplete)

### Key Lessons
1. Vercel AI SDK's generateText with MCP tools is a clean agent loop — no LangGraph complexity needed
2. StdioClientTransport from @modelcontextprotocol/sdk is the stable MCP transport for Bun (not Experimental_*)
3. Commander.js requires parseAsync() for async actions — parse() returns before completion
4. BUN_BE_BUN=1 env var is essential for bun commands in compiled standalone binaries
5. OIDC trusted publishing needs Node.js >=24 for npm >=11.5.1

### Cost Observations
- Model mix: Opus for execution, Sonnet for verification
- Sessions: 3 (one per phase execution)
- Notable: Full MVP built in ~1 day — wave-based parallel execution kept it fast

---

## Milestone: v0.4 — CI/CD + Team Readiness (Part 2)

**Shipped:** 2026-03-13
**Phases:** 4 | **Plans:** 5 | **Tasks:** 10

### What Was Built
- JUnit XML output format (`--output junit`) with classname, time-in-seconds, per-testcase properties metadata (Phase 14)
- Env var interpolation engine (`${VAR}`, `${VAR:-default}`, `${VAR:?error}`) with post-parse architecture and cache secret prevention (Phase 15)
- GitHub Actions CI workflow with parallel lint/typecheck/test gates and gate aggregator for branch protection (Phase 16)
- Complete contributor onboarding: CONTRIBUTING.md, SECURITY.md, YAML form issue templates, PR template (Phase 17)

### What Worked
- Batch formatter 3-function pattern (output/dryRun/error) established in v0.3 JSON output carried over perfectly to JUnit XML — near-zero design overhead
- TDD with RED/GREEN commits for interpolation engine caught edge cases (escape sequences, partial substitution, batch errors) early
- Post-YAML-parse interpolation architecture was the right call — eliminated an entire class of YAML-special-character bugs
- Template-aware cache hashing keeps secrets out of `.superghost-cache/` without breaking cache key determinism
- Single-caller pattern for `loadConfig` return type change made a breaking API change completely safe

### What Was Inefficient
- v0.3 and v0.4 could have been planned as a single milestone — the split was arbitrary (biome+JSON output vs JUnit+env+CI+docs)
- Phase numbering gap (9 → 14) from earlier milestone scoping left confusing numbering

### Patterns Established
- Batch formatter pattern: 3 functions per output format (formatXOutput, formatXDryRun, formatXError) with same signature
- Gate aggregator pattern for CI: parallel check jobs → single `gate` job with `if: always()` + strict `!= 'success'`
- Post-parse interpolation: always transform the JS object, never the raw YAML string
- Template map threading: config loader → CLI → executor → cache manager for secret prevention

### Key Lessons
1. Post-parse interpolation is inherently safer than pre-parse string manipulation — eliminates YAML injection entirely
2. GitHub YAML form templates are much better than markdown templates — structured data, validation, auto-labels
3. A single gate aggregator job makes branch protection setup trivial and resilient to CI job renames
4. Template literal XML is fine for JUnit output — no need for a DOM builder at this scale

### Cost Observations
- Model mix: Opus for execution, Sonnet for verification and integration checking
- Sessions: 4 (one per phase execution)
- Notable: 14 minutes total execution across 5 plans — wave parallelization not needed (all waves had 1 plan)

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Commits | Phases | Key Change |
|-----------|---------|--------|------------|
| v1.0 | 63 | 3 | Initial build — established TDD, wave execution, verification gates |
| v0.4 | ~15 | 4 | Batch formatter pattern reuse, post-parse interpolation, CI gate aggregation |

### Cumulative Quality

| Milestone | Test Files | LOC | Requirements |
|-----------|-----------|-----|-------------|
| v1.0 | 15+ | 3,787 | 33/33 complete |
| v0.4 | 20+ | 6,813 | 13/13 complete (46 total across all milestones) |

### Top Lessons (Verified Across Milestones)

1. Strict phase dependency ordering prevents integration surprises
2. Cache-first with self-healing is the right pattern for deterministic AI testing
3. Established patterns (batch formatter, reporter interface) dramatically reduce design overhead for new features
4. Post-parse transformation is always safer than pre-parse string manipulation
