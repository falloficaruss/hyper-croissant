import type { ChatParams, LLMProviderImpl } from "../../types/llm";

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

interface AnthropicChunk {
  type: "content_block_delta" | "message_stop" | "content_block_start" | "message_start";
  delta?: { text?: string };
  content_block?: { text?: string };
}

async function* streamChat(
  url: string,
  body: object,
  apiKey: string,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${text}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;

      try {
        const json = JSON.parse(trimmed.slice(6)) as AnthropicChunk;
        if (json.type === "content_block_delta" && json.delta?.text) {
          yield json.delta.text;
        }
      } catch {
        // skip malformed chunks
      }
    }
  }
}

async function nonStreamChat(
  url: string,
  body: object,
  apiKey: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${text}`);
  }

  const data = await response.json() as {
    content: { text: string }[];
  };
  return data.content?.[0]?.text ?? "";
}

export function createAnthropicProvider(): LLMProviderImpl {
  return {
    info: {
      id: "anthropic",
      name: "Anthropic",
      requiresApiKey: true,
      models: ["claude-sonnet-4", "claude-3.5-sonnet", "claude-3-haiku"],
      supportsStreaming: true,
    },
    chat: async (params: ChatParams): Promise<string> => {
      const url = `${params.baseUrl ?? "https://api.anthropic.com/v1"}/messages`;

      const systemPrompt = params.systemPrompt;

      // Convert system message + messages into Anthropic format
      const anthropicMessages: AnthropicMessage[] = params.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

      const body: Record<string, unknown> = {
        model: params.model,
        messages: anthropicMessages,
        max_tokens: 4096,
        stream: params.onChunk !== undefined,
      };

      // Anthropic uses a separate system parameter instead of system messages
      if (systemPrompt) {
        body.system = systemPrompt;
      }

      if (!params.apiKey) {
        throw new Error("Anthropic requires an API key");
      }

      if (params.onChunk) {
        let full = "";
        for await (const chunk of streamChat(url, body, params.apiKey, params.signal)) {
          full += chunk;
          params.onChunk(chunk);
        }
        return full;
      }

      return nonStreamChat(url, body, params.apiKey, params.signal);
    },
  };
}
