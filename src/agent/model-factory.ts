import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";

/** Supported LLM provider names */
export type ProviderName = "anthropic" | "openai" | "google" | "openrouter";

/** Environment variable names for each provider's API key */
export const ENV_VARS: Record<ProviderName, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

// Auto-inference rules: model name prefix -> provider
const MODEL_PREFIX_MAP: Array<[RegExp, ProviderName]> = [
  [/^claude-/, "anthropic"],
  [/^gpt-/, "openai"],
  [/^o\d/, "openai"],
  [/^gemini-/, "google"],
  [/\//, "openrouter"],
];

/**
 * Infer the LLM provider from a model name string.
 * Falls back to "anthropic" if no pattern matches.
 */
export function inferProvider(modelName: string): ProviderName {
  for (const [pattern, provider] of MODEL_PREFIX_MAP) {
    if (pattern.test(modelName)) return provider;
  }
  return "anthropic";
}

/**
 * Validate that the API key environment variable is set for the given provider.
 * Throws a descriptive error if the key is missing.
 */
export function validateApiKey(provider: ProviderName): void {
  const envVar = ENV_VARS[provider];
  if (!Bun.env[envVar]) {
    throw new Error(
      `Missing API key for ${provider}.\n` +
        `  Set the ${envVar} environment variable:\n` +
        `    export ${envVar}=your-key-here\n` +
        `  Or add it to your .env file.`,
    );
  }
}

/**
 * Create an AI SDK model instance for the given model name and provider.
 */
export function createModel(modelName: string, providerName: ProviderName) {
  switch (providerName) {
    case "anthropic":
      return anthropic(modelName);
    case "openai":
      return openai(modelName);
    case "google":
      return google(modelName);
    case "openrouter": {
      const openrouter = createOpenRouter({
        apiKey: Bun.env.OPENROUTER_API_KEY!,
      });
      return openrouter.chat(modelName);
    }
  }
}
