import type { LLMProviderImpl } from "../../types/llm";
import { createOpenAIProvider } from "./openai";
import { createAnthropicProvider } from "./anthropic";
import { createOllamaProvider } from "./ollama";

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

export { createOpenAIProvider } from "./openai";
export { createAnthropicProvider } from "./anthropic";
export { createOllamaProvider } from "./ollama";
