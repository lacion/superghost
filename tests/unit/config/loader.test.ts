import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";

import { ConfigLoadError, loadConfig } from "../../../src/config/loader.ts";

const fixturesDir = join(import.meta.dir, "../../fixtures");

describe("loadConfig", () => {
  test("loads and returns valid config from valid-config.yaml", async () => {
    const { config } = await loadConfig(join(fixturesDir, "valid-config.yaml"));

    expect(config.baseUrl).toBe("https://example.com");
    expect(config.browser).toBe("firefox");
    expect(config.headless).toBe(false);
    expect(config.timeout).toBe(30000);
    expect(config.maxAttempts).toBe(5);
    expect(config.model).toBe("gpt-4o");
    expect(config.modelProvider).toBe("openai");
    expect(config.cacheDir).toBe(".my-cache");
    expect(config.recursionLimit).toBe(200);
    expect(config.tests).toHaveLength(2);
    expect(config.tests[0].name).toBe("Login Flow");
    expect(config.tests[0].case).toBe("check that login works with valid credentials");
    expect(config.tests[1].name).toBe("Dashboard");
    expect(config.tests[1].baseUrl).toBe("https://dashboard.example.com");
    expect(config.tests[1].timeout).toBe(120000);
  });

  test("throws ConfigLoadError with hint when file does not exist", async () => {
    try {
      await loadConfig("/nonexistent/path/config.yaml");
      expect(true).toBe(false); // should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigLoadError);
      const err = error as ConfigLoadError;
      expect(err.name).toBe("ConfigLoadError");
      expect(err.message).toContain("not found");
      expect(err.message).toContain("/nonexistent/path/config.yaml");
      expect(err.message).toContain("superghost --config");
    }
  });

  test("throws ConfigLoadError with line context for bad YAML syntax", async () => {
    try {
      await loadConfig(join(fixturesDir, "bad-syntax.yaml"));
      expect(true).toBe(false); // should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigLoadError);
      const err = error as ConfigLoadError;
      expect(err.name).toBe("ConfigLoadError");
      expect(err.message).toContain("Invalid YAML syntax");
      expect(err.cause).toBeDefined();
    }
  });

  test("throws ConfigLoadError listing ALL validation issues numbered for invalid config", async () => {
    try {
      await loadConfig(join(fixturesDir, "invalid-config.yaml"));
      expect(true).toBe(false); // should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigLoadError);
      const err = error as ConfigLoadError;
      expect(err.name).toBe("ConfigLoadError");
      expect(err.message).toContain("Invalid config");
      // Should contain numbered issues
      expect(err.message).toMatch(/\d+\./);
      // Should contain field paths
      expect(err.message).toContain(".");
    }
  });

  test("throws ConfigLoadError for missing-fields config (no tests array)", async () => {
    try {
      await loadConfig(join(fixturesDir, "missing-fields.yaml"));
      expect(true).toBe(false); // should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigLoadError);
      const err = error as ConfigLoadError;
      expect(err.message).toContain("Invalid config");
    }
  });
});

describe("loadConfig env var interpolation", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.BASE_URL = process.env.BASE_URL;
    savedEnv.API_URL = process.env.API_URL;
  });

  afterEach(() => {
    // Restore original env
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  test("returns { config, templates } with env vars resolved", async () => {
    process.env.BASE_URL = "https://prod.example.com";
    process.env.API_URL = "https://api.example.com";

    const result = await loadConfig(join(fixturesDir, "env-var-config.yaml"));

    // Result should be an object with config and templates
    expect(result).toHaveProperty("config");
    expect(result).toHaveProperty("templates");
    expect(result.config.baseUrl).toBe("https://prod.example.com");
    expect(result.config.tests[0].baseUrl).toBe("https://api.example.com");
    expect(result.templates).toBeInstanceOf(Map);
    expect(result.templates.size).toBeGreaterThan(0);
  });

  test("uses default values when env var not set", async () => {
    delete process.env.BASE_URL;
    process.env.API_URL = "https://api.example.com";

    const result = await loadConfig(join(fixturesDir, "env-var-config.yaml"));

    expect(result.config.baseUrl).toBe("http://localhost:3000");
  });

  test("throws ConfigLoadError with numbered list for missing required env vars", async () => {
    delete process.env.BASE_URL;
    delete process.env.API_URL;

    try {
      await loadConfig(join(fixturesDir, "env-var-config.yaml"));
      expect(true).toBe(false); // should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigLoadError);
      const err = error as ConfigLoadError;
      expect(err.message).toContain("Missing env var");
      expect(err.message).toMatch(/\d+\./); // numbered list
      expect(err.message).toContain("API_URL");
    }
  });
});

describe("ConfigLoadError", () => {
  test("has name property 'ConfigLoadError'", () => {
    const err = new ConfigLoadError("test error");
    expect(err.name).toBe("ConfigLoadError");
  });

  test("preserves cause property", () => {
    const cause = new Error("original");
    const err = new ConfigLoadError("wrapper", cause);
    expect(err.cause).toBe(cause);
  });

  test("is instanceof Error", () => {
    const err = new ConfigLoadError("test");
    expect(err).toBeInstanceOf(Error);
  });
});
