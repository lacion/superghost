#!/usr/bin/env bun

import { Command } from "commander";
import pc from "picocolors";
import { loadConfig, ConfigLoadError } from "./config/loader.ts";
import { TestRunner } from "./runner/test-runner.ts";
import type { ExecuteFn } from "./runner/test-runner.ts";
import { ConsoleReporter } from "./output/reporter.ts";
import { ProcessManager } from "./infra/process-manager.ts";
import { setupSignalHandlers } from "./infra/signals.ts";
import { McpManager } from "./agent/mcp-manager.ts";
import { CacheManager } from "./cache/cache-manager.ts";
import { StepReplayer } from "./cache/step-replayer.ts";
import type { ToolExecutor } from "./cache/step-replayer.ts";
import { TestExecutor } from "./runner/test-executor.ts";
import {
  inferProvider,
  validateApiKey,
  createModel,
} from "./agent/model-factory.ts";
import type { ProviderName } from "./agent/model-factory.ts";
import { executeAgent } from "./agent/agent-runner.ts";
import { isStandaloneBinary } from "./dist/paths.ts";
import { ensureMcpDependencies } from "./dist/setup.ts";
import pkg from "../package.json";

const program = new Command();

program
  .name("superghost")
  .description("AI-powered end-to-end browser and API testing")
  .version(pkg.version)
  .requiredOption("-c, --config <path>", "Path to YAML config file")
  .option("--headed", "Run browser in headed mode (visible browser window)")
  .exitOverride((err) => {
    // Commander writes its own error message to stderr.
    // Re-exit with code 2 for config-class errors (missing required option, unknown option).
    if (err.exitCode !== 0) {
      process.exit(2);
    }
  })
  .action(async (options: { config: string; headed?: boolean }) => {
    const pm = new ProcessManager();
    setupSignalHandlers(pm);

    // Auto-install MCP dependencies for standalone binary on first run
    if (isStandaloneBinary()) {
      await ensureMcpDependencies();
    }

    let mcpManager: McpManager | null = null;

    try {
      const config = await loadConfig(options.config);
      if (options.headed) {
        config.headless = false;
      }
      const reporter = new ConsoleReporter();

      // Infer provider: use explicit modelProvider unless it matches default and model suggests otherwise
      const provider =
        config.modelProvider === "anthropic"
          ? inferProvider(config.model)
          : (config.modelProvider as ProviderName);

      // Validate API key at startup before any tests run
      validateApiKey(provider);

      // Create AI model
      const model = createModel(config.model, provider);

      // Initialize MCP servers (shared across test suite, not per-test)
      mcpManager = new McpManager({
        browser: config.browser,
        headless: config.headless,
      });
      await mcpManager.initialize();
      const tools = await mcpManager.getTools();

      // Create cache subsystem
      const cacheManager = new CacheManager(config.cacheDir);
      const toolExecutor: ToolExecutor = async (toolName, toolInput) => {
        const tool = tools[toolName];
        if (!tool) throw new Error(`Tool not found: ${toolName}`);
        return await tool.execute(toolInput);
      };
      const replayer = new StepReplayer(toolExecutor);

      // Create TestExecutor with cache-first strategy
      const executor = new TestExecutor({
        cacheManager,
        replayer,
        executeAgentFn: executeAgent,
        model,
        tools,
        config,
        globalContext: config.context,
      });

      // Wire execute function for TestRunner
      const executeFn: ExecuteFn = async (testCase, baseUrl, testContext?) =>
        executor.execute(testCase, baseUrl, testContext);

      console.log(
        `\n${pc.bold("superghost")} v${pkg.version} / Running ${config.tests.length} test(s)...\n`,
      );

      const runner = new TestRunner(config, reporter, executeFn);
      const result = await runner.run();

      await mcpManager.close();
      await pm.killAll();
      const code = result.failed > 0 ? 1 : 0;
      setTimeout(() => process.exit(code), 100);
    } catch (error) {
      if (mcpManager) {
        await mcpManager.close().catch(() => {});
      }
      await pm.killAll();

      if (error instanceof ConfigLoadError) {
        Bun.write(Bun.stderr, `${pc.red("Error:")} ${error.message}\n`);
        setTimeout(() => process.exit(2), 100);
        return;
      }
      if (error instanceof Error && error.message.startsWith("Missing API key")) {
        Bun.write(Bun.stderr, `${pc.red("Error:")} ${error.message}\n`);
        setTimeout(() => process.exit(2), 100);
        return;
      }
      const msg = error instanceof Error ? error.message : String(error);
      await Bun.write(Bun.stderr, `${pc.red("Unexpected error:")} ${msg}\n`);
      setTimeout(() => process.exit(2), 100);
    }
  });

(async () => {
  await program.parseAsync();
})();
