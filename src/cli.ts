#!/usr/bin/env bun

import { Command } from "commander";
import pc from "picocolors";
import picomatch from "picomatch";

import pkg from "../package.json";
import { executeAgent } from "./agent/agent-runner.ts";
import { McpManager } from "./agent/mcp-manager.ts";
import { createModel, inferProvider, type ProviderName, validateApiKey } from "./agent/model-factory.ts";
import { CacheManager } from "./cache/cache-manager.ts";
import { StepReplayer, type ToolExecutor } from "./cache/step-replayer.ts";
import { ConfigLoadError, loadConfig } from "./config/loader.ts";
import { isStandaloneBinary } from "./dist/paths.ts";
import { ensureMcpDependencies } from "./dist/setup.ts";
import { checkBaseUrlReachable } from "./infra/preflight.ts";
import { ProcessManager } from "./infra/process-manager.ts";
import { setupSignalHandlers } from "./infra/signals.ts";
import { animateBanner } from "./output/banner.ts";
import {
  formatJsonDryRun,
  formatJsonError,
  formatJsonOutput,
  type JsonOutputMetadata,
} from "./output/json-formatter.ts";
import { ConsoleReporter, writeStderr } from "./output/reporter.ts";
import { type OnStepProgress } from "./output/types.ts";
import { TestExecutor } from "./runner/test-executor.ts";
import { type ExecuteFn, TestRunner } from "./runner/test-runner.ts";

/** Print the run header and any stacked annotations to stderr */
function printRunHeader(testCount: number, totalTestCount: number | undefined, annotations: string[]): void {
  let header = `\n${pc.bold("superghost")} v${pkg.version} / Running ${testCount}`;
  if (totalTestCount !== undefined) {
    header += ` of ${totalTestCount}`;
  }
  header += ` test(s)...`;
  writeStderr(header);
  writeStderr("");

  for (const annotation of annotations) {
    writeStderr(pc.dim(`  ${annotation}`));
  }
  if (annotations.length > 0) {
    writeStderr("");
  }
}

const program = new Command();

program.configureOutput({
  writeOut: (str) => writeStderr(str.trimEnd()),
  writeErr: (str) => writeStderr(str.trimEnd()),
});

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
  .option("--output <format>", "Output format (json)")
  .exitOverride((err) => {
    // Commander writes its own error message to stderr.
    // Re-exit with code 2 for config-class errors (missing required option, unknown option).
    if (err.exitCode !== 0) {
      process.exit(2);
    }
  })
  .action(
    async (options: {
      config: string;
      headed?: boolean;
      only?: string;
      cache: boolean;
      dryRun?: boolean;
      verbose?: boolean;
      output?: string;
    }) => {
      const pm = new ProcessManager();
      setupSignalHandlers(pm);

      // Validate --output format early
      if (options.output && options.output !== "json") {
        writeStderr(`${pc.red("Error:")} Unknown output format '${options.output}'. Supported: json`);
        setTimeout(() => process.exit(2), 100);
        return;
      }

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
          config.modelProvider === "anthropic" ? inferProvider(config.model) : (config.modelProvider as ProviderName);

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
            writeStderr(`${pc.red("Error:")} No tests match pattern "${options.only}"\n\nAvailable tests:\n${names}`);
            setTimeout(() => process.exit(2), 100);
            return;
          }
        }

        // Dry-run: list tests with cache/AI source labels, then exit
        if (options.dryRun) {
          const cacheManager = new CacheManager(config.cacheDir);

          // Print header with annotations
          const dryRunAnnotations = ["(dry-run)"];
          if (options.only) dryRunAnnotations.push(`(filtered by --only "${options.only}")`);
          printRunHeader(config.tests.length, options.only ? totalTestCount : undefined, dryRunAnnotations);

          // Determine max test name length for padding
          const maxNameLen = Math.max(...config.tests.map((t) => t.name.length));
          let cachedCount = 0;
          const dryRunTests: Array<{ name: string; case: string; source: "cache" | "ai" }> = [];

          for (let i = 0; i < config.tests.length; i++) {
            const test = config.tests[i];
            const baseUrl = test.baseUrl ?? config.baseUrl ?? "";
            const entry = await cacheManager.load(test.case, baseUrl);
            const source: "cache" | "ai" = entry ? "cache" : "ai";
            if (entry) cachedCount++;
            dryRunTests.push({ name: test.name, case: test.case, source });

            const paddedName = test.name.padEnd(maxNameLen);
            writeStderr(`  ${i + 1}. ${paddedName}  (${source})`);
          }

          writeStderr("");
          writeStderr(`${config.tests.length} tests, ${cachedCount} cached`);

          // Write JSON to stdout when --output json is active
          if (options.output === "json") {
            const metadata: JsonOutputMetadata = {
              model: config.model,
              provider,
              configFile: options.config,
              baseUrl: config.baseUrl,
              timestamp: new Date().toISOString(),
              ...(options.only
                ? { filter: { pattern: options.only, matched: config.tests.length, total: totalTestCount } }
                : {}),
            };
            const testList = dryRunTests.map((t) => ({
              name: t.name,
              case: t.case,
              source: t.source,
            }));
            const json = formatJsonDryRun(testList, metadata, pkg.version);
            process.stdout.write(`${json}\n`);
          }

          setTimeout(() => process.exit(0), 100);
          return;
        }

        // Preflight: check baseUrl reachability (only if global baseUrl configured)
        if (config.baseUrl) {
          try {
            await checkBaseUrlReachable(config.baseUrl);
          } catch {
            writeStderr(`${pc.red("Error:")} baseUrl unreachable: ${config.baseUrl}`);
            writeStderr(`  Check that the server is running and the URL is correct.`);
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

        const runAnnotations: string[] = [];
        if (options.only) runAnnotations.push(`(filtered by --only "${options.only}")`);
        if (!options.cache) runAnnotations.push("(cache disabled)");
        if (options.verbose) runAnnotations.push("(verbose)");
        printRunHeader(config.tests.length, options.only ? totalTestCount : undefined, runAnnotations);

        const runner = new TestRunner(config, reporter, executeFn);
        const result = await runner.run();
        result.skipped = options.only ? totalTestCount - config.tests.length : 0;

        await mcpManager.close();
        await pm.killAll();
        const code = result.failed > 0 ? 1 : 0;

        // Write JSON to stdout when --output json is active
        if (options.output === "json") {
          const metadata: JsonOutputMetadata = {
            model: config.model,
            provider,
            configFile: options.config,
            baseUrl: config.baseUrl,
            timestamp: new Date().toISOString(),
            ...(options.only
              ? { filter: { pattern: options.only, matched: config.tests.length, total: totalTestCount } }
              : {}),
          };
          const json = formatJsonOutput(result, metadata, pkg.version, code);
          process.stdout.write(`${json}\n`);
        }

        setTimeout(() => process.exit(code), 100);
      } catch (error) {
        if (mcpManager) {
          await mcpManager.close().catch(() => {});
        }
        await pm.killAll();

        if (error instanceof ConfigLoadError) {
          writeStderr(`${pc.red("Error:")} ${error.message}`);
          if (options.output === "json") {
            const json = formatJsonError(error.message, pkg.version, { configFile: options.config });
            process.stdout.write(`${json}\n`);
          }
          setTimeout(() => process.exit(2), 100);
          return;
        }
        if (error instanceof Error && error.message.startsWith("Missing API key")) {
          writeStderr(`${pc.red("Error:")} ${error.message}`);
          if (options.output === "json") {
            const json = formatJsonError(error.message, pkg.version, { configFile: options.config });
            process.stdout.write(`${json}\n`);
          }
          setTimeout(() => process.exit(2), 100);
          return;
        }
        const msg = error instanceof Error ? error.message : String(error);
        writeStderr(`${pc.red("Unexpected error:")} ${msg}`);
        if (options.output === "json") {
          const json = formatJsonError(msg, pkg.version, { configFile: options.config });
          process.stdout.write(`${json}\n`);
        }
        setTimeout(() => process.exit(2), 100);
      }
    },
  );

(async () => {
  const isHelpRequest = process.argv.includes("--help") || process.argv.includes("-h");
  if (isHelpRequest) {
    await animateBanner();
  }
  await program.parseAsync();
})();
