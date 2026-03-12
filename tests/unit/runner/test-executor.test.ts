import { beforeEach, describe, expect, it, mock } from "bun:test";

import { type AgentExecutionResult } from "../../../src/agent/types.ts";
import { type CacheManager } from "../../../src/cache/cache-manager.ts";
import { type StepReplayer } from "../../../src/cache/step-replayer.ts";
import { type CachedStep, type CacheEntry } from "../../../src/cache/types.ts";
import { TestExecutor } from "../../../src/runner/test-executor.ts";

/** Creates a mock CacheManager */
function createMockCacheManager() {
  return {
    load: mock(() => Promise.resolve(null as CacheEntry | null)),
    save: mock(() => Promise.resolve()),
    delete: mock(() => Promise.resolve()),
  } as unknown as CacheManager & {
    load: ReturnType<typeof mock>;
    save: ReturnType<typeof mock>;
    delete: ReturnType<typeof mock>;
  };
}

/** Creates a mock StepReplayer */
function createMockReplayer() {
  return {
    replay: mock(() => Promise.resolve({ success: true })),
  } as unknown as StepReplayer & {
    replay: ReturnType<typeof mock>;
  };
}

/** Creates a mock executeAgent function */
function createMockExecuteAgent() {
  return mock(
    () =>
      Promise.resolve({
        passed: true,
        message: "Test passed",
        steps: [{ toolName: "click", toolInput: { selector: "#btn" } }],
      }) as Promise<AgentExecutionResult>,
  );
}

const FAKE_STEPS: CachedStep[] = [
  { toolName: "navigate", toolInput: { url: "https://example.com" } },
  { toolName: "click", toolInput: { selector: "#login" } },
];

const FAKE_CACHE_ENTRY: CacheEntry = {
  version: 1,
  testCase: "check login works",
  baseUrl: "https://example.com",
  steps: FAKE_STEPS,
  model: "claude-sonnet-4-6",
  provider: "anthropic",
  stepCount: 2,
  aiMessage: "Test passed",
  durationMs: 5000,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const DEFAULT_CONFIG = {
  maxAttempts: 3,
  recursionLimit: 500,
  model: "claude-sonnet-4-6",
  modelProvider: "anthropic",
  context: undefined,
};

describe("TestExecutor", () => {
  let cacheManager: ReturnType<typeof createMockCacheManager>;
  let replayer: ReturnType<typeof createMockReplayer>;
  let executeAgentFn: ReturnType<typeof createMockExecuteAgent>;
  let executor: TestExecutor;

  beforeEach(() => {
    cacheManager = createMockCacheManager();
    replayer = createMockReplayer();
    executeAgentFn = createMockExecuteAgent();
    executor = new TestExecutor({
      cacheManager: cacheManager as unknown as CacheManager,
      replayer: replayer as unknown as StepReplayer,
      executeAgentFn,
      config: DEFAULT_CONFIG,
    });
  });

  describe("cache hit + replay success", () => {
    it("returns passed/cache and does NOT call agent", async () => {
      cacheManager.load.mockResolvedValue(FAKE_CACHE_ENTRY);
      replayer.replay.mockResolvedValue({ success: true });

      const result = await executor.execute("check login works", "https://example.com");

      expect(result.status).toBe("passed");
      expect(result.source).toBe("cache");
      expect(result.selfHealed).toBeUndefined();
      expect(executeAgentFn).not.toHaveBeenCalled();
      expect(cacheManager.save).not.toHaveBeenCalled();
    });
  });

  describe("cache hit + replay fail + agent success (self-healing)", () => {
    it("returns passed/ai/selfHealed=true and saves new cache", async () => {
      cacheManager.load.mockResolvedValue(FAKE_CACHE_ENTRY);
      replayer.replay.mockResolvedValue({
        success: false,
        failedStep: 1,
        error: "Element not found",
      });
      executeAgentFn.mockResolvedValue({
        passed: true,
        message: "Re-executed and passed",
        steps: [{ toolName: "click", toolInput: { selector: "#new-btn" } }],
      });

      const result = await executor.execute("check login works", "https://example.com");

      expect(result.status).toBe("passed");
      expect(result.source).toBe("ai");
      expect(result.selfHealed).toBe(true);
      expect(cacheManager.save).toHaveBeenCalledTimes(1);
      expect(cacheManager.delete).not.toHaveBeenCalled();
    });
  });

  describe("cache hit + replay fail + agent fail (1 attempt)", () => {
    it("returns failed and deletes stale cache", async () => {
      cacheManager.load.mockResolvedValue(FAKE_CACHE_ENTRY);
      replayer.replay.mockResolvedValue({
        success: false,
        failedStep: 0,
        error: "Navigation failed",
      });
      executeAgentFn.mockResolvedValue({
        passed: false,
        message: "Could not find login form",
        steps: [],
      });

      const singleAttemptExecutor = new TestExecutor({
        cacheManager: cacheManager as unknown as CacheManager,
        replayer: replayer as unknown as StepReplayer,
        executeAgentFn,
        config: { ...DEFAULT_CONFIG, maxAttempts: 1 },
      });

      const result = await singleAttemptExecutor.execute("check login works", "https://example.com");

      expect(result.status).toBe("failed");
      expect(result.source).toBe("ai");
      expect(cacheManager.delete).toHaveBeenCalledTimes(1);
      expect(executeAgentFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("cache hit + replay fail + agent fail (3 attempts)", () => {
    it("retries 3 times then fails and deletes stale cache", async () => {
      cacheManager.load.mockResolvedValue(FAKE_CACHE_ENTRY);
      replayer.replay.mockResolvedValue({
        success: false,
        failedStep: 0,
        error: "Navigation failed",
      });
      executeAgentFn.mockResolvedValue({
        passed: false,
        message: "Failed on attempt",
        steps: [],
      });

      const result = await executor.execute("check login works", "https://example.com");

      expect(result.status).toBe("failed");
      expect(executeAgentFn).toHaveBeenCalledTimes(3);
      expect(cacheManager.delete).toHaveBeenCalledTimes(1);
    });
  });

  describe("cache miss + agent success", () => {
    it("returns passed/ai and saves cache", async () => {
      cacheManager.load.mockResolvedValue(null);
      executeAgentFn.mockResolvedValue({
        passed: true,
        message: "Test passed on first try",
        steps: [{ toolName: "click", toolInput: { selector: "#btn" } }],
      });

      const result = await executor.execute("check login works", "https://example.com");

      expect(result.status).toBe("passed");
      expect(result.source).toBe("ai");
      expect(result.selfHealed).toBeUndefined();
      expect(replayer.replay).not.toHaveBeenCalled();
      expect(cacheManager.save).toHaveBeenCalledTimes(1);
    });
  });

  describe("cache miss + agent fail (all attempts)", () => {
    it("returns failed with last error message", async () => {
      cacheManager.load.mockResolvedValue(null);
      executeAgentFn
        .mockResolvedValueOnce({
          passed: false,
          message: "First attempt failed",
          steps: [],
        })
        .mockResolvedValueOnce({
          passed: false,
          message: "Second attempt failed",
          steps: [],
        })
        .mockResolvedValueOnce({
          passed: false,
          message: "Third attempt failed",
          steps: [],
        });

      const result = await executor.execute("check login works", "https://example.com");

      expect(result.status).toBe("failed");
      expect(result.source).toBe("ai");
      expect(result.error).toBe("Third attempt failed");
      expect(executeAgentFn).toHaveBeenCalledTimes(3);
      expect(cacheManager.save).not.toHaveBeenCalled();
      expect(cacheManager.delete).not.toHaveBeenCalled();
    });
  });

  describe("cache miss + agent fail then success on 3rd attempt", () => {
    it("retries and returns passed/ai on success, saves cache", async () => {
      cacheManager.load.mockResolvedValue(null);
      executeAgentFn
        .mockResolvedValueOnce({
          passed: false,
          message: "First attempt failed",
          steps: [],
        })
        .mockResolvedValueOnce({
          passed: false,
          message: "Second attempt failed",
          steps: [],
        })
        .mockResolvedValueOnce({
          passed: true,
          message: "Third attempt passed",
          steps: [{ toolName: "click", toolInput: { selector: "#btn" } }],
        });

      const result = await executor.execute("check login works", "https://example.com");

      expect(result.status).toBe("passed");
      expect(result.source).toBe("ai");
      expect(executeAgentFn).toHaveBeenCalledTimes(3);
      expect(cacheManager.save).toHaveBeenCalledTimes(1);
    });
  });

  describe("error diagnostics", () => {
    it("includes AI agent diagnostic message in TestResult.error on failure", async () => {
      cacheManager.load.mockResolvedValue(null);
      executeAgentFn.mockResolvedValue({
        passed: false,
        message: "Login form not found on page — the page showed a 404 error",
        steps: [],
      });

      const singleAttemptExecutor = new TestExecutor({
        cacheManager: cacheManager as unknown as CacheManager,
        replayer: replayer as unknown as StepReplayer,
        executeAgentFn,
        config: { ...DEFAULT_CONFIG, maxAttempts: 1 },
      });

      const result = await singleAttemptExecutor.execute("check login works", "https://example.com");

      expect(result.status).toBe("failed");
      expect(result.error).toBe("Login form not found on page — the page showed a 404 error");
    });
  });

  describe("agent call arguments", () => {
    it("passes correct config to executeAgent", async () => {
      cacheManager.load.mockResolvedValue(null);
      executeAgentFn.mockResolvedValue({
        passed: true,
        message: "Passed",
        steps: [],
      });

      await executor.execute("check login works", "https://example.com", "test-specific context");

      expect(executeAgentFn).toHaveBeenCalledTimes(1);
      const callArgs = (executeAgentFn.mock.calls as any[])[0][0] as Record<string, unknown>;
      expect(callArgs.testCase).toBe("check login works");
      expect(callArgs.baseUrl).toBe("https://example.com");
      expect(callArgs.recursionLimit).toBe(500);
      expect(callArgs.testContext).toBe("test-specific context");
    });
  });

  describe("durationMs tracking", () => {
    it("returns a positive durationMs value", async () => {
      cacheManager.load.mockResolvedValue(null);
      executeAgentFn.mockResolvedValue({
        passed: true,
        message: "Passed",
        steps: [],
      });

      const result = await executor.execute("check login works", "https://example.com");

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe("noCache option", () => {
    it("noCache skips cache load and calls agent directly", async () => {
      cacheManager.load.mockResolvedValue(FAKE_CACHE_ENTRY);
      executeAgentFn.mockResolvedValue({
        passed: true,
        message: "Passed via AI",
        steps: [{ toolName: "click", toolInput: { selector: "#btn" } }],
      });

      const noCacheExecutor = new TestExecutor({
        cacheManager: cacheManager as unknown as CacheManager,
        replayer: replayer as unknown as StepReplayer,
        executeAgentFn,
        config: DEFAULT_CONFIG,
        noCache: true,
      });

      const result = await noCacheExecutor.execute("check login works", "https://example.com");

      expect(result.status).toBe("passed");
      expect(result.source).toBe("ai");
      expect(cacheManager.load).not.toHaveBeenCalled();
      expect(replayer.replay).not.toHaveBeenCalled();
      expect(executeAgentFn).toHaveBeenCalledTimes(1);
    });

    it("noCache still writes cache on successful AI run", async () => {
      executeAgentFn.mockResolvedValue({
        passed: true,
        message: "Passed via AI",
        steps: [{ toolName: "click", toolInput: { selector: "#btn" } }],
      });

      const noCacheExecutor = new TestExecutor({
        cacheManager: cacheManager as unknown as CacheManager,
        replayer: replayer as unknown as StepReplayer,
        executeAgentFn,
        config: DEFAULT_CONFIG,
        noCache: true,
      });

      await noCacheExecutor.execute("check login works", "https://example.com");

      expect(cacheManager.save).toHaveBeenCalledTimes(1);
    });

    it("default behavior (noCache=false) loads cache first", async () => {
      cacheManager.load.mockResolvedValue(FAKE_CACHE_ENTRY);
      replayer.replay.mockResolvedValue({ success: true });

      const result = await executor.execute("check login works", "https://example.com");

      expect(result.status).toBe("passed");
      expect(result.source).toBe("cache");
      expect(cacheManager.load).toHaveBeenCalledTimes(1);
    });
  });
});
