import type { ChatParams, LLMProviderImpl } from "../../types/llm";
import { nonStreamChat, streamChat } from "./openaiCompat";

const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function createGeminiProvider(): LLMProviderImpl {
  return {
    info: {
      id: "gemini",
      name: "Gemini",
      requiresApiKey: true,
      models: ["gemini-3.6-flash", "gemini-2.5-flash", "gemini-2.5-pro"],
      supportsStreaming: true,
    },
    chat: async (params: ChatParams): Promise<string> => {
      const base = (params.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
      const url = `${base}/chat/completions`;

      const messages: OpenAIMessage[] = [
        { role: "system", content: params.systemPrompt },
        ...params.messages.map((m) => ({ role: m.role, content: m.content })),
      ];

      const body: Record<string, unknown> = {
        model: params.model,
        messages,
        stream: params.onChunk !== undefined,
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (params.apiKey) {
        headers["Authorization"] = `Bearer ${params.apiKey}`;
      }

      if (params.onChunk) {
        let full = "";
        for await (const chunk of streamChat(
          url,
          body,
          headers,
          params.signal,
          "Gemini",
        )) {
          full += chunk;
          params.onChunk(chunk);
        }
        return full;
      }

      return nonStreamChat(url, body, headers, params.signal, "Gemini");
    },
  };
}
