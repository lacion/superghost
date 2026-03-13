import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CacheManager } from "../../../src/cache/cache-manager.ts";
import { type CachedStep } from "../../../src/cache/types.ts";

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

      expect(entry.version).toBe(2);
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
      expect(entry?.testCase).toBe(testCase);
      expect(entry?.baseUrl).toBe(baseUrl);
      expect(entry?.steps).toEqual(steps);
      expect(entry?.model).toBe("claude-sonnet-4-6");
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

  describe("hashKey normalization", () => {
    const url = "http://localhost:3000";

    test("whitespace-collapsed strings produce same hash (tabs vs spaces)", () => {
      const hashTab = CacheManager.hashKey("check\tlogin\tform", url);
      const hashSpace = CacheManager.hashKey("check login form", url);
      expect(hashTab).toBe(hashSpace);
    });

    test("whitespace-collapsed strings produce same hash (newlines vs spaces)", () => {
      const hashNewline = CacheManager.hashKey("check\nlogin\nform", url);
      const hashSpace = CacheManager.hashKey("check login form", url);
      expect(hashNewline).toBe(hashSpace);
    });

    test("whitespace-collapsed strings produce same hash (multiple spaces)", () => {
      const hashMulti = CacheManager.hashKey("check   login   form", url);
      const hashSingle = CacheManager.hashKey("check login form", url);
      expect(hashMulti).toBe(hashSingle);
    });

    test("Unicode NFD and NFC produce same hash", () => {
      // "cafe\u0301" (NFD) vs "caf\u00e9" (NFC) - both represent "cafe" with accent
      const hashNFD = CacheManager.hashKey("caf\u0065\u0301", url);
      const hashNFC = CacheManager.hashKey("caf\u00e9", url);
      expect(hashNFD).toBe(hashNFC);
    });

    test("different letter casing produces DIFFERENT hash (case-preserving)", () => {
      const hashUpper = CacheManager.hashKey("Check Login", url);
      const hashLower = CacheManager.hashKey("check login", url);
      expect(hashUpper).not.toBe(hashLower);
    });

    test("baseUrl with/without trailing slash produces same hash", () => {
      const tc = "check login";
      const hashNoSlash = CacheManager.hashKey(tc, "http://localhost:3000");
      const hashSlash = CacheManager.hashKey(tc, "http://localhost:3000/");
      expect(hashNoSlash).toBe(hashSlash);
    });

    test("baseUrl hostname casing produces same hash", () => {
      const tc = "check login";
      const hashUpper = CacheManager.hashKey(tc, "http://LOCALHOST:3000");
      const hashLower = CacheManager.hashKey(tc, "http://localhost:3000");
      expect(hashUpper).toBe(hashLower);
    });
  });

  describe("v2 prefix", () => {
    test("v2 hash differs from v1 hash for same inputs", () => {
      // v1 hash (captured before normalization changes): 6185fa0005029c5c
      // After v2 prefix, the hash MUST change.
      const V1_HASH = "6185fa0005029c5c";
      const currentHash = CacheManager.hashKey("check login", "http://localhost:3000");
      expect(currentHash).not.toBe(V1_HASH);
    });
  });

  describe("save version", () => {
    test("save() writes version 2 in the cache file", async () => {
      await manager.save(testCase, baseUrl, steps, diagnostics);

      const hash = CacheManager.hashKey(testCase, baseUrl);
      const filePath = join(cacheDir, `${hash}.json`);
      const content = await Bun.file(filePath).text();
      const entry = JSON.parse(content);

      expect(entry.version).toBe(2);
    });
  });

  describe("hashKey with templates", () => {
    test("with template params produces different hash than without", () => {
      const hashWithout = CacheManager.hashKey(testCase, baseUrl);
      const hashWith = CacheManager.hashKey(testCase, baseUrl, "${TEST_CASE}", "${BASE_URL}");
      expect(hashWith).not.toBe(hashWithout);
    });

    test("same template but different resolved produces different hash", () => {
      const hash1 = CacheManager.hashKey("value-a", baseUrl, "${VAR}", "${BASE_URL}");
      const hash2 = CacheManager.hashKey("value-b", baseUrl, "${VAR}", "${BASE_URL}");
      expect(hash1).not.toBe(hash2);
    });

    test("same resolved but different template produces different hash", () => {
      const hash1 = CacheManager.hashKey(testCase, baseUrl, "${VAR_A}", "${BASE_URL}");
      const hash2 = CacheManager.hashKey(testCase, baseUrl, "${VAR_B}", "${BASE_URL}");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("save with templates", () => {
    test("stores template form for interpolated fields", async () => {
      const templates = new Map<string, string>();
      templates.set("baseUrl", "${BASE_URL}");
      templates.set("tests[0].case", "${TEST_CASE}");

      await manager.save(testCase, baseUrl, steps, diagnostics, templates, 0);

      // Read the saved file - it should contain template form for baseUrl
      const hash = CacheManager.hashKey(testCase, baseUrl, templates.get("tests[0].case"), templates.get("baseUrl"));
      const filePath = join(cacheDir, `${hash}.json`);
      const content = JSON.parse(await Bun.file(filePath).text());

      expect(content.baseUrl).toBe("${BASE_URL}");
      expect(content.testCase).toBe("${TEST_CASE}");
    });

    test("without templates behaves identically to current", async () => {
      await manager.save(testCase, baseUrl, steps, diagnostics);

      const hash = CacheManager.hashKey(testCase, baseUrl);
      const filePath = join(cacheDir, `${hash}.json`);
      const content = JSON.parse(await Bun.file(filePath).text());

      expect(content.testCase).toBe(testCase);
      expect(content.baseUrl).toBe(baseUrl);
    });
  });

  describe("migrateV1Cache", () => {
    test("deletes files with version 1 and preserves files with version 2", async () => {
      // Create a v1 cache file
      const v1File = join(cacheDir, "v1entry.json");
      await Bun.write(
        v1File,
        JSON.stringify({
          version: 1,
          testCase: "old test",
          baseUrl: "http://localhost:3000",
          steps: [],
          model: "test",
          provider: "test",
          stepCount: 0,
          aiMessage: "test",
          durationMs: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      );

      // Create a v2 cache file
      const v2File = join(cacheDir, "v2entry.json");
      await Bun.write(
        v2File,
        JSON.stringify({
          version: 2,
          testCase: "new test",
          baseUrl: "http://localhost:3000",
          steps: [],
          model: "test",
          provider: "test",
          stepCount: 0,
          aiMessage: "test",
          durationMs: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      );

      await manager.migrateV1Cache();

      const files = await readdir(cacheDir);
      expect(files).not.toContain("v1entry.json");
      expect(files).toContain("v2entry.json");
    });

    test("handles nonexistent cache directory gracefully", async () => {
      const nonexistentDir = join(cacheDir, "does-not-exist");
      const nonexistentManager = new CacheManager(nonexistentDir);

      // Should not throw
      await nonexistentManager.migrateV1Cache();
    });
  });
});
