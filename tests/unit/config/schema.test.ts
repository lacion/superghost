import { describe, expect, test } from "bun:test";

import { ConfigSchema, TestCaseSchema } from "../../../src/config/schema.ts";

describe("TestCaseSchema", () => {
  test("requires name field (min 1 char)", () => {
    const result = TestCaseSchema.safeParse({ case: "do something" });
    expect(result.success).toBe(false);
  });

  test("requires case field (min 1 char)", () => {
    const result = TestCaseSchema.safeParse({ name: "Test Name" });
    expect(result.success).toBe(false);
  });

  test("rejects empty name", () => {
    const result = TestCaseSchema.safeParse({ name: "", case: "do something" });
    expect(result.success).toBe(false);
  });

  test("rejects empty case", () => {
    const result = TestCaseSchema.safeParse({ name: "Test", case: "" });
    expect(result.success).toBe(false);
  });

  test("accepts valid test case with name and case only", () => {
    const result = TestCaseSchema.safeParse({
      name: "Login Flow",
      case: "check that login works",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Login Flow");
      expect(result.data.case).toBe("check that login works");
    }
  });

  test("accepts optional baseUrl (must be valid URL)", () => {
    const result = TestCaseSchema.safeParse({
      name: "Test",
      case: "do something",
      baseUrl: "https://example.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.baseUrl).toBe("https://example.com");
    }
  });

  test("rejects invalid baseUrl", () => {
    const result = TestCaseSchema.safeParse({
      name: "Test",
      case: "do something",
      baseUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  test("accepts optional positive timeout", () => {
    const result = TestCaseSchema.safeParse({
      name: "Test",
      case: "do something",
      timeout: 30000,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timeout).toBe(30000);
    }
  });

  test("rejects non-positive timeout", () => {
    const result = TestCaseSchema.safeParse({
      name: "Test",
      case: "do something",
      timeout: -5,
    });
    expect(result.success).toBe(false);
  });
});

describe("ConfigSchema", () => {
  const validMinimalConfig = {
    tests: [{ name: "Test", case: "do something" }],
  };

  test("parses valid config with all fields populated", () => {
    const fullConfig = {
      baseUrl: "https://example.com",
      browser: "firefox",
      headless: false,
      timeout: 30000,
      maxAttempts: 5,
      model: "gpt-4o",
      modelProvider: "openai",
      cacheDir: ".my-cache",
      recursionLimit: 200,
      tests: [
        { name: "Login", case: "check login", baseUrl: "https://app.example.com", timeout: 120000 },
        { name: "Dashboard", case: "verify dashboard" },
      ],
    };

    const result = ConfigSchema.safeParse(fullConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.browser).toBe("firefox");
      expect(result.data.headless).toBe(false);
      expect(result.data.timeout).toBe(30000);
      expect(result.data.maxAttempts).toBe(5);
      expect(result.data.model).toBe("gpt-4o");
      expect(result.data.modelProvider).toBe("openai");
      expect(result.data.cacheDir).toBe(".my-cache");
      expect(result.data.recursionLimit).toBe(200);
      expect(result.data.tests).toHaveLength(2);
    }
  });

  test("applies correct defaults when fields omitted", () => {
    const result = ConfigSchema.safeParse(validMinimalConfig);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.browser).toBe("chromium");
      expect(result.data.headless).toBe(true);
      expect(result.data.timeout).toBe(60000);
      expect(result.data.maxAttempts).toBe(3);
      expect(result.data.model).toBe("claude-sonnet-4-6");
      expect(result.data.modelProvider).toBe("anthropic");
      expect(result.data.cacheDir).toBe(".superghost-cache");
      expect(result.data.recursionLimit).toBe(500);
    }
  });

  test("requires at least 1 test in tests array", () => {
    const result = ConfigSchema.safeParse({ tests: [] });
    expect(result.success).toBe(false);
  });

  test("rejects missing tests array entirely", () => {
    const result = ConfigSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  test("rejects invalid browser enum values", () => {
    const result = ConfigSchema.safeParse({
      ...validMinimalConfig,
      browser: "safari",
    });
    expect(result.success).toBe(false);
  });

  test("rejects non-positive timeout", () => {
    const result = ConfigSchema.safeParse({
      ...validMinimalConfig,
      timeout: 0,
    });
    expect(result.success).toBe(false);
  });

  test("rejects non-positive maxAttempts", () => {
    const result = ConfigSchema.safeParse({
      ...validMinimalConfig,
      maxAttempts: 0,
    });
    expect(result.success).toBe(false);
  });

  test("rejects maxAttempts > 10", () => {
    const result = ConfigSchema.safeParse({
      ...validMinimalConfig,
      maxAttempts: 11,
    });
    expect(result.success).toBe(false);
  });

  test("accepts optional global baseUrl (must be valid URL)", () => {
    const result = ConfigSchema.safeParse({
      ...validMinimalConfig,
      baseUrl: "https://example.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.baseUrl).toBe("https://example.com");
    }
  });

  test("rejects invalid global baseUrl", () => {
    const result = ConfigSchema.safeParse({
      ...validMinimalConfig,
      baseUrl: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  test("recursionLimit is validated as positive integer", () => {
    const negativeResult = ConfigSchema.safeParse({
      ...validMinimalConfig,
      recursionLimit: -1,
    });
    expect(negativeResult.success).toBe(false);

    const floatResult = ConfigSchema.safeParse({
      ...validMinimalConfig,
      recursionLimit: 3.5,
    });
    expect(floatResult.success).toBe(false);
  });

  test("per-test baseUrl and timeout override global values", () => {
    const config = {
      baseUrl: "https://global.com",
      timeout: 60000,
      tests: [
        {
          name: "Override Test",
          case: "check override",
          baseUrl: "https://override.com",
          timeout: 120000,
        },
      ],
    };
    const result = ConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.baseUrl).toBe("https://global.com");
      expect(result.data.timeout).toBe(60000);
      expect(result.data.tests[0].baseUrl).toBe("https://override.com");
      expect(result.data.tests[0].timeout).toBe(120000);
    }
  });
});
