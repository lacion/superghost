# Feature Research

**Domain:** AI-powered E2E browser + API testing CLI tool
**Researched:** 2026-03-10
**Confidence:** HIGH (reference implementation inspected directly; competitor feature sets verified via official sites and WebSearch)

---

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Plain English test cases | The entire value prop. Users come because they don't want to write Playwright code. | LOW | `case: "check login is working"` in YAML. Proven pattern in natural language E2E testing tools like testRigor, KaneAI. |
| YAML config, zero code | Aligns with how AI-native teams configure tools. Matches competitor norms. | LOW | Zod validation required. Per-test overrides for `baseUrl` and `timeout` add real value. |
| CI/CD exit codes (0 / 1) | Without correct exit codes the tool can't be used in any pipeline. Users will drop it immediately. | LOW | Exit 0 = all pass, exit 1 = any fail or config error. Non-negotiable for pipeline integration. |
| Deterministic summary output | Teams need to read results in logs. Pass/fail/timing per test + summary row. | LOW | SuperGhost output format: `[PASS]`, `[FAIL]` with source (cache/ai) and timing. |
| Browser test execution via real browser | "Real browser" is the key trust signal. Headless Chromium minimum; Playwright MCP is the proven mechanism. | MEDIUM | Playwright MCP (`@playwright/mcp`) handles navigation, click, type, snapshot via MCP protocol. |
| Auto-detect API vs browser tests | Users write both types of tests in one config. Auto-detection based on natural language description avoids per-test flags. | MEDIUM | HTTP verbs (GET, POST) or URL-pattern descriptions trigger API path via curl MCP. |
| Configurable browser (chromium/firefox/webkit) | QA teams expect multi-browser targeting even if chromium is default. | LOW | Three options match what Playwright supports: `chromium`, `firefox`, `webkit`. |
| Headless mode toggle | Required for debugging. `headless: false` lets devs watch the browser run. | LOW | Boolean flag; default `true` for CI, `false` for local debugging. |
| Per-test timeout + global timeout | Long-running tests break short-running suites without this. Inherited-plus-override pattern is idiomatic. | LOW | Global default 60s; per-test override in YAML. |
| Multi-provider LLM support | Teams use different API providers. Being locked to a single provider is a blocker for enterprise users and a frequent complaint against tools with hard vendor coupling. | MEDIUM | SuperGhost targets Anthropic, OpenAI, Gemini, OpenRouter via Vercel AI SDK. |
| Max retries / attempt limit | AI agents fail intermittently. Without retry logic, flaky AI responses cause false test failures. | LOW | `maxAttempts: 3` (1–10 range). Log each failure reason. |
| Error messages on failure | Users must know WHY a test failed, not just THAT it failed. | LOW | Print the AI's last failure reason from the test step. SuperGhost prints the agent's diagnostic message. |

---

### Differentiators (Competitive Advantage)

Features that set the product apart from raw browser automation tools and from cloud-hosted testing platforms.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Step caching with ~50ms replay | Makes AI-driven testing viable for CI/CD at scale. Without this, 30 tests at 10s each = 5 minutes. With caching, 30 tests at 50ms each = 1.5 seconds. This is the core moat. | HIGH | SHA-256 hash of `(case + baseUrl)` as cache key. Stored as JSON in `.superghost-cache/`. Cache-first, fallback to AI. |
| Self-healing cache | When the UI changes, stale cache is detected and AI automatically re-executes and updates the cache. Users never manually maintain tests. | HIGH | Cache replay fails → AI re-runs → if AI passes, cache updated; if AI fails, cache deleted. This is the "auto-maintenance" story. |
| Cache invalidation on description change | Changing the test case wording automatically busts the cache. Users never accidentally run stale tests against changed intent. | LOW | Hash includes the case string. Rename the case = fresh AI run. Builds user trust. |
| Human-readable cache files | Cache stored as JSON with `testCase`, `baseUrl`, `steps` array. Developers can inspect and reason about what the AI decided to do. | LOW | Helps debugging. Contrast with black-box caching in other tools. |
| Configurable cache directory | Teams can put cache in `.gitignore` or version-control a shared cache as a strategy choice. | LOW | `cacheDir` config option. Default `.superghost-cache/`. |
| Bun-native compiled binary | `bunx superghost` with no install. Also distributes as a standalone compiled binary via `bun build --compile`. No Node.js required. | MEDIUM | Faster startup than Node. Aligns with modern TS toolchain. Standalone binary simplifies CI runner setup. |
| Source attribution in output | Each test result shows whether it ran via `cache` or `ai`. Teams can see exactly how fast/slow their suite is and which tests need warm-up. | LOW | `[PASS] check login (cache, 45ms)` vs `[PASS] check login (ai, 8.2s)`. Builds trust in the tool. |
| OpenRouter support | Lets users route to any model from a single API key. Useful for cost optimization, model experimentation, and teams already on OpenRouter. | LOW | Vercel AI SDK supports OpenRouter out of the box. Low implementation cost, high user value. |

---

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem like natural extensions but create more problems than they solve for a v1 CLI tool.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| GUI / Dashboard | "I want to see results visually." | Adds a full web product on top of a CLI tool. Doubles scope, requires auth, hosting, data storage. Distracts from the core value of simplicity. | Rich terminal output with pass/fail/timing. Pipe output to existing dashboards (Datadog, Grafana) via exit codes and stdout. |
| Parallel test execution | "My suite is slow, run tests in parallel." | Browser contexts at scale require resource management. Parallel AI calls multiply LLM cost and rate-limit risk. Sequential determinism is easier to reason about in CI logs. | Implement sequential first. Step caching achieves ~50ms per cached test, which is fast enough for most suites. Parallel execution is a v2 feature after sequential is rock-solid. |
| Visual regression testing | "Check if the page looks different." | Requires screenshot diffing, pixel comparison, baseline management, and a separate review workflow. Completely different domain from functional E2E testing. | AI-powered functional assertions already verify "the page looks right" implicitly. Dedicated tools (Percy, Chromatic) do visual regression better. |
| Test generation from app crawling | "Auto-discover what to test by crawling the app." | Crawler-generated tests are low signal. They don't express intent. They break on layout changes. Users end up curating generated tests anyway — they may as well write them. | Users write test cases in plain English. The constraint is the feature: authored tests express intent, not just reachable states. |
| Cloud-hosted execution | "Run my tests in your cloud." | Infrastructure, billing, security, multi-tenancy. Turns a tool into a SaaS product. | Local/CI runner covers the primary use case. Users bring their own runner (GitHub Actions, CircleCI, etc.). |
| Test tags / groups / suites | "I want to run only smoke tests." | Config schema complexity grows fast. Users end up learning a mini DSL instead of writing tests. | v1: run all tests. v2: `--config smoke-tests.yaml`. Multiple config files solve the use case without schema complexity. |
| Slack / webhook notifications | "Alert me when tests fail." | CI/CD already handles this. GitHub Actions notifies on pipeline failure. Adding notifications duplicates existing infrastructure. | Exit code 1 is the notification. Teams integrate with their existing alerting via pipeline failure hooks. |
| Per-step assertions in YAML | "I want to assert X at step 3." | Turns the config into a test programming language. The AI already implicitly asserts based on the test description. Explicit step assertions duplicate the AI's job. | Write a more specific natural language case: "verify that the success message appears after submitting the form." The AI will assert it. |

---

## Feature Dependencies

```
[YAML Config + Zod Validation]
    └──requires──> [CLI Entry Point]
                       └──requires──> [AI Agent (Vercel AI SDK)]
                                          ├──requires──> [Playwright MCP (browser tests)]
                                          └──requires──> [curl MCP (API tests)]

[Step Caching]
    └──requires──> [AI Agent] (cache stores what AI decides to do)
    └──requires──> [SHA-256 Cache Key] (deterministic hash of case + baseUrl)

[Self-Healing]
    └──requires──> [Step Caching] (nothing to heal if no cache)
    └──requires──> [AI Agent] (AI re-runs on cache failure)

[Auto-detect API vs Browser]
    └──requires──> [AI Agent] (agent selects tool set based on test description)
    └──requires──> [Playwright MCP + curl MCP both configured]

[Multi-provider LLM]
    └──requires──> [Vercel AI SDK] (provider abstraction layer)
    └──enhances──> [AI Agent] (swap model without changing agent code)

[CI/CD Exit Codes]
    └──requires──> [Test Runner] (aggregates pass/fail across all tests)
    └──enhances──> [Summary Output] (exit code + human-readable summary together)

[Compiled Binary (bun build --compile)]
    └──requires──> [Bun runtime] (bun-specific compilation target)
    └──enhances──> [CI/CD usage] (no runtime install needed on runner)

[Parallel Execution] ──conflicts──> [Sequential Determinism]
    (sequential is simpler; parallel adds resource/cost/flakiness complexity)

[GUI Dashboard] ──conflicts──> [CLI-first simplicity]
    (adding a web UI changes the product category entirely)
```

### Dependency Notes

- **Self-healing requires step caching:** Self-healing is a property of the cache lifecycle, not a standalone feature. You cannot implement self-healing without first implementing caching.
- **Auto-detect requires both MCP servers:** The AI agent selects tools from its tool list. If curl MCP is not configured, API tests silently fall back to browser (or fail). Both must be present.
- **Multi-provider enhances AI agent:** The agent orchestration code is the same regardless of provider. Multi-provider is an SDK-layer feature, not an agent redesign.
- **Parallel execution conflicts with sequential determinism:** Sequential execution makes CI logs readable and test isolation trivial. Parallel adds concurrency bugs, rate-limit risk, and resource contention. Defer to v2.

---

## MVP Definition

### Launch With (v1)

Minimum viable product — what's needed to validate the natural language E2E testing concept.

- [x] Plain English test cases via YAML (`case: "..."`) — core value prop
- [x] Zod-validated YAML config with sensible defaults — `baseUrl`, `browser`, `headless`, `timeout`, `maxAttempts`, `model`, `modelProvider`, `cacheDir`
- [x] CLI entry point (`superghost --config tests.yaml`) — the interface
- [x] AI agent executes tests via Playwright MCP (browser) and curl MCP (API) — execution engine
- [x] Auto-detect API vs browser based on test case description — removes per-test type flags
- [x] Step caching — SHA-256 hash key, JSON storage, cache-first execution — the performance moat
- [x] Self-healing — cache replay failure triggers AI re-run, cache update on success, cache delete on failure — the maintenance moat
- [x] Multi-provider LLM support (Anthropic, OpenAI, Gemini, OpenRouter) via Vercel AI SDK — unblocks enterprise users
- [x] CI/CD exit codes (0/1) and summary output — required for any pipeline integration
- [x] Sequential test execution with independent browser contexts per test — safe, simple, debuggable
- [x] Configurable: browser type, headless mode, timeout, max retries, model, cache dir — matches reference
- [x] Bun-native distribution: `bunx`, npm package, and standalone compiled binary — modern distribution

### Add After Validation (v1.x)

Features to add once the core test-run loop is proven.

- [ ] `--no-cache` / `--clear-cache` CLI flags — When users report wanting to force fresh AI runs without deleting the directory manually
- [ ] `--only <pattern>` flag to run a subset of tests — When users have large suites and need faster iteration on individual tests
- [ ] Verbose mode (`--verbose`) showing step-level AI actions — When users report difficulty debugging failing tests
- [ ] JSON output mode (`--output json`) for machine-readable results — When teams want to parse results in scripts or send to monitoring
- [ ] Per-test `skip` flag in YAML — When users need to temporarily disable tests without deleting them

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] Parallel test execution — Defer until sequential is proven at scale; adds significant complexity
- [ ] Watch mode (`--watch`) for re-running on file changes — Nice DX but not a CI/CD concern; requires file watcher
- [ ] Multiple config file support with shared base config — When users have many test suites with shared settings
- [ ] Test tagging / grouping — When users need smoke vs regression vs integration test splits
- [ ] HTML report output — When teams want shareable test reports outside the terminal

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Plain English YAML test cases | HIGH | LOW | P1 |
| Step caching (~50ms replay) | HIGH | HIGH | P1 |
| Self-healing cache | HIGH | MEDIUM | P1 |
| CI/CD exit codes + summary | HIGH | LOW | P1 |
| AI agent via Playwright MCP | HIGH | MEDIUM | P1 |
| Auto-detect API vs browser | HIGH | MEDIUM | P1 |
| Multi-provider LLM support | HIGH | MEDIUM | P1 |
| Configurable browser/headless/timeout | MEDIUM | LOW | P1 |
| Bun compiled binary | MEDIUM | LOW | P1 |
| Source attribution in output (cache/ai) | MEDIUM | LOW | P1 |
| `--no-cache` / `--clear-cache` flags | MEDIUM | LOW | P2 |
| `--only` pattern filtering | MEDIUM | LOW | P2 |
| Verbose / step-level debug output | MEDIUM | LOW | P2 |
| JSON output mode | LOW | LOW | P2 |
| Parallel execution | HIGH | HIGH | P3 |
| Watch mode | LOW | MEDIUM | P3 |
| HTML report | LOW | MEDIUM | P3 |
| GUI / Dashboard | MEDIUM | HIGH | Never (v1) |
| Visual regression testing | LOW | HIGH | Never (v1) |
| Cloud-hosted execution | LOW | HIGH | Never (v1) |

---

## Competitor Feature Analysis

| Feature | testRigor | Momentic | ZeroStep | SuperGhost |
|---------|-----------|----------|----------|------------|
| Plain English test authoring | GUI-based natural language | Low-code editor + NL prompts | Inline NL in Playwright code | YAML `case:` field |
| Step caching | No (cloud execution, always fresh) | No | No | SHA-256 hash, JSON, ~50ms replay |
| Self-healing | AI-powered locator healing | Intent-based selectors | Runtime self-correction | Cache lifecycle auto-updates |
| Multi-provider LLM | Proprietary (no choice) | Proprietary | GPT-3.5/4 only | Vercel AI SDK (Anthropic, OpenAI, Gemini, OpenRouter) |
| CI/CD exit codes | Yes | Yes | Yes (inherits Playwright) | Yes (0/1) |
| API testing | Yes | No (web only) | No | Auto-detected via curl MCP |
| Browser testing | Cloud browsers | Chromium (cloud) | Playwright (local) | Playwright MCP (local) |
| CLI / code-free | No (requires GUI setup) | No (requires GUI) | No (requires Playwright code) | Yes (`bunx superghost`) |
| Open source / local runner | SaaS only | SaaS only | Requires ZeroStep cloud API | Open (MIT target), runs locally |
| Compiled binary | N/A | N/A | N/A | Yes (`bun build --compile`) |

**Key differentiator from all competitors:** SuperGhost is the only approach that combines plain-English YAML config + step caching + self-healing + local/CI execution without a SaaS dependency. All cloud-hosted competitors (testRigor, Momentic) require account setup, have per-test costs on every run, and cannot run in isolated CI environments. ZeroStep requires existing Playwright code. SuperGhost requires nothing but a YAML file and an LLM API key.

---

## Sources

- [Playwright Test Agents docs](https://playwright.dev/docs/test-agents) — Playwright MCP, agent types (Planner, Generator, Healer)
- [ZeroStep](https://zerostep.com/) — NL-in-Playwright approach, GPT integration
- [Momentic](https://momentic.ai) — intent-based selectors, low-code authoring, SaaS model
- [testRigor vs Mabl comparison](https://testrigor.com/alternative/mabl/) — feature differences in plain-English testing
- [TestDriver.ai GitHub](https://github.com/testdriverai/cli) — vision-based agent, headless CI mode
- [Self-Healing Test Automation Guide (Momentic)](https://momentic.ai/blog/self-healing-test-automation-guide) — self-healing patterns
- [AI E2E Testing paradigm overview (DEV)](https://dev.to/pietrocontadini/ai-powered-end-to-end-testing-a-new-paradigm-for-software-quality-assurance-1f5n) — retry logic, progressive context enrichment
- [Playwright AI revolution (testomat.io)](https://testomat.io/blog/playwright-ai-revolution-in-test-automation/) — accessibility tree vs DOM selectors
- [Best E2E Testing Tools 2026 (VirtuosoQA)](https://www.virtuosoqa.com/post/best-end-to-end-testing-tools) — market survey

---

*Feature research for: AI-powered E2E browser + API testing CLI tool (SuperGhost)*
*Researched: 2026-03-10*
