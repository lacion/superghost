# Milestones

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

