import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { createModel, ENV_VARS, inferProvider, validateApiKey } from "../../../src/agent/model-factory.ts";

describe("inferProvider", () => {
  test("claude-sonnet-4-6 returns anthropic", () => {
    expect(inferProvider("claude-sonnet-4-6")).toBe("anthropic");
  });

  test("claude-3-5-sonnet returns anthropic", () => {
    expect(inferProvider("claude-3-5-sonnet")).toBe("anthropic");
  });

  test("gpt-4o returns openai", () => {
    expect(inferProvider("gpt-4o")).toBe("openai");
  });

  test("o3-mini returns openai", () => {
    expect(inferProvider("o3-mini")).toBe("openai");
  });

  test("gemini-2.5-flash returns google", () => {
    expect(inferProvider("gemini-2.5-flash")).toBe("google");
  });

  test("model with slash returns openrouter", () => {
    expect(inferProvider("anthropic/claude-3-5-sonnet")).toBe("openrouter");
  });

  test("unknown model defaults to anthropic", () => {
    expect(inferProvider("unknown-model")).toBe("anthropic");
  });
});

describe("validateApiKey", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save and clear all provider API keys
    for (const [, envVar] of Object.entries(ENV_VARS)) {
      savedEnv[envVar] = process.env[envVar];
      delete process.env[envVar];
    }
  });

  afterEach(() => {
    // Restore saved env vars
    for (const [envVar, value] of Object.entries(savedEnv)) {
      if (value !== undefined) {
        process.env[envVar] = value;
      } else {
        delete process.env[envVar];
      }
    }
  });

  test("throws when ANTHROPIC_API_KEY is unset", () => {
    expect(() => validateApiKey("anthropic")).toThrow("ANTHROPIC_API_KEY");
  });

  test("does not throw when ANTHROPIC_API_KEY is set", () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    expect(() => validateApiKey("anthropic")).not.toThrow();
  });

  test("throws with correct env var name for openai", () => {
    expect(() => validateApiKey("openai")).toThrow("OPENAI_API_KEY");
  });

  test("throws with correct env var name for google", () => {
    expect(() => validateApiKey("google")).toThrow("GOOGLE_GENERATIVE_AI_API_KEY");
  });

  test("throws with correct env var name for openrouter", () => {
    expect(() => validateApiKey("openrouter")).toThrow("OPENROUTER_API_KEY");
  });

  test("error message includes provider name", () => {
    expect(() => validateApiKey("anthropic")).toThrow("Missing API key for anthropic");
  });

  test("error message includes how to set the key", () => {
    expect(() => validateApiKey("anthropic")).toThrow("export ANTHROPIC_API_KEY=your-key-here");
  });
});

describe("createModel", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Set dummy API keys to prevent validation errors from provider SDKs
    for (const [, envVar] of Object.entries(ENV_VARS)) {
      savedEnv[envVar] = process.env[envVar];
      process.env[envVar] = "test-dummy-key";
    }
  });

  afterEach(() => {
    for (const [envVar, value] of Object.entries(savedEnv)) {
      if (value !== undefined) {
        process.env[envVar] = value;
      } else {
        delete process.env[envVar];
      }
    }
  });

  test("returns a model object for anthropic", () => {
    const model = createModel("claude-sonnet-4-6", "anthropic");
    expect(model).toBeTruthy();
  });

  test("returns a model object for openai", () => {
    const model = createModel("gpt-4o", "openai");
    expect(model).toBeTruthy();
  });

  test("returns a model object for google", () => {
    const model = createModel("gemini-2.5-flash", "google");
    expect(model).toBeTruthy();
  });

  test("returns a model object for openrouter", () => {
    const model = createModel("anthropic/claude-3-5-sonnet", "openrouter");
    expect(model).toBeTruthy();
  });
});
