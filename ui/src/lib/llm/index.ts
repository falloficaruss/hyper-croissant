import type { LLMConfig, LLMProviderImpl } from "../../types/llm";
import { createOpenAIProvider } from "./openai";
import { createAnthropicProvider } from "./anthropic";
import { createOllamaProvider } from "./ollama";
import { createProxyProvider } from "./proxy";

const providerFactories: Record<string, () => LLMProviderImpl> = {
  openai: createOpenAIProvider,
  anthropic: createAnthropicProvider,
  ollama: createOllamaProvider,
};

export function getProvider(id: string): LLMProviderImpl | undefined {
  const factory = providerFactories[id];
  if (!factory) return undefined;
  return factory();
}

export function getProviderOrThrow(id: string): LLMProviderImpl {
  const provider = getProvider(id);
  if (!provider) {
    throw new Error(`Unknown LLM provider: ${id}`);
  }
  return provider;
}

/**
 * Resolves the provider for a config, routing through the Rust proxy
 * (OS keychain keys) when `useProxy` is enabled.
 */
export function resolveProvider(config: LLMConfig): LLMProviderImpl {
  const provider = getProviderOrThrow(config.provider);
  return config.useProxy ? createProxyProvider(provider) : provider;
}

export { createOpenAIProvider } from "./openai";
export { createAnthropicProvider } from "./anthropic";
export { createOllamaProvider } from "./ollama";
