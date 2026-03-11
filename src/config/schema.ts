import { z } from "zod";

/** Schema for a single test case in the configuration */
export const TestCaseSchema = z.object({
  name: z.string().min(1, "Test name cannot be empty"),
  case: z.string().min(1, "Test case description cannot be empty"),
  baseUrl: z.string().url().optional(),
  timeout: z.number().positive().optional(),
  type: z.enum(["browser", "api"]).default("browser"),
  context: z.string().optional(),
});

/** Schema for the full SuperGhost configuration file */
export const ConfigSchema = z.object({
  baseUrl: z.string().url().optional(),
  browser: z.enum(["chromium", "firefox", "webkit"]).default("chromium"),
  headless: z.boolean().default(true),
  timeout: z.number().positive().default(60_000),
  maxAttempts: z.number().int().positive().max(10).default(3),
  model: z.string().default("claude-sonnet-4-6"),
  modelProvider: z.string().default("anthropic"),
  cacheDir: z.string().default(".superghost-cache"),
  recursionLimit: z.number().int().positive().default(500),
  context: z.string().optional(),
  tests: z.array(TestCaseSchema).min(1, "At least one test case is required"),
});
