import { describe, test, expect } from "bun:test";

/**
 * Run the CLI as a subprocess, capturing stdout, stderr, and exit code.
 * NO_COLOR=1 disables ANSI codes for clean assertion matching.
 */
async function runCli(
  args: string[],
  envOverrides?: Record<string, string>,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", "run", "src/cli.ts", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, NO_COLOR: "1", ...envOverrides },
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

describe("CLI Pipeline Integration", () => {
  test("valid config without API key exits 1 with clear error naming env var", async () => {
    const { exitCode, stderr } = await runCli(
      ["--config", "tests/fixtures/valid-config.yaml"],
      { OPENAI_API_KEY: "" },
    );
    expect(exitCode).toBe(1);
    // Should show clear error about missing API key
    // Fixture uses model: gpt-4o / modelProvider: openai
    expect(stderr).toContain("Missing API key");
    expect(stderr).toContain("OPENAI_API_KEY");
  });

  test("missing config file exits 1 with error and hint", async () => {
    const { exitCode, stderr } = await runCli([
      "--config",
      "nonexistent.yaml",
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Config file not found");
    expect(stderr).toContain("superghost --config");
  });

  test("invalid config exits 1 with all validation errors", async () => {
    const { exitCode, stderr } = await runCli([
      "--config",
      "tests/fixtures/invalid-config.yaml",
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Invalid config");
    expect(stderr).toContain("issue");
  });

  test("bad YAML syntax exits 1 with syntax error", async () => {
    const { exitCode, stderr } = await runCli([
      "--config",
      "tests/fixtures/bad-syntax.yaml",
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("YAML");
  });

  test("--help shows usage and --config option", async () => {
    const { exitCode, stdout } = await runCli(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--config");
    expect(stdout).toContain("superghost");
  });

  test("--version shows 0.1.1", async () => {
    const { exitCode, stdout } = await runCli(["--version"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("0.1.1");
  });
});
