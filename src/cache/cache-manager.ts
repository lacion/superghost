import { mkdir, readdir, rename } from "node:fs/promises";
import { join } from "node:path";

import { type CachedStep, type CacheEntry } from "./types.ts";

/**
 * Manages file-based cache entries for test step recordings.
 * Each entry is a JSON file keyed by a deterministic SHA-256 hash of (testCase + baseUrl).
 * Uses atomic write-then-rename to prevent corrupted cache files.
 */
export class CacheManager {
  private readonly cacheDir: string;

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir;
  }

  /**
   * Generate a deterministic 16-char hex hash key.
   * Uses Bun-native CryptoHasher for SHA-256 hashing.
   *
   * Normalization pipeline (v2):
   * 1. Unicode NFC normalization + whitespace collapse (case-preserving)
   * 2. URL normalization (lowercase hostname, strip trailing slash)
   * 3. Version-prefixed input string ("v2|...")
   */
  static hashKey(testCase: string, baseUrl: string, templateTestCase?: string, templateBaseUrl?: string): string {
    // Step 1: Unicode NFC + whitespace collapse (case-preserving per user decision)
    const normalizedCase = testCase.normalize("NFC").replace(/\s+/g, " ").trim();

    // Step 2: URL normalization (lowercase hostname, strip trailing slash)
    let normalizedUrl: string;
    try {
      const url = new URL(baseUrl);
      // new URL() lowercases hostname and strips default ports
      // Manually strip trailing slash(es)
      normalizedUrl = url.href.replace(/\/+$/, "");
    } catch {
      // Fallback for non-URL values (defensive)
      normalizedUrl = baseUrl.replace(/\/+$/, "").toLowerCase();
    }

    // Step 3: Version-prefixed input (includes template forms when provided for cache invalidation)
    const input = templateTestCase
      ? `v2|${templateTestCase}|${normalizedCase}|${templateBaseUrl ?? ""}|${normalizedUrl}`
      : `v2|${normalizedCase}|${normalizedUrl}`;
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(input);
    return hasher.digest("hex").slice(0, 16);
  }

  /**
   * Save a cache entry for the given test case.
   * Creates the cache directory if it does not exist.
   * Uses atomic write (tmp file + rename) to prevent corruption.
   * Preserves createdAt from existing entry when updating.
   */
  async save(
    testCase: string,
    baseUrl: string,
    steps: CachedStep[],
    diagnostics: {
      model: string;
      provider: string;
      stepCount: number;
      aiMessage: string;
      durationMs: number;
    },
    templates?: Map<string, string>,
    testIndex?: number,
  ): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });

    // Determine template forms for cache storage
    const templateTestCase = testIndex !== undefined ? templates?.get(`tests[${testIndex}].case`) : undefined;
    const templateBaseUrl =
      testIndex !== undefined
        ? (templates?.get(`tests[${testIndex}].baseUrl`) ?? templates?.get("baseUrl"))
        : templates?.get("baseUrl");

    const hash = CacheManager.hashKey(testCase, baseUrl, templateTestCase, templateBaseUrl);
    const now = new Date().toISOString();

    // Load existing entry to preserve createdAt
    const existing = await this.loadByHash(hash);

    // Store template form instead of resolved secrets for interpolated fields
    const storedTestCase = templateTestCase ?? testCase;
    const storedBaseUrl = templateBaseUrl ?? baseUrl;

    const entry: CacheEntry = {
      version: 2,
      testCase: storedTestCase,
      baseUrl: storedBaseUrl,
      steps,
      model: diagnostics.model,
      provider: diagnostics.provider,
      stepCount: diagnostics.stepCount,
      aiMessage: diagnostics.aiMessage,
      durationMs: diagnostics.durationMs,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    const filePath = join(this.cacheDir, `${hash}.json`);
    const tmpPath = `${filePath}.tmp`;

    // Atomic write: write to tmp file, then rename
    await Bun.write(tmpPath, JSON.stringify(entry, null, 2));
    await rename(tmpPath, filePath);
  }

  /** Load a cache entry by pre-computed hash key */
  private async loadByHash(hash: string): Promise<CacheEntry | null> {
    const filePath = join(this.cacheDir, `${hash}.json`);
    try {
      return (await Bun.file(filePath).json()) as CacheEntry;
    } catch {
      return null;
    }
  }

  /**
   * Load a cache entry for the given test case.
   * Returns null if the file does not exist or contains invalid JSON.
   */
  async load(testCase: string, baseUrl: string): Promise<CacheEntry | null> {
    const hash = CacheManager.hashKey(testCase, baseUrl);
    const filePath = join(this.cacheDir, `${hash}.json`);

    try {
      return (await Bun.file(filePath).json()) as CacheEntry;
    } catch {
      return null;
    }
  }

  /**
   * Delete a cache entry for the given test case.
   * No-op if the file does not exist.
   */
  async delete(testCase: string, baseUrl: string): Promise<void> {
    const hash = CacheManager.hashKey(testCase, baseUrl);
    const filePath = join(this.cacheDir, `${hash}.json`);

    try {
      await Bun.file(filePath).delete();
    } catch {
      // No-op if file doesn't exist
    }
  }

  /**
   * Migrate v1 cache entries by deleting them.
   * Scans the cache directory for JSON files with version 1 and removes them.
   * v2 entries are preserved. Handles missing/empty cache directories gracefully.
   */
  async migrateV1Cache(): Promise<void> {
    try {
      const files = await readdir(this.cacheDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const filePath = join(this.cacheDir, file);
          const entry = await Bun.file(filePath).json();
          if (entry?.version === 1) {
            await Bun.file(filePath).delete();
          }
        } catch {
          // Skip corrupted files silently
        }
      }
    } catch {
      // Cache dir doesn't exist yet -- nothing to migrate
    }
  }
}
