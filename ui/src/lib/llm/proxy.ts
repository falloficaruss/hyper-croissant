import { Channel } from "@tauri-apps/api/core";
import type { ChatParams, LLMProviderImpl } from "../../types/llm";
import { llmChat } from "../tauri";

/**
 * Wraps a provider so chat runs through the Rust proxy: the API key stays
 * in the OS keychain and only text deltas reach the WebView.
 */
export function createProxyProvider(inner: LLMProviderImpl): LLMProviderImpl {
  return {
    info: inner.info,
    chat: async (params: ChatParams): Promise<string> => {
      const stream = params.onChunk !== undefined;
      const onChunk = new Channel<string>();
      onChunk.onmessage = (chunk) => params.onChunk?.(chunk);
      return llmChat(
        {
          provider: inner.info.id,
          model: params.model,
          systemPrompt: params.systemPrompt,
          messages: params.messages,
          baseUrl: params.baseUrl,
          stream,
        },
        onChunk,
      );
    },
  };
}
