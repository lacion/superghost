---
status: complete
phase: 02-core-engine
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-04-SUMMARY.md]
started: 2026-03-11T12:30:00Z
updated: 2026-03-11T12:35:00Z
---

## Current Test

[testing complete]

## Tests

### 1. API Key Validation at Startup
expected: Run `bunx superghost --config <your-config.yaml>` without setting the required API key env var. CLI exits with clear error naming the specific env var and provider. No tests run.
result: pass

### 2. Browser Test Execution via Playwright MCP
expected: With a valid API key and a browser-type test in config, run `bunx superghost --config <config.yaml>`. Playwright MCP server spawns, browser opens (or runs headless), AI agent navigates and performs assertions, test result shows pass/fail with a message. Reporter displays test name, status, and "ai" as the source.
result: pass

### 3. API Test Execution via curl MCP (No Browser)
expected: With a test configured as `type: api`, run `bunx superghost`. The curl MCP server is used instead of Playwright. No browser window opens. AI agent makes HTTP requests and validates responses. Result shows pass/fail.
result: pass

### 4. Cache Replay on Second Run
expected: Run the same test twice. First run uses AI agent (takes seconds). Second run replays from cache and completes near-instantly (~50ms). Reporter should indicate the source is "cache" on the second run.
result: pass

### 5. Self-Healing Stale Cache
expected: After a cached test exists, if the underlying page/API changes making the cache stale, the next run detects replay failure, re-executes via AI agent, and updates the cache. Reporter shows "ai, self-healed" as the source indicator with a dim note.
result: pass

### 6. API Key Error Formatting
expected: The API key error message at the terminal is well-formatted — not a raw stack trace. It should clearly state which provider needs which env var (e.g., "Set OPENAI_API_KEY" for gpt models, "Set GOOGLE_GENERATIVE_AI_API_KEY" for gemini models).
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0

## Gaps

[none yet]
