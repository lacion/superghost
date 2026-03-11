import { YAML } from "bun";
import { ConfigSchema } from "./schema.ts";
import type { Config } from "./types.ts";

/** Error thrown when config loading or validation fails */
export class ConfigLoadError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "ConfigLoadError";
    if (cause) this.cause = cause;
  }
}

/**
 * Load and validate a YAML config file.
 *
 * Three-layer error handling:
 * 1. File existence check (actionable hint)
 * 2. YAML parsing (syntax error with Bun's built-in parser)
 * 3. Zod validation (all issues numbered with field paths)
 *
 * @param filePath - Absolute or relative path to the YAML config
 * @returns Validated Config object with defaults applied
 * @throws ConfigLoadError if file is missing, malformed, or fails validation
 */
export async function loadConfig(filePath: string): Promise<Config> {
  // Layer 1: Read file (produces actionable error if missing)
  const file = Bun.file(filePath);
  let content: string;
  try {
    content = await file.text();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new ConfigLoadError(
        `Config file not found: ${filePath}\n` +
          `  Create a config file or specify a different path:\n` +
          `    superghost --config <path>`,
      );
    }
    throw new ConfigLoadError(
      `Cannot read config file: ${filePath}\n` +
        `  ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }

  // Layer 2: YAML parsing
  let raw: unknown;
  try {
    raw = YAML.parse(content);
  } catch (error) {
    throw new ConfigLoadError(
      `Invalid YAML syntax: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }

  // Layer 3: Zod validation
  // IMPORTANT: Check result.success boolean, NOT instanceof Error (Zod v4 pitfall)
  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map(
        (issue, i) =>
          `  ${i + 1}. ${issue.path.join(".")}: ${issue.message}`,
      )
      .join("\n");
    const count = result.error.issues.length;
    throw new ConfigLoadError(
      `Invalid config (${count} issue${count > 1 ? "s" : ""})\n${issues}`,
    );
  }

  return result.data;
}
