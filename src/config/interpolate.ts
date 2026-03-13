/**
 * Environment variable interpolation engine.
 *
 * Resolves ${VAR}, ${VAR:-default}, and ${VAR:?error} references in a parsed
 * config object. Operates post-YAML-parse on the JS object so YAML-special
 * characters in env values cannot break parsing.
 *
 * Design:
 * - Pure function with injectable env for testability
 * - Deep-walks all nested objects and arrays
 * - Tracks which paths were interpolated (template map) for cache secret prevention
 * - Batches all errors into a single list
 */

export interface InterpolationResult {
  /** The config object with all ${VAR} references resolved */
  resolved: unknown;
  /** Map of dot-bracket path -> original template string for interpolated fields */
  templates: Map<string, string>;
  /** Collected error messages (missing vars, invalid syntax) */
  errors: string[];
}

/**
 * Regex matching env var patterns. Alternation order matters:
 * 1. $${...} escape (must be first to avoid partial match)
 * 2. ${VAR}, ${VAR:-default}, ${VAR:?msg}
 *
 * Capture groups:
 *   1: escaped content (from $${...})
 *   2: variable name
 *   3: modifier (:- or :?)
 *   4: modifier value (default or error message)
 */
const ENV_VAR_PATTERN =
  /\$\$\{([^}]*)\}|\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:[-?])([^}]*))?\}/g;

/**
 * Pattern to detect invalid syntax that the main regex won't match:
 * - ${} (empty braces)
 * - ${123...} (starts with digit)
 */
const INVALID_PATTERN = /\$\{(?:\}|(\d)[^}]*\})/;

/**
 * Interpolate all ${VAR} references in a parsed config object.
 *
 * @param obj - Parsed config object (output of YAML.parse)
 * @param env - Environment variables (defaults to process.env for production)
 * @returns InterpolationResult with resolved object, template map, and errors
 */
export function interpolateConfig(
  obj: unknown,
  env: Record<string, string | undefined> = process.env as Record<
    string,
    string | undefined
  >,
): InterpolationResult {
  const templates = new Map<string, string>();
  const errors: string[] = [];
  const resolved = deepWalk(obj, "", templates, errors, env);
  return { resolved, templates, errors };
}

/**
 * Recursively traverse a value, interpolating all string leaves.
 */
function deepWalk(
  value: unknown,
  path: string,
  templates: Map<string, string>,
  errors: string[],
  env: Record<string, string | undefined>,
): unknown {
  if (typeof value === "string") {
    return interpolateString(value, path, templates, errors, env);
  }
  if (Array.isArray(value)) {
    return value.map((item, i) =>
      deepWalk(item, `${path}[${i}]`, templates, errors, env),
    );
  }
  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      result[key] = deepWalk(val, path ? `${path}.${key}` : key, templates, errors, env);
    }
    return result;
  }
  return value; // numbers, booleans, null pass through
}

/**
 * Interpolate env var references in a single string value.
 */
function interpolateString(
  value: string,
  path: string,
  templates: Map<string, string>,
  errors: string[],
  env: Record<string, string | undefined>,
): string {
  // Check for invalid patterns first
  const invalidMatch = value.match(INVALID_PATTERN);
  if (invalidMatch) {
    errors.push(`Invalid env var syntax at ${path}: found in "${value}"`);
    return value;
  }

  let hasEnvRef = false;

  const result = value.replace(
    ENV_VAR_PATTERN,
    (match, escaped: string | undefined, varName: string | undefined, modifier: string | undefined, modValue: string | undefined) => {
      // Handle escape: $${VAR} -> ${VAR}
      if (escaped !== undefined) {
        return `\${${escaped}}`;
      }

      hasEnvRef = true;
      const envValue = env[varName!];

      // If defined and non-empty, use the env value
      if (envValue !== undefined && envValue !== "") {
        return envValue;
      }

      // Unset or empty
      if (modifier === ":-") {
        return modValue!;
      }
      if (modifier === ":?") {
        errors.push(`${varName}: ${modValue}`);
        return match;
      }

      // Bare ${VAR} with unset value -> error
      errors.push(`${varName}: not set`);
      return match;
    },
  );

  if (hasEnvRef) {
    templates.set(path, value);
  }

  return result;
}
