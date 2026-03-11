import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { CacheManager } from "../../../src/cache/cache-manager.ts";
import type { CachedStep } from "../../../src/cache/types.ts";

describe("CacheManager", () => {
  let cacheDir: string;
  let manager: CacheManager;

  const testCase = "check login";
  const baseUrl = "http://localhost:3000";
  const steps: CachedStep[] = [
    { toolName: "browser_navigate", toolInput: { url: "http://localhost:3000" } },
    { toolName: "browser_click", toolInput: { selector: "#login-btn" } },
  ];
  const diagnostics = {
    model: "claude-sonnet-4-6",
    provider: "anthropic",
    stepCount: 5,
    aiMessage: "Login form is visible and functional",
    durationMs: 8500,
  };

  beforeEach(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), "superghost-cache-test-"));
    manager = new CacheManager(cacheDir);
  });

  afterEach(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  describe("hashKey", () => {
    test("returns a 16-char hex string", () => {
      const hash = CacheManager.hashKey(testCase, baseUrl);
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });

    test("is deterministic: same inputs produce same output", () => {
      const hash1 = CacheManager.hashKey(testCase, baseUrl);
      const hash2 = CacheManager.hashKey(testCase, baseUrl);
      expect(hash1).toBe(hash2);
    });

    test("different baseUrl produces different hash", () => {
      const hash1 = CacheManager.hashKey(testCase, "http://localhost:3000");
      const hash2 = CacheManager.hashKey(testCase, "http://localhost:4000");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("save", () => {
    test("creates the cache directory and writes a JSON file", async () => {
      const nestedDir = join(cacheDir, "nested", "deep");
      const nestedManager = new CacheManager(nestedDir);
      await nestedManager.save(testCase, baseUrl, steps, diagnostics);

      const hash = CacheManager.hashKey(testCase, baseUrl);
      const filePath = join(nestedDir, `${hash}.json`);
      const content = await Bun.file(filePath).text();
      expect(JSON.parse(content)).toBeDefined();
    });

    test("file contains all CacheEntry fields including diagnostics", async () => {
      await manager.save(testCase, baseUrl, steps, diagnostics);

      const hash = CacheManager.hashKey(testCase, baseUrl);
      const filePath = join(cacheDir, `${hash}.json`);
      const content = await Bun.file(filePath).text();
      const entry = JSON.parse(content);

      expect(entry.version).toBe(1);
      expect(entry.testCase).toBe(testCase);
      expect(entry.baseUrl).toBe(baseUrl);
      expect(entry.steps).toEqual(steps);
      expect(entry.model).toBe("claude-sonnet-4-6");
      expect(entry.provider).toBe("anthropic");
      expect(entry.stepCount).toBe(5);
      expect(entry.aiMessage).toBe("Login form is visible and functional");
      expect(entry.durationMs).toBe(8500);
      expect(entry.createdAt).toBeDefined();
      expect(entry.updatedAt).toBeDefined();
    });

    test("preserves createdAt when overwriting existing entry", async () => {
      await manager.save(testCase, baseUrl, steps, diagnostics);

      const hash = CacheManager.hashKey(testCase, baseUrl);
      const filePath = join(cacheDir, `${hash}.json`);
      const firstContent = JSON.parse(await Bun.file(filePath).text());
      const originalCreatedAt = firstContent.createdAt;

      // Small delay to ensure timestamps differ
      await Bun.sleep(10);

      await manager.save(testCase, baseUrl, steps, {
        ...diagnostics,
        durationMs: 9000,
      });

      const updatedContent = JSON.parse(await Bun.file(filePath).text());
      expect(updatedContent.createdAt).toBe(originalCreatedAt);
      expect(updatedContent.durationMs).toBe(9000);
    });
  });

  describe("load", () => {
    test("returns CacheEntry for saved file", async () => {
      await manager.save(testCase, baseUrl, steps, diagnostics);
      const entry = await manager.load(testCase, baseUrl);

      expect(entry).not.toBeNull();
      expect(entry!.testCase).toBe(testCase);
      expect(entry!.baseUrl).toBe(baseUrl);
      expect(entry!.steps).toEqual(steps);
      expect(entry!.model).toBe("claude-sonnet-4-6");
    });

    test("returns null for nonexistent hash", async () => {
      const entry = await manager.load("nonexistent test", "http://nowhere.com");
      expect(entry).toBeNull();
    });

    test("returns null for corrupted JSON", async () => {
      const hash = CacheManager.hashKey(testCase, baseUrl);
      const filePath = join(cacheDir, `${hash}.json`);
      await Bun.write(filePath, "this is not valid json {{{");

      const entry = await manager.load(testCase, baseUrl);
      expect(entry).toBeNull();
    });
  });

  describe("delete", () => {
    test("removes the cache file", async () => {
      await manager.save(testCase, baseUrl, steps, diagnostics);
      await manager.delete(testCase, baseUrl);

      const entry = await manager.load(testCase, baseUrl);
      expect(entry).toBeNull();
    });

    test("does not throw when file does not exist", async () => {
      // Should not throw
      await manager.delete("nonexistent", "http://nowhere.com");
    });
  });
});
