import { beforeEach, describe, expect, it, mock } from "bun:test";

// Mock MCP dependencies before importing McpManager
const mockPlaywrightTools = mock(() => Promise.resolve({ browser_navigate: {}, browser_click: {} }));
const mockPlaywrightClose = mock(() => Promise.resolve());
const mockCurlTools = mock(() => Promise.resolve({ curl_fetch: {} }));
const mockCurlClose = mock(() => Promise.resolve());

let mcpClientCallCount = 0;
const mockCreateMCPClient = mock(async (_opts: any) => {
  mcpClientCallCount++;
  if (mcpClientCallCount % 2 === 1) {
    // First call = Playwright
    return { tools: mockPlaywrightTools, close: mockPlaywrightClose };
  }
  // Second call = curl
  return { tools: mockCurlTools, close: mockCurlClose };
});

const capturedTransports: any[] = [];
const MockStdioClientTransport = mock(function (this: any, opts: any) {
  capturedTransports.push(opts);
  return opts;
});

mock.module("@ai-sdk/mcp", () => ({
  createMCPClient: mockCreateMCPClient,
}));

mock.module("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: MockStdioClientTransport,
}));

mock.module("../../../src/dist/paths.ts", () => ({
  getMcpCommand: (pkg: string) => {
    if (pkg === "@playwright/mcp") {
      return { command: "bunx", args: ["@playwright/mcp"] };
    }
    return { command: "bunx", args: ["@calibress/curl-mcp"] };
  },
}));

// Import after mocks are set up
import { McpManager } from "../../../src/agent/mcp-manager.ts";

describe("McpManager", () => {
  let manager: McpManager;

  beforeEach(() => {
    mockCreateMCPClient.mockClear();
    mockPlaywrightTools.mockClear();
    mockPlaywrightClose.mockClear();
    mockCurlTools.mockClear();
    mockCurlClose.mockClear();
    MockStdioClientTransport.mockClear();
    capturedTransports.length = 0;
    mcpClientCallCount = 0;
  });

  describe("initialize", () => {
    it("spawns both MCP servers with correct args", async () => {
      manager = new McpManager({ browser: "chromium", headless: false });
      await manager.initialize();

      expect(mockCreateMCPClient).toHaveBeenCalledTimes(2);
      expect(MockStdioClientTransport).toHaveBeenCalledTimes(2);

      // Playwright transport
      const pwTransport = capturedTransports[0];
      expect(pwTransport.command).toBe("bunx");
      expect(pwTransport.args).toContain("@playwright/mcp");
      expect(pwTransport.args).toContain("--isolated");
      expect(pwTransport.args).toContain("--browser=chromium");

      // Curl transport
      const curlTransport = capturedTransports[1];
      expect(curlTransport.command).toBe("bunx");
      expect(curlTransport.args).toContain("@calibress/curl-mcp");
    });

    it("passes --headless flag when config.headless is true", async () => {
      manager = new McpManager({ browser: "chromium", headless: true });
      await manager.initialize();

      const pwTransport = capturedTransports[0];
      expect(pwTransport.args).toContain("--headless");
    });

    it("omits --headless when config.headless is false", async () => {
      manager = new McpManager({ browser: "chromium", headless: false });
      await manager.initialize();

      const pwTransport = capturedTransports[0];
      expect(pwTransport.args).not.toContain("--headless");
    });
  });

  describe("getTools", () => {
    it("merges tools from both servers", async () => {
      manager = new McpManager({ browser: "chromium", headless: false });
      await manager.initialize();

      const tools = await manager.getTools();
      expect(tools).toHaveProperty("browser_navigate");
      expect(tools).toHaveProperty("browser_click");
      expect(tools).toHaveProperty("curl_fetch");
    });

    it("returns empty object before initialize()", async () => {
      manager = new McpManager({ browser: "chromium", headless: false });
      const tools = await manager.getTools();
      expect(tools).toEqual({});
    });
  });

  describe("close", () => {
    it("calls close on both clients and nullifies them", async () => {
      manager = new McpManager({ browser: "chromium", headless: false });
      await manager.initialize();
      await manager.close();

      expect(mockPlaywrightClose).toHaveBeenCalledTimes(1);
      expect(mockCurlClose).toHaveBeenCalledTimes(1);

      // After close, getTools should return empty (clients are null)
      const tools = await manager.getTools();
      expect(tools).toEqual({});
    });

    it("resolves even when one client fails (Promise.allSettled)", async () => {
      mockPlaywrightClose.mockRejectedValueOnce(new Error("close failed"));

      manager = new McpManager({ browser: "chromium", headless: false });
      await manager.initialize();

      // Should not throw
      await manager.close();

      // Curl close should still have been called
      expect(mockCurlClose).toHaveBeenCalledTimes(1);
    });
  });
});
