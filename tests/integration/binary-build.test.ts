import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../..");
const TEST_BINARY = join(ROOT, "dist/test-binary");

describe("Binary Build Integration", () => {
  let buildExitCode: number;

  beforeAll(async () => {
    // Determine host target string for bun build --compile
    const platform = process.platform === "darwin" ? "darwin" : "linux";
    const arch = process.arch === "arm64" ? "arm64" : "x64";
    const hostTarget = `bun-${platform}-${arch}`;

    const proc = Bun.spawn(
      ["bun", "build", "--compile", `--target=${hostTarget}`, "src/cli.ts", "--outfile", "dist/test-binary"],
      {
        cwd: ROOT,
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    await new Response(proc.stdout).text();
    await new Response(proc.stderr).text();
    buildExitCode = await proc.exited;
  }, 60_000);

  afterAll(async () => {
    // Clean up test binary
    try {
      await Bun.file(TEST_BINARY).delete();
    } catch {
      // Already cleaned or never created
    }
  });

  test("compiles standalone binary for host platform", async () => {
    expect(buildExitCode).toBe(0);
    const exists = await Bun.file(TEST_BINARY).exists();
    expect(exists).toBe(true);
  }, 30_000);

  test("compiled binary runs --version", async () => {
    const proc = Bun.spawn([TEST_BINARY, "--version"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(stderr).toContain("0.3.1");
  }, 30_000);
});
