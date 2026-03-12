import { describe, expect, test } from "bun:test";

import { buildSystemPrompt } from "../../../src/agent/prompt.ts";

describe("buildSystemPrompt", () => {
  const testCase = "verify that the login form accepts valid credentials";
  const baseUrl = "https://app.example.com";

  test("contains the test case description", () => {
    const prompt = buildSystemPrompt(testCase, baseUrl);
    expect(prompt).toContain(testCase);
  });

  test("contains the base URL", () => {
    const prompt = buildSystemPrompt(testCase, baseUrl);
    expect(prompt).toContain(baseUrl);
  });

  test("includes browser tool instructions", () => {
    const prompt = buildSystemPrompt(testCase, baseUrl);
    expect(prompt).toContain("browser_snapshot");
    expect(prompt).toContain("browser_click");
    expect(prompt).toContain("browser_type");
  });

  test("includes API tool instructions", () => {
    const prompt = buildSystemPrompt(testCase, baseUrl);
    expect(prompt).toContain("curl_request");
  });

  test("appends global context when provided", () => {
    const globalContext = "The app uses shadow DOM for all components";
    const prompt = buildSystemPrompt(testCase, baseUrl, globalContext);
    expect(prompt).toContain("Additional context");
    expect(prompt).toContain(globalContext);
  });

  test("appends per-test context when provided", () => {
    const testContext = "Use credentials: admin / password123";
    const prompt = buildSystemPrompt(testCase, baseUrl, undefined, testContext);
    expect(prompt).toContain("Test-specific context");
    expect(prompt).toContain(testContext);
  });

  test("appends both global and per-test context (global first)", () => {
    const globalContext = "Shadow DOM enabled";
    const testContext = "Login as admin";
    const prompt = buildSystemPrompt(testCase, baseUrl, globalContext, testContext);

    const globalIdx = prompt.indexOf(globalContext);
    const testIdx = prompt.indexOf(testContext);

    expect(globalIdx).toBeGreaterThan(-1);
    expect(testIdx).toBeGreaterThan(-1);
    expect(globalIdx).toBeLessThan(testIdx);
  });

  test("omits context section when no context provided", () => {
    const prompt = buildSystemPrompt(testCase, baseUrl);
    expect(prompt).not.toContain("Additional context");
    expect(prompt).not.toContain("Test-specific context");
  });
});
