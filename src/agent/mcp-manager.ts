import { createMCPClient } from "@ai-sdk/mcp";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Config } from "../config/types.ts";
import { getMcpCommand } from "../dist/paths.ts";

/**
 * Manages the lifecycle of Playwright and curl MCP servers.
 *
 * MCP servers are shared across the test suite (not restarted per test).
 * Fresh browser context per test comes from the `--isolated` flag on
 * Playwright MCP. Both tool sets are merged and provided to the agent
 * regardless of test type.
 */
export class McpManager {
  private playwrightClient: Awaited<ReturnType<typeof createMCPClient>> | null =
    null;
  private curlClient: Awaited<ReturnType<typeof createMCPClient>> | null = null;

  constructor(private readonly config: Pick<Config, "browser" | "headless">) {}

  /**
   * Spawn Playwright MCP and curl MCP servers via stdio transport.
   * Must be called before getTools().
   */
  async initialize(): Promise<void> {
    // Resolve MCP spawn commands (bunx in npm mode, path-based in standalone)
    const playwrightCmd = getMcpCommand("@playwright/mcp");
    const curlCmd = getMcpCommand("@calibress/curl-mcp");

    const playwrightArgs = [
      ...playwrightCmd.args,
      "--isolated",
      `--browser=${this.config.browser}`,
    ];

    if (this.config.headless) {
      playwrightArgs.splice(playwrightCmd.args.length, 0, "--headless");
    }

    this.playwrightClient = await createMCPClient({
      transport: new StdioClientTransport({
        command: playwrightCmd.command,
        args: playwrightArgs,
      }),
    });

    this.curlClient = await createMCPClient({
      transport: new StdioClientTransport({
        command: curlCmd.command,
        args: [...curlCmd.args],
      }),
    });
  }

  /**
   * Get merged tool set from both Playwright and curl MCP servers.
   * Provides ALL tools to the agent regardless of test type.
   */
  async getTools(): Promise<Record<string, any>> {
    const playwrightTools = await this.playwrightClient!.tools();
    const curlTools = await this.curlClient!.tools();
    return { ...playwrightTools, ...curlTools };
  }

  /**
   * Close both MCP server connections.
   * Uses Promise.allSettled to ensure both servers are cleaned up
   * even if one fails to close.
   */
  async close(): Promise<void> {
    await Promise.allSettled([
      this.playwrightClient?.close(),
      this.curlClient?.close(),
    ]);
    this.playwrightClient = null;
    this.curlClient = null;
  }
}
