import type { CacheManager } from "../cache/cache-manager.ts";
import type { StepReplayer } from "../cache/step-replayer.ts";
import type { AgentExecutionResult } from "../agent/types.ts";
import type { Config } from "../config/types.ts";
import type { TestResult } from "./types.ts";

/** Function signature for executing a test via the AI agent */
type ExecuteAgentFn = (config: {
  model: any;
  tools: Record<string, any>;
  testCase: string;
  baseUrl: string;
  recursionLimit: number;
  globalContext?: string;
  testContext?: string;
}) => Promise<AgentExecutionResult>;

/**
 * Executes a single test case following the cache-first-then-AI strategy:
 * 1. Try replaying from cache (fast path, ~50ms)
 * 2. On cache miss or replay failure, invoke AI agent with retries
 * 3. Save new steps on AI success; delete stale cache on AI failure after self-heal attempt
 */
export class TestExecutor {
  private readonly cacheManager: CacheManager;
  private readonly replayer: StepReplayer;
  private readonly executeAgentFn: ExecuteAgentFn;
  private readonly model: any;
  private readonly tools: Record<string, any>;
  private readonly config: Pick<
    Config,
    "maxAttempts" | "recursionLimit" | "model" | "modelProvider"
  > & { context?: string };
  private readonly globalContext?: string;
  private readonly noCache: boolean;

  constructor(opts: {
    cacheManager: CacheManager;
    replayer: StepReplayer;
    executeAgentFn: ExecuteAgentFn;
    model?: any;
    tools?: Record<string, any>;
    config: Pick<
      Config,
      "maxAttempts" | "recursionLimit" | "model" | "modelProvider"
    > & { context?: string };
    globalContext?: string;
    noCache?: boolean;
  }) {
    this.cacheManager = opts.cacheManager;
    this.replayer = opts.replayer;
    this.executeAgentFn = opts.executeAgentFn;
    this.model = opts.model;
    this.tools = opts.tools ?? {};
    this.config = opts.config;
    this.globalContext = opts.globalContext;
    this.noCache = opts.noCache ?? false;
  }

  /** Execute a single test case with cache-first strategy */
  async execute(
    testCase: string,
    baseUrl: string,
    testContext?: string,
  ): Promise<TestResult> {
    const start = Date.now();

    // Phase 1: Try cache replay (unless noCache)
    if (!this.noCache) {
      const cached = await this.cacheManager.load(testCase, baseUrl);
      if (cached) {
        const replay = await this.replayer.replay(cached.steps);
        if (replay.success) {
          return {
            testName: testCase,
            testCase,
            status: "passed",
            source: "cache",
            durationMs: Date.now() - start,
          };
        }
        // Cache stale — fall through to AI with self-heal flag
        return this.executeWithAgent(testCase, baseUrl, start, true, testContext);
      }
    }

    // Phase 2: No cache or noCache — go directly to AI
    return this.executeWithAgent(testCase, baseUrl, start, false, testContext);
  }

  /** Retry agent execution up to maxAttempts */
  private async executeWithAgent(
    testCase: string,
    baseUrl: string,
    startTime: number,
    selfHeal: boolean,
    testContext?: string,
  ): Promise<TestResult> {
    let lastError = "";

    for (let attempt = 0; attempt < this.config.maxAttempts; attempt++) {
      const result = await this.executeAgentFn({
        model: this.model,
        tools: this.tools,
        testCase,
        baseUrl,
        recursionLimit: this.config.recursionLimit,
        globalContext: this.globalContext,
        testContext,
      });

      if (result.passed) {
        // Save cache for future replays
        await this.cacheManager.save(testCase, baseUrl, result.steps, {
          model: this.config.model,
          provider: this.config.modelProvider,
          stepCount: result.steps.length,
          aiMessage: result.message,
          durationMs: Date.now() - startTime,
        });

        return {
          testName: testCase,
          testCase,
          status: "passed",
          source: "ai",
          durationMs: Date.now() - startTime,
          ...(selfHeal ? { selfHealed: true } : {}),
        };
      }

      lastError = result.message;
    }

    // All attempts exhausted
    if (selfHeal) {
      // Delete stale cache that triggered self-heal
      await this.cacheManager.delete(testCase, baseUrl);
    }

    return {
      testName: testCase,
      testCase,
      status: "failed",
      source: "ai",
      durationMs: Date.now() - startTime,
      error: lastError,
    };
  }
}
