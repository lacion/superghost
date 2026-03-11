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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Commits | Phases | Key Change |
|-----------|---------|--------|------------|
| v1.0 | 63 | 3 | Initial build — established TDD, wave execution, verification gates |

### Cumulative Quality

| Milestone | Test Files | LOC | Requirements |
|-----------|-----------|-----|-------------|
| v1.0 | 15+ | 3,787 | 33/33 complete |

### Top Lessons (Verified Across Milestones)

1. Strict phase dependency ordering prevents integration surprises
2. Cache-first with self-healing is the right pattern for deterministic AI testing
