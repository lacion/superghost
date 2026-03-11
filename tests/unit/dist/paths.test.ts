import { describe, test, expect } from "bun:test";
import { join } from "path";
import { homedir } from "os";

import {
  SUPERGHOST_HOME,
  MCP_NODE_MODULES,
  isStandaloneBinary,
  getMcpCommand,
  _isStandaloneBinaryWith,
} from "../../../src/dist/paths.ts";

describe("paths", () => {
  describe("constants", () => {
    test("SUPERGHOST_HOME resolves to ~/.superghost", () => {
      expect(SUPERGHOST_HOME).toBe(join(homedir(), ".superghost"));
    });

    test("MCP_NODE_MODULES resolves to ~/.superghost/node_modules", () => {
      expect(MCP_NODE_MODULES).toBe(join(SUPERGHOST_HOME, "node_modules"));
    });
  });

  describe("isStandaloneBinary", () => {
    test("returns false in normal Bun execution (argv[1] is a .ts script)", () => {
      // In test context, process.argv[1] is the test file path (.ts)
      expect(isStandaloneBinary()).toBe(false);
    });

    test("returns true when argv[1] is falsy (compiled binary)", () => {
      expect(_isStandaloneBinaryWith(["/usr/bin/superghost"])).toBe(true);
    });

    test("returns true when argv[1] equals argv[0] (compiled binary)", () => {
      expect(
        _isStandaloneBinaryWith(["/usr/bin/superghost", "/usr/bin/superghost"]),
      ).toBe(true);
    });

    test("returns false when argv[1] is a script path", () => {
      expect(
        _isStandaloneBinaryWith(["/usr/bin/bun", "/path/to/src/cli.ts"]),
      ).toBe(false);
    });
  });

  describe("getMcpCommand", () => {
    test("returns bunx command in npm mode (not standalone)", () => {
      const cmd = getMcpCommand("@playwright/mcp", false);
      expect(cmd).toEqual({
        command: "bunx",
        args: ["@playwright/mcp@latest"],
      });
    });

    test("returns path-based command in standalone mode", () => {
      const cmd = getMcpCommand("@playwright/mcp", true);
      const expectedBinPath = join(MCP_NODE_MODULES, ".bin", "mcp");
      expect(cmd).toEqual({
        command: expectedBinPath,
        args: [],
      });
    });

    test("extracts short name from scoped package for standalone", () => {
      const cmd = getMcpCommand("@calibress/curl-mcp", true);
      const expectedBinPath = join(MCP_NODE_MODULES, ".bin", "curl-mcp");
      expect(cmd).toEqual({
        command: expectedBinPath,
        args: [],
      });
    });

    test("returns bunx command for unscoped package in npm mode", () => {
      const cmd = getMcpCommand("some-tool", false);
      expect(cmd).toEqual({
        command: "bunx",
        args: ["some-tool@latest"],
      });
    });
  });
});
