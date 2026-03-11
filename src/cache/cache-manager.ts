import { join } from "node:path";
import { mkdir, rename } from "node:fs/promises";
import type { CacheEntry, CachedStep } from "./types.ts";

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
   */
  static hashKey(testCase: string, baseUrl: string): string {
    const input = `${testCase}|${baseUrl}`;
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
  ): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });

    const hash = CacheManager.hashKey(testCase, baseUrl);
    const now = new Date().toISOString();

    // Load existing entry to preserve createdAt
    const existing = await this.load(testCase, baseUrl);

    const entry: CacheEntry = {
      version: 1,
      testCase,
      baseUrl,
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

  /**
   * Load a cache entry for the given test case.
   * Returns null if the file does not exist or contains invalid JSON.
   */
  async load(testCase: string, baseUrl: string): Promise<CacheEntry | null> {
    const hash = CacheManager.hashKey(testCase, baseUrl);
    const filePath = join(this.cacheDir, `${hash}.json`);

    try {
      return await Bun.file(filePath).json() as CacheEntry;
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
}
