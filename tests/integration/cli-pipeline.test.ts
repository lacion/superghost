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
  test("valid config without API key exits 2 with clear error naming env var", async () => {
    const { exitCode, stderr } = await runCli(
      ["--config", "tests/fixtures/valid-config.yaml"],
      { OPENAI_API_KEY: "" },
    );
    expect(exitCode).toBe(2);
    // Should show clear error about missing API key
    // Fixture uses model: gpt-4o / modelProvider: openai
    expect(stderr).toContain("Missing API key");
    expect(stderr).toContain("OPENAI_API_KEY");
  });

  test("missing config file exits 2 with error and hint", async () => {
    const { exitCode, stderr } = await runCli([
      "--config",
      "nonexistent.yaml",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Config file not found");
    expect(stderr).toContain("superghost --config");
  });

  test("invalid config exits 2 with all validation errors", async () => {
    const { exitCode, stderr } = await runCli([
      "--config",
      "tests/fixtures/invalid-config.yaml",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Invalid config");
    expect(stderr).toContain("issue");
  });

  test("bad YAML syntax exits 2 with syntax error", async () => {
    const { exitCode, stderr } = await runCli([
      "--config",
      "tests/fixtures/bad-syntax.yaml",
    ]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("YAML");
  });

  test("missing --config flag exits 2", async () => {
    const { exitCode, stderr } = await runCli([]);
    expect(exitCode).toBe(2);
    // Commander's required option error should appear in stderr
    expect(stderr).toContain("--config");
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

  test("--no-cache flag is accepted (exits 2 for missing API key, not unknown option)", async () => {
    const { exitCode, stderr } = await runCli(
      ["--config", "tests/fixtures/valid-config.yaml", "--no-cache"],
      { OPENAI_API_KEY: "" },
    );
    expect(exitCode).toBe(2);
    // Should fail for missing API key, NOT for unknown option
    expect(stderr).toContain("Missing API key");
    expect(stderr).not.toContain("unknown option");
  });

  test("--only with zero matches exits 2 with available test names", async () => {
    const { exitCode, stderr } = await runCli(
      [
        "--config",
        "tests/fixtures/multi-test-config.yaml",
        "--only",
        "nonexistent*",
      ],
      { OPENAI_API_KEY: "fake-key-for-filter-test" },
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("No tests match pattern");
    expect(stderr).toContain("Login Flow");
    expect(stderr).toContain("Dashboard Load");
  });

  test("--help shows --only and --no-cache options", async () => {
    const { exitCode, stdout } = await runCli(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--only");
    expect(stdout).toContain("--no-cache");
  });

  test("unreachable baseUrl exits 2 with error message", async () => {
    // Write a temp config with an unreachable baseUrl
    const tmpConfig = "/tmp/superghost-unreachable-test.yaml";
    await Bun.write(
      tmpConfig,
      [
        "baseUrl: http://127.0.0.1:19999",
        "model: gpt-4o",
        "modelProvider: openai",
        "tests:",
        "  - name: Test One",
        '    case: check something',
      ].join("\n"),
    );

    const { exitCode, stderr } = await runCli(
      ["--config", tmpConfig],
      { OPENAI_API_KEY: "fake-key-for-preflight-test" },
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("baseUrl unreachable");
    expect(stderr).toContain("127.0.0.1:19999");
  });

  test("config without baseUrl skips preflight (fails on API key instead)", async () => {
    const { exitCode, stderr } = await runCli(
      ["--config", "tests/fixtures/no-baseurl-config.yaml"],
      { OPENAI_API_KEY: "" },
    );
    expect(exitCode).toBe(2);
    // Should fail for missing API key, NOT for baseUrl unreachable
    // This proves preflight was skipped when no baseUrl is configured
    expect(stderr).toContain("Missing API key");
    expect(stderr).not.toContain("baseUrl unreachable");
  });

  test("--only zero-match exits before preflight check", async () => {
    // multi-test-config.yaml has baseUrl: https://example.com
    // Even if baseUrl were unreachable, --only zero-match should exit first
    const { exitCode, stderr } = await runCli(
      [
        "--config",
        "tests/fixtures/multi-test-config.yaml",
        "--only",
        "nonexistent*",
      ],
      { OPENAI_API_KEY: "fake-key-for-order-test" },
    );
    expect(exitCode).toBe(2);
    // Should show "No tests match", NOT "baseUrl unreachable"
    // This proves startup order: --only filter runs before preflight
    expect(stderr).toContain("No tests match");
    expect(stderr).not.toContain("baseUrl unreachable");
  });

  // Note: "unhandled exception in action exits 2" is hard to trigger in
  // integration tests since it requires an exception that doesn't match
  // ConfigLoadError or "Missing API key". The catch-all is verified by
  // code inspection: the catch block exits(2) for all remaining paths
  // with no remaining `throw error`.
});
