import { describe, expect, test } from "bun:test";

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
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

describe("CLI Pipeline Integration", () => {
  test("valid config without API key exits 2 with clear error naming env var", async () => {
    const { exitCode, stderr } = await runCli(["--config", "tests/fixtures/valid-config.yaml"], { OPENAI_API_KEY: "" });
    expect(exitCode).toBe(2);
    // Should show clear error about missing API key
    // Fixture uses model: gpt-4o / modelProvider: openai
    expect(stderr).toContain("Missing API key");
    expect(stderr).toContain("OPENAI_API_KEY");
  });

  test("missing config file exits 2 with error and hint", async () => {
    const { exitCode, stderr } = await runCli(["--config", "nonexistent.yaml"]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Config file not found");
    expect(stderr).toContain("superghost --config");
  });

  test("invalid config exits 2 with all validation errors", async () => {
    const { exitCode, stderr } = await runCli(["--config", "tests/fixtures/invalid-config.yaml"]);
    expect(exitCode).toBe(2);
    expect(stderr).toContain("Invalid config");
    expect(stderr).toContain("issue");
  });

  test("bad YAML syntax exits 2 with syntax error", async () => {
    const { exitCode, stderr } = await runCli(["--config", "tests/fixtures/bad-syntax.yaml"]);
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
    const { exitCode, stdout, stderr } = await runCli(["--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("--config");
    expect(stderr).toContain("superghost");
  });

  test("--version shows 0.3.0", async () => {
    const { exitCode, stdout, stderr } = await runCli(["--version"]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
    expect(stderr).toContain("0.3.0");
  });

  test("--no-cache flag is accepted (exits 2 for missing API key, not unknown option)", async () => {
    const { exitCode, stderr } = await runCli(["--config", "tests/fixtures/valid-config.yaml", "--no-cache"], {
      OPENAI_API_KEY: "",
    });
    expect(exitCode).toBe(2);
    // Should fail for missing API key, NOT for unknown option
    expect(stderr).toContain("Missing API key");
    expect(stderr).not.toContain("unknown option");
  });

  test("--only with zero matches exits 2 with available test names", async () => {
    const { exitCode, stderr } = await runCli(
      ["--config", "tests/fixtures/multi-test-config.yaml", "--only", "nonexistent*"],
      { OPENAI_API_KEY: "fake-key-for-filter-test" },
    );
    expect(exitCode).toBe(2);
    expect(stderr).toContain("No tests match pattern");
    expect(stderr).toContain("Login Flow");
    expect(stderr).toContain("Dashboard Load");
  });

  test("--help shows --only and --no-cache options", async () => {
    const { exitCode, stderr } = await runCli(["--help"]);
    expect(exitCode).toBe(0);
    expect(stderr).toContain("--only");
    expect(stderr).toContain("--no-cache");
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
        "    case: check something",
      ].join("\n"),
    );

    const { exitCode, stderr } = await runCli(["--config", tmpConfig], {
      OPENAI_API_KEY: "fake-key-for-preflight-test",
    });
    expect(exitCode).toBe(2);
    expect(stderr).toContain("baseUrl unreachable");
    expect(stderr).toContain("127.0.0.1:19999");
  });

  test("config without baseUrl skips preflight (fails on API key instead)", async () => {
    const { exitCode, stderr } = await runCli(["--config", "tests/fixtures/no-baseurl-config.yaml"], {
      OPENAI_API_KEY: "",
    });
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
      ["--config", "tests/fixtures/multi-test-config.yaml", "--only", "nonexistent*"],
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

  describe("dry-run", () => {
    test("--help shows --dry-run option", async () => {
      const { exitCode, stderr } = await runCli(["--help"]);
      expect(exitCode).toBe(0);
      expect(stderr).toContain("--dry-run");
    });

    test("--dry-run lists tests with source labels", async () => {
      const { exitCode, stderr } = await runCli(["--config", "tests/fixtures/multi-test-config.yaml", "--dry-run"], {
        OPENAI_API_KEY: "fake-key",
      });
      expect(exitCode).toBe(0);
      expect(stderr).toContain("Login Flow");
      expect(stderr).toContain("Login Error");
      expect(stderr).toContain("Dashboard Load");
      expect(stderr).toContain("Checkout Process");
      expect(stderr).toContain("(ai)");
      expect(stderr).toContain("4 tests, 0 cached");
    });

    test("--dry-run detects cached tests", async () => {
      const { mkdtemp, writeFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const { tmpdir } = await import("node:os");
      const { CacheManager } = await import("../../src/cache/cache-manager.ts");

      // Create a temp cache dir and populate it with a cache entry for "Login Flow"
      const tmpCacheDir = await mkdtemp(join(tmpdir(), "sg-cache-"));
      const testCase = "check that login works with valid credentials";
      const baseUrl = "https://example.com";
      const hash = CacheManager.hashKey(testCase, baseUrl);
      const cacheEntry = {
        version: 2,
        testCase,
        baseUrl,
        steps: [],
        model: "gpt-4o",
        provider: "openai",
        stepCount: 3,
        aiMessage: "test passed",
        durationMs: 1000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await writeFile(join(tmpCacheDir, `${hash}.json`), JSON.stringify(cacheEntry, null, 2));

      // Create a temp config pointing at the cache dir
      const tmpConfig = join(tmpdir(), "sg-dry-run-cache-test.yaml");
      await Bun.write(
        tmpConfig,
        [
          `baseUrl: https://example.com`,
          `model: gpt-4o`,
          `modelProvider: openai`,
          `cacheDir: ${tmpCacheDir}`,
          `tests:`,
          `  - name: Login Flow`,
          `    case: check that login works with valid credentials`,
          `  - name: Login Error`,
          `    case: check that login shows error with invalid credentials`,
        ].join("\n"),
      );

      const { exitCode, stderr } = await runCli(["--config", tmpConfig, "--dry-run"], { OPENAI_API_KEY: "fake-key" });
      expect(exitCode).toBe(0);
      expect(stderr).toContain("(cache)");
      expect(stderr).toContain("(ai)");
      expect(stderr).toContain("2 tests, 1 cached");
    });

    test("--dry-run validates config (exits 2 on bad YAML)", async () => {
      const { exitCode, stderr } = await runCli(["--config", "tests/fixtures/bad-syntax.yaml", "--dry-run"]);
      expect(exitCode).toBe(2);
      expect(stderr).toContain("YAML");
    });

    test("--dry-run exits 2 on missing API key", async () => {
      const { exitCode, stderr } = await runCli(["--config", "tests/fixtures/valid-config.yaml", "--dry-run"], {
        OPENAI_API_KEY: "",
      });
      expect(exitCode).toBe(2);
      expect(stderr).toContain("Missing API key");
    });

    test("--dry-run skips preflight (unreachable baseUrl still exits 0)", async () => {
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");

      const tmpConfig = join(tmpdir(), "sg-dry-run-preflight-test.yaml");
      await Bun.write(
        tmpConfig,
        [
          "baseUrl: http://127.0.0.1:19999",
          "model: gpt-4o",
          "modelProvider: openai",
          "tests:",
          "  - name: Test One",
          "    case: check something",
        ].join("\n"),
      );

      const { exitCode, stderr } = await runCli(["--config", tmpConfig, "--dry-run"], { OPENAI_API_KEY: "fake-key" });
      expect(exitCode).toBe(0);
      expect(stderr).not.toContain("baseUrl unreachable");
    });

    test("--dry-run + --only filters then lists", async () => {
      const { exitCode, stderr } = await runCli(
        ["--config", "tests/fixtures/multi-test-config.yaml", "--dry-run", "--only", "Login*"],
        { OPENAI_API_KEY: "fake-key" },
      );
      expect(exitCode).toBe(0);
      expect(stderr).toContain("Login Flow");
      expect(stderr).toContain("Login Error");
      expect(stderr).not.toContain("Dashboard Load");
      expect(stderr).not.toContain("Checkout Process");
      expect(stderr).toContain("2 tests");
      expect(stderr).toMatch(/of 4/);
    });

    test("--dry-run shows header with dry-run annotation", async () => {
      const { exitCode, stderr } = await runCli(["--config", "tests/fixtures/multi-test-config.yaml", "--dry-run"], {
        OPENAI_API_KEY: "fake-key",
      });
      expect(exitCode).toBe(0);
      expect(stderr).toContain("(dry-run)");
    });

    test("dry-run output goes to stderr, stdout is empty", async () => {
      const { exitCode, stdout, stderr } = await runCli(
        ["--config", "tests/fixtures/multi-test-config.yaml", "--dry-run"],
        { OPENAI_API_KEY: "fake-key" },
      );
      expect(exitCode).toBe(0);
      expect(stdout).toBe("");
      expect(stderr).toContain("(dry-run)");
      expect(stderr).toContain("Login Flow");
    });
  });

  describe("output json", () => {
    test("--output json --dry-run produces valid JSON on stdout", async () => {
      const { exitCode, stdout, stderr } = await runCli(
        ["--config", "tests/fixtures/multi-test-config.yaml", "--output", "json", "--dry-run"],
        { OPENAI_API_KEY: "fake-key" },
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.version).toBe("0.3.0");
      expect(parsed.success).toBe(true);
      expect(parsed.dryRun).toBe(true);
      expect(parsed.tests).toHaveLength(4);
      for (const t of parsed.tests) {
        expect(t.testName).toBeDefined();
        expect(t.testCase).toBeDefined();
        expect(t.source).toBeDefined();
      }
      // OUT-03: stderr still has human-readable progress
      expect(stderr).not.toBe("");
    });

    test("--output json --dry-run --only filters correctly", async () => {
      const { exitCode, stdout } = await runCli(
        ["--config", "tests/fixtures/multi-test-config.yaml", "--output", "json", "--dry-run", "--only", "Login*"],
        { OPENAI_API_KEY: "fake-key" },
      );
      expect(exitCode).toBe(0);
      const parsed = JSON.parse(stdout);
      expect(parsed.metadata.filter).toBeDefined();
      expect(parsed.metadata.filter.pattern).toBe("Login*");
      expect(parsed.metadata.filter.matched).toBe(2);
      expect(parsed.metadata.filter.total).toBe(4);
      expect(parsed.tests).toHaveLength(2);
    });

    test("--help outputs to stderr not stdout", async () => {
      const { exitCode, stdout, stderr } = await runCli(["--help"]);
      expect(exitCode).toBe(0);
      expect(stdout).toBe("");
      expect(stderr).toContain("--config");
    });

    test("--version outputs to stderr not stdout", async () => {
      const { exitCode, stdout, stderr } = await runCli(["--version"]);
      expect(exitCode).toBe(0);
      expect(stdout).toBe("");
      expect(stderr).toContain("0.3.0");
    });

    test("unknown --output format exits 2", async () => {
      const { exitCode, stderr } = await runCli(["--config", "tests/fixtures/valid-config.yaml", "--output", "csv"], {
        OPENAI_API_KEY: "fake-key",
      });
      expect(exitCode).toBe(2);
      expect(stderr).toContain("Unknown output format");
      expect(stderr).toContain("csv");
    });

    test("--output json with missing API key emits error JSON", async () => {
      const { exitCode, stdout } = await runCli(["--config", "tests/fixtures/valid-config.yaml", "--output", "json"], {
        OPENAI_API_KEY: "",
      });
      expect(exitCode).toBe(2);
      const parsed = JSON.parse(stdout);
      expect(parsed.success).toBe(false);
      expect(parsed.exitCode).toBe(2);
      expect(parsed.error).toContain("Missing API key");
    });

    test("--output json --dry-run stderr still shows progress", async () => {
      const { exitCode, stderr } = await runCli(
        ["--config", "tests/fixtures/multi-test-config.yaml", "--output", "json", "--dry-run"],
        { OPENAI_API_KEY: "fake-key" },
      );
      expect(exitCode).toBe(0);
      // Human-readable output continues on stderr
      expect(stderr).toContain("Login Flow");
      expect(stderr).toContain("Dashboard Load");
    });
  });

  describe("verbose", () => {
    test("--help shows --verbose option", async () => {
      const { exitCode, stderr } = await runCli(["--help"]);
      expect(exitCode).toBe(0);
      expect(stderr).toContain("--verbose");
    });

    test("--verbose flag is accepted (exits 2 for missing API key, not unknown option)", async () => {
      const { exitCode, stderr } = await runCli(["--config", "tests/fixtures/valid-config.yaml", "--verbose"], {
        OPENAI_API_KEY: "",
      });
      expect(exitCode).toBe(2);
      expect(stderr).toContain("Missing API key");
      expect(stderr).not.toContain("unknown option");
    });
  });
});
