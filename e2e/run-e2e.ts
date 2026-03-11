#!/usr/bin/env bun

import { ENV_VARS } from "../src/agent/model-factory.ts";

const API_KEY_VARS = Object.values(ENV_VARS);

const SUITES: Record<string, string[]> = {
  smoke: ["e2e/tests/smoke.superghost.yaml"],
  browser: ["e2e/tests/browser.superghost.yaml"],
  api: ["e2e/tests/api.superghost.yaml"],
};
SUITES.all = [...SUITES.smoke, ...SUITES.browser, ...SUITES.api];

async function main() {
  // 1. Check for AI API key
  const hasKey = API_KEY_VARS.some((v) => Bun.env[v]);
  if (!hasKey) {
    console.log(
      `No AI API key found (checked: ${API_KEY_VARS.join(", ")}). Skipping E2E tests.`,
    );
    process.exit(0);
  }

  // 2. Determine which suite to run
  const suite = process.argv[2] || "smoke";
  const configs = SUITES[suite];
  if (!configs) {
    console.error(`Unknown suite: "${suite}". Available: ${Object.keys(SUITES).join(", ")}`);
    process.exit(1);
  }

  // 3. Start the app server
  console.log("Starting Task Manager app...");
  const app = Bun.spawn(["bun", "run", "e2e/app/server.ts"], {
    stdout: "inherit",
    stderr: "inherit",
    env: { ...Bun.env, PORT: "3777" },
  });

  // 4. Wait for app to be ready
  const ready = await waitForHealth("http://localhost:3777/api/health", 10_000);
  if (!ready) {
    console.error("App failed to start within 10 seconds.");
    app.kill();
    process.exit(1);
  }
  console.log("App is ready.\n");

  // 5. Run each config
  let failed = false;
  for (const config of configs) {
    console.log(`\n--- Running: ${config} ---\n`);
    const runner = Bun.spawn(["bun", "run", "src/cli.ts", "--config", config], {
      stdout: "inherit",
      stderr: "inherit",
      env: Bun.env,
    });
    const exitCode = await runner.exited;
    if (exitCode !== 0) {
      failed = true;
      console.error(`FAILED: ${config} (exit code ${exitCode})`);
    }
  }

  // 6. Cleanup
  app.kill();
  process.exit(failed ? 1 : 0);
}

async function waitForHealth(url: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // Server not ready yet
    }
    await Bun.sleep(200);
  }
  return false;
}

main();
