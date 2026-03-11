# Stack Research

**Domain:** AI-powered E2E browser testing CLI tool
**Researched:** 2026-03-10
**Confidence:** HIGH — all versions verified against npm and official docs as of today

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Bun | 1.3.9 | Runtime, package manager, test runner, bundler, binary compiler | Native TypeScript execution without transpilation, 30% faster installs vs Node.js, `bun build --compile` produces standalone cross-platform binaries. Anthropic already ships Claude Code as a Bun binary — proving production readiness at scale. |
| TypeScript | 5.x (via Bun) | Language | Strict mode required; Bun runs `.ts` directly, so no separate transpile step. Type-safe APIs with Zod ensure YAML config errors are caught early. |
| Vercel AI SDK (`ai`) | 6.0.116 | LLM orchestration, agentic tool loops, multi-provider model abstraction | SDK 6 ships the `ToolLoopAgent` abstraction and `stopWhen`/`stepCountIs` loop control for `generateText`. Provides a single unified API across Anthropic, OpenAI, Google, and OpenRouter — swap model with two lines. No LangChain dependency. Strongly typed. 2M+ weekly downloads. |
| `@ai-sdk/mcp` | 1.0.25 | MCP client for connecting AI agent to Playwright/curl MCP servers | Provides `createMCPClient` and `Experimental_StdioMCPTransport` for stdio-based MCP servers (which is how `@playwright/mcp` runs). The `client.tools()` method returns AI SDK-compatible tool definitions that plug directly into `generateText`. Stable as of AI SDK 6. |
| `@playwright/mcp` | 0.0.68 | Browser automation via MCP protocol | Microsoft's official Playwright MCP server. Exposes browser tools (navigate, click, type, snapshot) to the AI agent through MCP. Accessibility-snapshot-based — text only, no vision model required. Spawned as a stdio subprocess per test. |
| Commander.js | 14.0.3 | CLI argument parsing | 118K+ dependent packages, the de-facto standard for Node/Bun CLIs. Simple, well-typed, no runtime dependencies. Proven for a `superghost --config tests.yaml` entrypoint with one primary command and no subcommand tree needed. |
| Zod | 4.3.6 | YAML config schema validation | v4 is 14x faster than v3. Provides first-class TypeScript inference: parse the YAML object through a Zod schema and get a fully typed config. Schema-level error messages surface human-readable config failures (e.g., "tests: at least one test case required"). Ships its own type definitions. |
| `yaml` | 2.8.2 | YAML file parsing | The canonical YAML parser for JavaScript/TypeScript. No dependencies, ships its own types. Straightforward: `yaml.parse(content)` returns a plain object, then Zod validates it. |

### Provider Packages

| Package | Version | Provider | Notes |
|---------|---------|---------|-------|
| `@ai-sdk/anthropic` | 3.0.58 | Anthropic (Claude) | Default provider. Claude Sonnet/Opus models recommended as the AI agent. Auto-infer from model name pattern. |
| `@ai-sdk/openai` | 3.0.41 | OpenAI (GPT-4o, o3) | Official provider. Import: `import { openai } from '@ai-sdk/openai'`. |
| `@ai-sdk/google` | 3.0.49 | Google Gemini | Official provider. Import: `import { google } from '@ai-sdk/google'`. |
| `@openrouter/ai-sdk-provider` | 2.2.5 | OpenRouter (300+ models) | Community provider maintained by OpenRouter team. Gives access to Llama, Mistral, etc. via one API key. `import { openrouter } from '@openrouter/ai-sdk-provider'`. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@mcp-get-community/server-curl` | latest | HTTP/API test execution via MCP | API tests that don't need a browser. Auto-detected by the agent from test case description. Spawned alongside Playwright MCP per test. |
| `chalk` | 5.4.x | Terminal color output | Pass/fail/skip coloring in test output. ESM-only (v5+), which is fine for Bun. Import: `import chalk from 'chalk'`. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `bun test` | Unit and integration testing | Built into Bun, Jest-compatible API. No vitest or jest dependency needed. Use for testing cache logic, config parsing, hash generation. |
| `bun build --compile` | Standalone binary compilation | Produces a self-contained executable with the Bun runtime embedded. Use `--target=bun-linux-x64` etc. for cross-platform builds. Produces a binary users can run without installing Bun. |
| TypeScript strict mode | Type safety | `"strict": true` in tsconfig. Bun respects tsconfig. No separate `tsc` invocation needed for running — only for type checking. |

---

## Installation

```bash
# Core runtime
bun add ai @ai-sdk/mcp

# Providers — include all four at launch
bun add @ai-sdk/anthropic @ai-sdk/openai @ai-sdk/google @openrouter/ai-sdk-provider

# Browser and API MCP servers
bun add @playwright/mcp @mcp-get-community/server-curl

# Config and CLI
bun add commander zod yaml

# Output
bun add chalk
```

```bash
# Dev — nothing extra needed (bun test is built-in, TypeScript is built-in)
# Optional: type checking only
bun add -D typescript
```

---

## Alternatives Considered

| Category | Recommended | Alternative | When to Use Alternative |
|----------|-------------|-------------|-------------------------|
| AI orchestration | Vercel AI SDK (`ai`) | LangChain / LangGraph | LangChain if the team already has LangGraph workflows or needs Bedrock/Vertex provider. SuperGhost explicitly rejects this — Vercel AI SDK is the constraint. |
| AI orchestration | Vercel AI SDK (`ai`) | OpenAI Agents SDK | Only if you're building an OpenAI-only product. The Agents SDK doesn't support Anthropic or Google. |
| Runtime | Bun | Node.js 22 | Node if Bun compatibility issues arise with a dependency. Very unlikely given Node.js compat layer in Bun 1.2+. |
| CLI framework | Commander.js | Clipanion | Clipanion is worth considering if the CLI grows to 5+ subcommands (it's how Yarn is built). For a single-command tool like SuperGhost, Commander is simpler and more familiar. |
| CLI framework | Commander.js | CAC / Gunshi | Gunshi is emerging but ecosystem is tiny. Commander has 118K dependents and full TypeScript support. |
| YAML parsing | `yaml` | `js-yaml` | `js-yaml` is fine but `yaml` has better YAML 1.2 compliance and is the recommended choice for JavaScript. |
| Config validation | Zod 4 | Valibot | Valibot has a smaller bundle but Zod 4 is now on par in size and 14x faster. Zod has far more ecosystem integrations. |
| Browser automation | `@playwright/mcp` | `mcp-playwright` (executeautomation) | `@playwright/mcp` is the Microsoft-maintained official package. `mcp-playwright` is a community alternative — avoid it to stay on the maintainer-supported path. |
| Output styling | chalk | picocolors | picocolors is 3x smaller, but chalk 5 is ESM-native and sufficient for a CLI. SuperGhost uses picocolors for binary size efficiency. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| LangChain / LangGraph | These add a large, complex dependency tree with their own abstractions that fight the Vercel AI SDK. SuperGhost uses the Vercel AI SDK directly. | Vercel AI SDK `ai` + `@ai-sdk/mcp` |
| `playwright` (direct API) | Direct Playwright bypasses MCP, breaking the architecture. The agent can only record cacheable steps if it drives the browser through MCP tool calls. | `@playwright/mcp` via `createMCPClient` + stdio transport |
| `puppeteer` | Chrome-only, no MCP server, no accessibility snapshot mode. Playwright covers all browsers and is the superior choice for natural language E2E testing. | `@playwright/mcp` |
| Vercel AI SDK v4 / v5 | AI SDK 6 (current: 6.0.116) introduces the stable `ToolLoopAgent`, `stopWhen`/`stepCountIs` loop control, and stable MCP support. Earlier versions require `maxSteps` workarounds and have experimental MCP APIs. | `ai@^6.0.0` |
| `@ai-sdk/mcp` as `experimental_createMCPClient` (old import) | The function moved from `ai` to `@ai-sdk/mcp` as a stable export in SDK 6. Using the old import path will break or require version pinning. | `import { createMCPClient } from '@ai-sdk/mcp'` |
| Zod v3 | v3 is 14x slower than v4 and will eventually reach end of life. v4 is the current stable release (4.3.6). | `zod@^4.0.0` |
| `node:crypto` for hashing | Use Bun's native `Bun.hash()` or `new Bun.CryptoHasher("sha256")` instead. Bun's built-in hashing is faster and avoids the Node.js compat layer for this hot path. | `Bun.CryptoHasher` |
| `fs` / `path` (Node.js APIs) for file I/O | Bun provides `Bun.file()`, `Bun.write()`, `Bun.mkdir()` which are significantly faster than the Node.js fs module. Use them for cache read/write. | `Bun.file()` / `Bun.write()` |

---

## Stack Patterns by Variant

**For the AI agent execution loop:**
- Use `generateText` from `ai` with `stopWhen: stepCountIs(50)` as the safety ceiling
- Use `@ai-sdk/mcp` `createMCPClient` with `Experimental_StdioMCPTransport` to spawn `@playwright/mcp` as a subprocess
- Intercept tool calls in a recording wrapper before replaying via the MCP client's direct tool invocation (not via the AI)
- Close the MCP client after each test via `client.close()` to terminate the subprocess

**For provider selection at runtime:**
- Use a switch on the user's `model` string to select the right provider factory
- Pattern: detect prefix (`claude-` → anthropic, `gpt-` or `o1-` or `o3-` → openai, `gemini-` → google, everything else → openrouter)
- This avoids requiring users to set `modelProvider` explicitly

**For Bun-native binary distribution:**
- Package as an npm package with `"bin": { "superghost": "./dist/cli.js" }` for `bunx superghost` usage
- Additionally ship a compiled binary via `bun build --compile src/cli.ts --outfile superghost` for users who want zero-dependency execution

**For cache hashing:**
- Use `new Bun.CryptoHasher("sha256").update(testCase + "|" + baseUrl).digest("hex").slice(0, 16)` — no external dependency

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `ai@6.x` | `@ai-sdk/mcp@1.x` | Both are part of the AI SDK v6 release train. Always upgrade together. |
| `ai@6.x` | `@ai-sdk/anthropic@3.x`, `@ai-sdk/openai@3.x`, `@ai-sdk/google@3.x` | Provider packages use a separate major version (3.x) aligned to SDK 6. |
| `@playwright/mcp@0.0.68` | `@playwright/test` (latest) | `@playwright/mcp` bundles its own Playwright install. You do NOT need a separate `playwright` package. |
| `zod@4.x` | `ai@6.x` | AI SDK 6 supports any Standard JSON Schema library, including Zod 4. No compatibility issues. |
| `commander@14.x` | Bun 1.3.x | Fully compatible. Commander is pure JavaScript/TypeScript with no native dependencies. |
| `chalk@5.x` | Bun 1.3.x | chalk 5 is ESM-only. Bun handles ESM natively — no issues. |

---

## Sources

- `ai` npm package — version 6.0.116 confirmed via [npm search](https://www.npmjs.com/search?q=AI)
- `@ai-sdk/anthropic` — version 3.0.58 via [npm](https://www.npmjs.com/package/@ai-sdk/anthropic?activeTab=versions)
- `@ai-sdk/openai` — version 3.0.41 via [npm](https://www.npmjs.com/package/@ai-sdk/openai)
- `@ai-sdk/google` — version 3.0.49 via [npm](https://www.npmjs.com/package/@ai-sdk/google)
- `@ai-sdk/mcp` — version 1.0.25 via [npm](https://www.npmjs.com/package/@ai-sdk/mcp)
- `@openrouter/ai-sdk-provider` — version 2.2.5 via [npm](https://www.npmjs.com/package/@openrouter/ai-sdk-provider)
- `@playwright/mcp` — version 0.0.68 via [npm](https://www.npmjs.com/package/@playwright/mcp)
- `commander` — version 14.0.3 via [npm](https://www.npmjs.com/package/commander)
- `zod` — version 4.3.6 via [npm](https://www.npmjs.com/package/zod)
- `yaml` — version 2.8.2 via [npm](https://www.npmjs.com/package/yaml)
- `chalk` — version 5.6.2 via [npm](https://www.npmjs.com/package/chalk)
- Bun — version 1.3.9 (latest) via [GitHub releases](https://github.com/oven-sh/bun/releases)
- [AI SDK 6 release blog](https://vercel.com/blog/ai-sdk-6) — SDK 6 feature set and breaking changes
- [AI SDK MCP docs](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools) — `createMCPClient` and transport APIs
- [AI SDK Tool Calling docs](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling) — `stopWhen`, `stepCountIs`, `generateText` API
- [AI SDK Anthropic provider docs](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic) — model IDs and configuration
- [Bun standalone executables](https://bun.com/docs/bundler/executables) — `bun build --compile` documentation

---

*Stack research for: SuperGhost — AI-powered E2E browser testing CLI tool*
*Researched: 2026-03-10*
