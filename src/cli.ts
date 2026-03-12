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
import type { OnStepProgress } from "./output/types.ts";
import picomatch from "picomatch";
import { checkBaseUrlReachable } from "./infra/preflight.ts";
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
  .option("--only <pattern>", "Run only tests matching glob pattern")
  .option("--no-cache", "Bypass cache reads (still writes on success)")
  .option("--dry-run", "List tests and validate config without executing")
  .option("--verbose", "Show per-step tool call output during execution")
  .exitOverride((err) => {
    // Commander writes its own error message to stderr.
    // Re-exit with code 2 for config-class errors (missing required option, unknown option).
    if (err.exitCode !== 0) {
      process.exit(2);
    }
  })
  .action(async (options: { config: string; headed?: boolean; only?: string; cache: boolean; dryRun?: boolean; verbose?: boolean }) => {
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
      const reporter = new ConsoleReporter(options.verbose ?? false);

      // Infer provider: use explicit modelProvider unless it matches default and model suggests otherwise
      const provider =
        config.modelProvider === "anthropic"
          ? inferProvider(config.model)
          : (config.modelProvider as ProviderName);

      // Validate API key at startup before any tests run
      validateApiKey(provider);

      // Apply --only filter before any expensive operations
      const totalTestCount = config.tests.length;
      if (options.only) {
        const allTestNames = config.tests.map((t) => t.name);
        const isMatch = picomatch(options.only, { nocase: true });
        config.tests = config.tests.filter((t) => isMatch(t.name));

        if (config.tests.length === 0) {
          const names = allTestNames.map((n) => `  - ${n}`).join("\n");
          await Bun.write(
            Bun.stderr,
            `${pc.red("Error:")} No tests match pattern "${options.only}"\n\nAvailable tests:\n${names}\n`,
          );
          setTimeout(() => process.exit(2), 100);
          return;
        }
      }

      // Dry-run: list tests with cache/AI source labels, then exit
      if (options.dryRun) {
        const cacheManager = new CacheManager(config.cacheDir);

        // Print header (same as normal run)
        let header = `\n${pc.bold("superghost")} v${pkg.version} / Running ${config.tests.length}`;
        if (options.only) {
          header += ` of ${totalTestCount}`;
        }
        header += ` test(s)...\n`;
        Bun.write(Bun.stderr, header + "\n");

        // Stacked annotations
        Bun.write(Bun.stderr, pc.dim("  (dry-run)") + "\n");
        if (options.only) {
          Bun.write(Bun.stderr, pc.dim(`  (filtered by --only "${options.only}")`) + "\n");
        }
        Bun.write(Bun.stderr, "\n");

        // Determine max test name length for padding
        const maxNameLen = Math.max(...config.tests.map(t => t.name.length));
        let cachedCount = 0;

        for (let i = 0; i < config.tests.length; i++) {
          const test = config.tests[i];
          const baseUrl = test.baseUrl ?? config.baseUrl ?? "";
          const entry = await cacheManager.load(test.case, baseUrl);
          const source = entry ? "cache" : "ai";
          if (entry) cachedCount++;

          const paddedName = test.name.padEnd(maxNameLen);
          Bun.write(Bun.stderr, `  ${i + 1}. ${paddedName}  (${source})\n`);
        }

        Bun.write(Bun.stderr, "\n");
        Bun.write(Bun.stderr, `${config.tests.length} tests, ${cachedCount} cached\n`);

        setTimeout(() => process.exit(0), 100);
        return;
      }

      // Preflight: check baseUrl reachability (only if global baseUrl configured)
      if (config.baseUrl) {
        try {
          await checkBaseUrlReachable(config.baseUrl);
        } catch {
          await Bun.write(
            Bun.stderr,
            `${pc.red("Error:")} baseUrl unreachable: ${config.baseUrl}\n` +
              `  Check that the server is running and the URL is correct.\n`,
          );
          setTimeout(() => process.exit(2), 100);
          return;
        }
      }

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
      await cacheManager.migrateV1Cache();
      const toolExecutor: ToolExecutor = async (toolName, toolInput) => {
        const tool = tools[toolName];
        if (!tool) throw new Error(`Tool not found: ${toolName}`);
        return await tool.execute(toolInput);
      };
      const replayer = new StepReplayer(toolExecutor);

      // Create onStepProgress callback bound to reporter
      const onStepProgress: OnStepProgress = (step) => reporter.onStepProgress(step);

      // Create TestExecutor with cache-first strategy
      const executor = new TestExecutor({
        cacheManager,
        replayer,
        executeAgentFn: executeAgent,
        model,
        tools,
        config,
        globalContext: config.context,
        noCache: !options.cache,
        onStepProgress,
      });

      // Wire execute function for TestRunner
      const executeFn: ExecuteFn = async (testCase, baseUrl, testContext?) =>
        executor.execute(testCase, baseUrl, testContext);

      let header = `\n${pc.bold("superghost")} v${pkg.version} / Running ${config.tests.length}`;
      if (options.only) {
        header += ` of ${totalTestCount}`;
      }
      header += ` test(s)...\n`;
      Bun.write(Bun.stderr, header + "\n");

      let hasAnnotation = false;
      if (options.only) {
        Bun.write(Bun.stderr, pc.dim(`  (filtered by --only "${options.only}")`) + "\n");
        hasAnnotation = true;
      }
      if (!options.cache) {
        Bun.write(Bun.stderr, pc.dim("  (cache disabled)") + "\n");
        hasAnnotation = true;
      }
      if (options.verbose) {
        Bun.write(Bun.stderr, pc.dim("  (verbose)") + "\n");
        hasAnnotation = true;
      }
      if (hasAnnotation) {
        Bun.write(Bun.stderr, "\n");
      }

      const runner = new TestRunner(config, reporter, executeFn);
      const result = await runner.run();
      result.skipped = options.only ? totalTestCount - config.tests.length : 0;

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
