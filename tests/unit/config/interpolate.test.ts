import { describe, expect, test } from "bun:test";

import { type InterpolationResult, interpolateConfig } from "../../../src/config/interpolate.ts";

describe("interpolateConfig", () => {
  describe("CFG-01: simple ${VAR} resolution", () => {
    test("resolves ${VAR} to env value", () => {
      const result = interpolateConfig({ baseUrl: "${BASE_URL}" }, { BASE_URL: "http://localhost:3000" });
      expect(result.resolved).toEqual({ baseUrl: "http://localhost:3000" });
      expect(result.errors).toHaveLength(0);
    });

    test("resolves multiple different vars", () => {
      const result = interpolateConfig({ host: "${HOST}", port: "${PORT}" }, { HOST: "localhost", PORT: "3000" });
      expect(result.resolved).toEqual({ host: "localhost", port: "3000" });
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("CFG-02: ${VAR:-default} fallback", () => {
    test("uses default when var is unset", () => {
      const result = interpolateConfig({ baseUrl: "${BASE_URL:-http://localhost:3000}" }, {});
      expect(result.resolved).toEqual({
        baseUrl: "http://localhost:3000",
      });
      expect(result.errors).toHaveLength(0);
    });

    test("uses env value when var is set", () => {
      const result = interpolateConfig(
        { baseUrl: "${BASE_URL:-http://localhost:3000}" },
        { BASE_URL: "http://production.com" },
      );
      expect(result.resolved).toEqual({
        baseUrl: "http://production.com",
      });
    });

    test("uses default when var is empty string", () => {
      const result = interpolateConfig({ baseUrl: "${BASE_URL:-http://localhost:3000}" }, { BASE_URL: "" });
      expect(result.resolved).toEqual({
        baseUrl: "http://localhost:3000",
      });
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("CFG-03: ${VAR:?error} required with error", () => {
    test("produces error when var is unset", () => {
      const result = interpolateConfig({ apiKey: "${API_KEY:?API_KEY must be set}" }, {});
      expect(result.errors).toContain("API_KEY: API_KEY must be set");
    });

    test("resolves normally when var is set", () => {
      const result = interpolateConfig({ apiKey: "${API_KEY:?API_KEY must be set}" }, { API_KEY: "secret123" });
      expect(result.resolved).toEqual({ apiKey: "secret123" });
      expect(result.errors).toHaveLength(0);
    });

    test("produces error when var is empty string", () => {
      const result = interpolateConfig({ apiKey: "${API_KEY:?API_KEY must be set}" }, { API_KEY: "" });
      expect(result.errors).toContain("API_KEY: API_KEY must be set");
    });

    test("batches multiple missing required vars", () => {
      const result = interpolateConfig(
        {
          apiKey: "${API_KEY:?API_KEY must be set}",
          secret: "${SECRET:?SECRET is required}",
        },
        {},
      );
      expect(result.errors).toHaveLength(2);
      expect(result.errors).toContain("API_KEY: API_KEY must be set");
      expect(result.errors).toContain("SECRET: SECRET is required");
    });
  });

  describe("CFG-04: deep walk of nested objects and arrays", () => {
    test("walks nested objects", () => {
      const result = interpolateConfig({ tests: [{ baseUrl: "${URL}" }] }, { URL: "http://example.com" });
      const resolved = result.resolved as { tests: { baseUrl: string }[] };
      expect(resolved.tests[0].baseUrl).toBe("http://example.com");
    });

    test("walks arrays", () => {
      const result = interpolateConfig(["${A}", "${B}"], {
        A: "alpha",
        B: "beta",
      });
      expect(result.resolved).toEqual(["alpha", "beta"]);
    });

    test("passes through non-string values unchanged", () => {
      const result = interpolateConfig({ port: 3000, headless: true, empty: null }, {});
      expect(result.resolved).toEqual({
        port: 3000,
        headless: true,
        empty: null,
      });
      expect(result.errors).toHaveLength(0);
    });

    test("template map uses dot-bracket path notation", () => {
      const result = interpolateConfig({ tests: [{ baseUrl: "${URL}" }] }, { URL: "http://example.com" });
      expect(result.templates.get("tests[0].baseUrl")).toBe("${URL}");
    });

    test("deeply nested objects with mixed types", () => {
      const result = interpolateConfig(
        {
          level1: {
            level2: {
              value: "${DEEP}",
              number: 42,
            },
          },
        },
        { DEEP: "found" },
      );
      const resolved = result.resolved as {
        level1: { level2: { value: string; number: number } };
      };
      expect(resolved.level1.level2.value).toBe("found");
      expect(resolved.level1.level2.number).toBe(42);
    });
  });

  describe("bare ${VAR} with unset var is error", () => {
    test("produces error for unset bare var", () => {
      const result = interpolateConfig({ key: "${UNSET}" }, {});
      expect(result.errors).toContain("UNSET: not set");
    });

    test("produces error for empty string bare var", () => {
      const result = interpolateConfig({ key: "${EMPTY}" }, { EMPTY: "" });
      expect(result.errors).toContain("EMPTY: not set");
    });
  });

  describe("escape hatch: $${VAR}", () => {
    test("$${VAR} produces literal ${VAR}", () => {
      const result = interpolateConfig({ key: "$${VAR}" }, { VAR: "value" });
      expect((result.resolved as { key: string }).key).toBe("${VAR}");
      expect(result.errors).toHaveLength(0);
    });

    test("escaped var does not trigger template map", () => {
      const result = interpolateConfig({ key: "$${VAR}" }, {});
      expect(result.templates.size).toBe(0);
    });
  });

  describe("invalid syntax detection", () => {
    test("${} empty produces error", () => {
      const result = interpolateConfig({ key: "${}" }, {});
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes("Invalid"))).toBe(true);
    });

    test("${123} starting with digit produces error", () => {
      const result = interpolateConfig({ key: "${123}" }, {});
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes("Invalid"))).toBe(true);
    });
  });

  describe("partial substitution", () => {
    test("multiple vars in one string all resolve", () => {
      const result = interpolateConfig({ url: "https://${HOST}:${PORT}/api" }, { HOST: "localhost", PORT: "3000" });
      expect((result.resolved as { url: string }).url).toBe("https://localhost:3000/api");
    });

    test("template map records full original string", () => {
      const result = interpolateConfig({ url: "https://${HOST}:${PORT}/api" }, { HOST: "localhost", PORT: "3000" });
      expect(result.templates.get("url")).toBe("https://${HOST}:${PORT}/api");
    });
  });

  describe("batch error reporting", () => {
    test("collects all errors in single pass", () => {
      const result = interpolateConfig(
        {
          a: "${MISSING_A}",
          b: "${MISSING_B:?B is required}",
          c: "${MISSING_C}",
        },
        {},
      );
      expect(result.errors).toHaveLength(3);
      expect(result.errors).toContain("MISSING_A: not set");
      expect(result.errors).toContain("MISSING_B: B is required");
      expect(result.errors).toContain("MISSING_C: not set");
    });
  });

  describe("template map tracking", () => {
    test("records template for simple var", () => {
      const result = interpolateConfig({ baseUrl: "${BASE_URL}" }, { BASE_URL: "http://localhost" });
      expect(result.templates.get("baseUrl")).toBe("${BASE_URL}");
    });

    test("does not record template for literal strings", () => {
      const result = interpolateConfig({ baseUrl: "http://literal.com" }, {});
      expect(result.templates.size).toBe(0);
    });

    test("records templates for nested paths", () => {
      const result = interpolateConfig(
        {
          baseUrl: "${ROOT_URL}",
          tests: [{ baseUrl: "${TEST_URL}", name: "test" }],
        },
        { ROOT_URL: "http://root", TEST_URL: "http://test" },
      );
      expect(result.templates.get("baseUrl")).toBe("${ROOT_URL}");
      expect(result.templates.get("tests[0].baseUrl")).toBe("${TEST_URL}");
      expect(result.templates.has("tests[0].name")).toBe(false);
    });
  });

  describe("return type", () => {
    test("returns InterpolationResult with resolved, templates, errors", () => {
      const result: InterpolationResult = interpolateConfig({}, {});
      expect(result).toHaveProperty("resolved");
      expect(result).toHaveProperty("templates");
      expect(result).toHaveProperty("errors");
      expect(result.templates).toBeInstanceOf(Map);
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });
});
