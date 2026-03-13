import { join } from "node:path";
import { unlink } from "node:fs/promises";
import { createSpinner } from "nanospinner";
import pc from "picocolors";
import { SUPERGHOST_HOME, MCP_NODE_MODULES, isStandaloneBinary } from "./paths.ts";

/** MCP server dependencies that standalone binaries need */
const MCP_DEPS: Record<string, string> = {
  "@playwright/mcp": "latest",
  "@calibress/curl-mcp": "latest",
};

/**
 * Auto-install MCP server dependencies for standalone binary mode.
 *
 * On first run, installs @playwright/mcp and @calibress/curl-mcp
 * to ~/.superghost/ using `bun install` with BUN_BE_BUN=1.
 * Skips installation when dependencies already exist.
 *
 * Shows spinner + colored status messages matching CLI output style.
 */
export async function ensureMcpDependencies(): Promise<void> {
  // Check marker: if @playwright/mcp is installed, all deps are present
  const markerPath = join(
    MCP_NODE_MODULES,
    "@playwright",
    "mcp",
    "package.json",
  );
  const exists = await Bun.file(markerPath).exists();
  if (exists) return;

  // Write package.json for dependency installation
  const packageJsonPath = join(SUPERGHOST_HOME, "package.json");
  await Bun.write(
    packageJsonPath,
    JSON.stringify({ private: true, dependencies: MCP_DEPS }),
  );

  // Show spinner for user feedback
  const spinner = createSpinner(
    pc.cyan("Installing MCP dependencies..."),
  ).start();

  // Spawn bun install with BUN_BE_BUN=1 to force Bun runtime
  const proc = Bun.spawn([process.argv[0], "install"], {
    cwd: SUPERGHOST_HOME,
    env: { ...Bun.env, BUN_BE_BUN: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });

  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    spinner.error({ text: pc.red("Failed to install MCP dependencies") });
    if (stderr) {
      console.error(pc.dim(stderr));
    }
    process.exit(1);
  }

  spinner.success({
    text: pc.green("MCP dependencies installed to ~/.superghost/"),
  });
}

/** MCP packages used in npm mode */
const MCP_PACKAGES = ["@playwright/mcp", "@calibress/curl-mcp"];

/**
 * Update MCP server dependencies to latest versions.
 *
 * - Standalone mode: deletes marker file and re-installs via ensureMcpDependencies().
 * - npm mode: runs `bunx <pkg>@latest --help` to prime Bun's cache with the latest version.
 */
export async function updateMcpDependencies(): Promise<void> {
  if (isStandaloneBinary()) {
    const markerPath = join(
      MCP_NODE_MODULES,
      "@playwright",
      "mcp",
      "package.json",
    );
    await unlink(markerPath).catch(() => {});
    await ensureMcpDependencies();
    return;
  }

  // npm mode: re-prime Bun cache with @latest
  const spinner = createSpinner(
    pc.cyan("Updating MCP dependencies..."),
  ).start();

  for (const pkg of MCP_PACKAGES) {
    const proc = Bun.spawn(["bunx", `${pkg}@latest`, "--help"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      spinner.error({ text: pc.red(`Failed to update ${pkg}`) });
      process.exit(1);
    }
  }

  spinner.success({
    text: pc.green("MCP dependencies updated to latest"),
  });
}
