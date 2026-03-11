import { join } from "node:path";
import { homedir } from "node:os";

/** Home directory for standalone binary dependencies */
export const SUPERGHOST_HOME = join(homedir(), ".superghost");

/** Node modules path within the superghost home directory */
export const MCP_NODE_MODULES = join(SUPERGHOST_HOME, "node_modules");

/**
 * Testable standalone binary detection with injectable argv.
 * Compiled binaries: argv[1] is absent or same as argv[0].
 */
export function _isStandaloneBinaryWith(argv: string[]): boolean {
  return !argv[1] || argv[1] === argv[0];
}

/** Detect if running as a compiled standalone binary */
export function isStandaloneBinary(): boolean {
  return _isStandaloneBinaryWith(process.argv);
}

/**
 * Get spawn command for an MCP server package.
 * In npm mode, uses bunx with @latest tag.
 * In standalone mode, uses installed path from ~/.superghost/node_modules/.bin/.
 *
 * @param packageName - Full package name (e.g., "@playwright/mcp")
 * @param standalone - Override standalone detection (for testing)
 */
export function getMcpCommand(
  packageName: string,
  standalone?: boolean,
): { command: string; args: string[] } {
  const isStandalone = standalone ?? isStandaloneBinary();

  if (isStandalone) {
    const binPath = join(MCP_NODE_MODULES, ".bin");
    // Extract short name from scoped package (e.g., "@playwright/mcp" -> "mcp")
    const shortName = packageName.split("/").pop()!;
    return {
      command: join(binPath, shortName),
      args: [],
    };
  }

  // npm package: use bunx with @latest tag
  return {
    command: "bunx",
    args: [`${packageName}@latest`],
  };
}
